// Anexos do card (item 129 + 203). Card COM empresa: tudo (imagem, vídeo, documento) vai direto do navegador ao Drive (drive.ts).
// Card SEM empresa: fica no Supabase como antes, mas vídeo não entra (vídeo nunca mora no Supabase).
import { Upload } from "tus-js-client";
import { supabase } from "@/lib/supabase/cliente";
import { apagarQuandoChegar, enviarEmSegundoPlano } from "./envios";
import { apagarAnexoDrive, enviarParaDrive, ordenarAnexosDrive, recarregarOcasioes, registrarProgresso } from "./drive";
import type { Tarefa } from "./tipos";

type Arquivos = Tarefa["arquivos"];
type LinhaArquivo = { id: string; tarefa_id: string; caminho: string | null; drive_id?: string | null; ordem?: number; papel?: "anexo" | "capa"; nome: string; tipo: NonNullable<Arquivos[number]["tipo"]>; drive_link?: string | null; removido_em?: string | null; aviso?: string | null };
type Cliente = ReturnType<typeof supabase>;
const BALDE = "arquivos";
const ATE_6_MB = 6 * 1024 * 1024;

/** Erro com mensagem já em português para a tela mostrar. */
export class ErroAnexo extends Error {}

/** Até 6 MB sobe de uma vez; acima disso, envio em partes de 6 MB (TUS) que aguenta arquivo grande e retoma se a rede cair. */
async function subir(sb: Cliente, caminho: string, f: File) {
  if (f.size <= ATE_6_MB) {
    const { error } = await sb.storage.from(BALDE).upload(caminho, f, { contentType: f.type });
    if (error) throw error;
    return;
  }
  const { data } = await sb.auth.getSession();
  await new Promise<void>((ok, nao) => new Upload(f, {
    endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(".supabase.co", ".storage.supabase.co")}/storage/v1/upload/resumable`,
    headers: { authorization: `Bearer ${data.session?.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    retryDelays: [0, 3000, 5000, 10000],
    chunkSize: ATE_6_MB,
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: { bucketName: BALDE, objectName: caminho, contentType: f.type, cacheControl: "3600" },
    onError: nao,
    onSuccess: () => ok(),
  }).start());
}

/** Anexos de todas as tarefas. Supabase: endereço assinado (balde privado, 1 hora). Drive: sem endereço; abre no player do Drive pelo `driveId`.
    null = a leitura falhou (M10): quem chama mantém o que já tinha, em vez de mostrar todo card sem anexo. */
export async function carregarAnexos(sb: Cliente): Promise<Map<string, Arquivos> | null> {
  const porTarefa = new Map<string, Arquivos>();
  const { data, error } = await sb.from("arquivos").select("*").not("tarefa_id", "is", null).order("ordem").order("created_at");
  if (error) return null;
  if (!data?.length) return porTarefa;
  const linhas = data as LinhaArquivo[];
  const guardados = linhas.filter((a) => a.caminho && !a.removido_em).map((a) => a.caminho!);
  const { data: urls } = guardados.length ? await sb.storage.from(BALDE).createSignedUrls(guardados, 3600) : { data: [] };
  const url = new Map(urls?.map((u) => [u.path, u.signedUrl]));
  for (const a of linhas) {
    const base = { id: a.id, nome: a.nome, tipo: a.tipo, ordem: a.ordem ?? 0, papel: a.papel ?? "anexo", aviso: a.aviso ?? undefined, driveLink: a.drive_link ?? undefined };
    const arq: Arquivos[number] = a.drive_id ? { ...base, driveId: a.drive_id }
      : a.removido_em ? { ...base, caminho: a.caminho ?? undefined, removido: true }
      : { ...base, caminho: a.caminho ?? undefined, url: (a.caminho ? url.get(a.caminho) : undefined) ?? undefined };
    porTarefa.set(a.tarefa_id, [...(porTarefa.get(a.tarefa_id) ?? []), arq]);
  }
  return porTarefa;
}

/** "original" só nasce no servidor (270): o que sobe agora é anexo ou capa. */
const papelNoEnvio = (a: Arquivos[number]) => (a.papel === "capa" ? "capa" : "anexo");
const chaveDe = (a: Arquivos[number]) => a.id ?? a.caminho ?? a.driveId;

/** Apaga do Drive, do Storage e da tabela os anexos que saíram da ficha. */
async function apagarAnexos(sb: Cliente, saiu: Arquivos) {
  const saiuSupabase = saiu.flatMap((a) => (a.caminho && !a.driveId ? [a.caminho] : []));
  for (const a of saiu) if (a.driveId && a.id) await apagarAnexoDrive(a.id); // lixeira do Google + linha
  if (saiuSupabase.length) {
    const { error: erroObjeto } = await sb.storage.from(BALDE).remove(saiuSupabase); // objeto primeiro: se falhar, a linha fica e dá para tentar de novo
    if (erroObjeto) throw erroObjeto;
    const { error } = await sb.from("arquivos").delete().in("caminho", saiuSupabase);
    if (error) throw error;
  }
}

/** M8: arquivo que já está subindo (por um salvar anterior que ainda não acabou) não sobe de novo: o 2º salvar espera o mesmo envio. */
const emEnvio = new WeakMap<File, Promise<Arquivos[number] | undefined>>();

/** Deixa Drive, Storage e tabela iguais ao que a ficha mostra: sobe o que é novo, apaga o que saiu, guarda a ordem do carrossel. Devolve a lista já com id e endereço.
    M14: o que saiu só se apaga DEPOIS de o novo subir (se o envio falha, nada some). O banco aceita uma capa por card, então a capa velha:
    no Drive, quem tira é o SERVIDOR ao confirmar a nova (substitui_arquivo_id: confere a nova antes e não manda a pasta para a lixeira);
    no Supabase (card sem empresa), sai logo antes de a nova ser registrada. */
export async function sincronizarAnexos(sb: Cliente, tarefaId: string, empresaId: string, pessoa: string | undefined, antes: Arquivos, agora: Arquivos, aoProgredir?: (nome: string, fracao: number) => void): Promise<Arquivos> {
  const ficam = new Set(agora.map(chaveDe));
  const saiu = antes.filter((a) => !ficam.has(chaveDe(a)));
  const capaNova = agora.some((a) => a.pendente && a.papel === "capa");
  const capaDrive = capaNova ? saiu.find((a) => a.papel === "capa" && a.driveId && a.id) : undefined;
  const capaSupabase = capaNova ? saiu.filter((a) => a.papel === "capa" && !a.driveId) : [];
  let capaLiberada: Promise<void> | undefined;
  const liberarCapa = () => (capaLiberada ??= apagarAnexos(sb, capaSupabase));
  const temNovo = agora.some((a) => a.pendente);
  // r2 B3: trocou o vídeo (tirou o velho, pôs um novo que sobe em segundo plano): o velho só sai quando o novo CHEGAR (a fila apaga).
  // Se o envio cair no meio, o card continua com o velho.
  const videosVelhos = empresaId && agora.some((a) => a.pendente && a.tipo === "video") ? saiu.filter((a) => a.tipo === "video" && a.driveId && a.id) : [];
  let apagarDepois = videosVelhos.map((a) => a.id!);
  const subirUm = async (a: Arquivos[number], f: File, i: number): Promise<Arquivos[number] | undefined> => {
    if (empresaId && a.tipo === "video") { enviarEmSegundoPlano(tarefaId, f, { papel: papelNoEnvio(a), ordem: i, apagarDepois }); apagarDepois = []; return undefined; } // 268: vídeo sobe em segundo plano; o card o recebe ao terminar
    if (empresaId) {
      const substitui = a.papel === "capa" ? capaDrive?.id : undefined;
      return { ...(await enviarParaDrive(tarefaId, f, papelNoEnvio(a), i, (x) => { registrarProgresso(a.url, x); aoProgredir?.(a.nome, x); }, substitui)), url: a.url }; // url local (blob:) vale até recarregar
    }
    if (a.tipo === "video") throw new ErroAnexo("Escolha a empresa para anexar vídeo.");
    const caminho = `tarefas/${tarefaId}/${crypto.randomUUID()}-${a.nome.replace(/[^\w.-]+/g, "_")}`;
    await subir(sb, caminho, f);
    if (a.papel === "capa") await liberarCapa();
    const { error: e2 } = await sb.from("arquivos").insert({ tarefa_id: tarefaId, caminho, nome: a.nome, tipo: a.tipo, tamanho: f.size, criado_por: pessoa });
    if (e2) { await sb.storage.from(BALDE).remove([caminho]); throw e2; }
    const { data } = await sb.storage.from(BALDE).createSignedUrl(caminho, 3600);
    return { nome: a.nome, tipo: a.tipo, caminho, url: data?.signedUrl ?? undefined };
  };
  // r2 B4: cada guardado leva a posição que tem na FICHA (`i`), a mesma que o vídeo em segundo plano recebeu; antes a posição era a da lista
  // dos guardados, que pula o vídeo, e dois itens do carrossel ficavam com a mesma ordem.
  const guardados: { a: Arquivos[number]; i: number }[] = [];
  for (const [i, a] of agora.entries()) {
    const f = a.pendente;
    if (!f) { guardados.push({ a, i }); continue; }
    let envio = emEnvio.get(f);
    if (!envio) {
      envio = subirUm(a, f, i);
      emEnvio.set(f, envio);
      envio.catch(() => emEnvio.delete(f)); // falhou: o próximo salvar tenta de novo
    }
    const novo = await envio;
    if (!novo) continue;
    Object.assign(a, novo, { pendente: undefined }); // já subiu: se um anexo seguinte falhar, salvar de novo não manda este outra vez
    guardados.push({ a: novo, i });
  }
  await liberarCapa();
  // r3 (Ferreiro 3): no 2º salvar com a ficha aberta, o vídeo novo ainda sobe pelo envio do 1º (M8: subirUm nem roda); os velhos vão para ESSE envio
  const videoNaFila = agora.find((a) => a.pendente && a.tipo === "video")?.pendente;
  if (apagarDepois.length && videoNaFila && apagarQuandoChegar(videoNaFila, apagarDepois)) apagarDepois = [];
  const esperam = new Set(videosVelhos.filter((a) => !apagarDepois.includes(a.id!))); // entregues à fila (o vídeo novo apaga ao chegar)
  await apagarAnexos(sb, saiu.filter((a) => a !== capaDrive && !capaSupabase.includes(a) && !esperam.has(a)));
  // ordem do carrossel: os que já existiam e mudaram de lugar. r3 N5: também as imagens antigas do Supabase (antes só os do Drive: a ficha mostrava
  // a ordem nova e o banco ficava com a velha). A função drive (ordenar_anexos) grava a ordem de qualquer arquivo do card.
  const mudou = guardados.flatMap(({ a, i }) => (a.id && (antes.find((x) => x.id === a.id)?.ordem ?? i) !== i ? [{ id: a.id, ordem: i }] : []));
  if (mudou.length) await ordenarAnexosDrive(tarefaId, mudou);
  if (temNovo && empresaId) void recarregarOcasioes(); // o servidor pode ter criado a ocasião do card
  return guardados.map(({ a, i }) => (a.id ? { ...a, ordem: i } : a));
}
