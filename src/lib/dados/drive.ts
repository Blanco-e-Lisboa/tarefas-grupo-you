// Google Drive no navegador (item 203): o arquivo sobe DIRETO do navegador para o Drive (nunca passa pelo Supabase);
// a função `drive` do servidor só abre a sessão de envio, confere e registra. Vídeo nunca é recomprimido.
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { AVISOS, ligarTempoReal } from "./tempo-real";
import type { Arquivo, Formato } from "./tipos";
import { enviarEmPartes, ondeParou } from "./envio-em-partes";
export { enviarEmPartes };

const base = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
async function cabecalho() {
  const { data } = await supabase().auth.getSession();
  return { authorization: `Bearer ${data.session?.access_token}`, apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "content-type": "application/json" };
}
/** Chama a função `drive`; em falha lança Error com a mensagem já em português para a tela. */
async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`${base()}/functions/v1/drive`, { method: "POST", headers: await cabecalho(), body: JSON.stringify(corpo) });
  } catch {
    throw new Error("Sem conexão com o servidor. Tente de novo.");
  }
  const j = (await r.json().catch(() => ({}))) as { erro?: string };
  if (!r.ok) throw new ErroServidor(j.erro ?? "Não consegui falar com o Drive. Tente de novo.", r.status);
  return j as T;
}
/** Resposta de erro da função `drive`, com o código HTTP (a anotação do envio depende dele). */
export class ErroServidor extends Error {
  constructor(mensagem: string, public status: number) {
    super(mensagem);
  }
}
/** r2 B6: recusa que tentar de novo não resolve (o servidor respondeu 4xx). 408 e 429 (demorou, muitos pedidos) ainda valem nova tentativa. */
export const recusaDefinitiva = (e: unknown) => e instanceof ErroServidor && e.status >= 400 && e.status < 500 && e.status !== 408 && e.status !== 429;

export const tipoDe = (f: { type: string }): NonNullable<Arquivo["tipo"]> => (f.type.startsWith("video/") ? "video" : f.type.startsWith("image/") ? "imagem" : "documento");

// Anotação do envio em andamento (por card, papel, nome, tamanho e data do arquivo): se a conexão cair depois de o arquivo chegar ao Drive e antes
// de o servidor registrá-lo, a nova tentativa continua a MESMA sessão e confirma o MESMO arquivo, em vez de subir outro e deixar o primeiro solto.
type Anotacao = { sessao: string; driveId?: string };
const chaveEnvio = (tarefaId: string, a: File, papel: string) => `grade:envio:${tarefaId}:${papel}:${a.name}:${a.size}:${a.lastModified}`;
function anotacao(chave: string, nova?: Anotacao | null): Anotacao | undefined {
  try {
    if (nova === null) localStorage.removeItem(chave);
    else if (nova) localStorage.setItem(chave, JSON.stringify(nova));
    else return JSON.parse(localStorage.getItem(chave) ?? "null") ?? undefined;
  } catch { /* sem armazenamento: funciona como antes, sem retomar */ }
}

/** Anexa um arquivo ao card: abre a sessão, sobe direto ao Drive e registra. Devolve o arquivo já no formato da ficha.
    `substitui` (M14): id do arquivo que este troca (a capa velha). O SERVIDOR só tira o velho depois de conferir o novo, e sem mexer na pasta.
    `envio` (r3 A7, 038): id do envio na fila; o servidor o tira da lista de vídeos pendentes do card (a marca sai quando a lista esvazia). */
export async function enviarParaDrive(tarefaId: string, arquivo: File, papel: "anexo" | "capa", ordem: number, aoProgredir?: (fracao: number) => void, substitui?: string, envio?: string): Promise<Arquivo> {
  const tipo = tipoDe(arquivo), mime = arquivo.type || "application/octet-stream";
  const chave = chaveEnvio(tarefaId, arquivo, papel);
  let nota = anotacao(chave);
  let driveId = nota?.driveId; // já chegou ao Drive numa tentativa anterior: só falta confirmar
  if (!driveId && nota) {
    try { // sessão aberta antes: pergunta até onde chegou e continua dali
      const ret = await ondeParou(nota.sessao, arquivo.size, (...a) => fetch(...a));
      driveId = "id" in ret ? ret.id : await enviarEmPartes(nota.sessao, arquivo, aoProgredir, undefined, undefined, ret.recebido);
    } catch { nota = undefined; anotacao(chave, null); } // sessão vencida ou perdida: começa uma nova
  }
  if (!driveId) {
    const { sessao_url } = await chamar<{ sessao_url: string }>({ acao: "sessao_envio", tarefa_id: tarefaId, nome: arquivo.name, tipo, mime, tamanho: arquivo.size, papel });
    anotacao(chave, { sessao: sessao_url });
    driveId = await enviarEmPartes(sessao_url, arquivo, aoProgredir);
  }
  anotacao(chave, { sessao: nota?.sessao ?? "", driveId });
  let arquivo_id: string;
  try {
    ({ arquivo_id } = await chamar<{ arquivo_id: string }>({ acao: "confirmar_envio", tarefa_id: tarefaId, drive_id: driveId, nome: arquivo.name, tipo, tamanho: arquivo.size, papel, ordem, ...(substitui && { substitui_arquivo_id: substitui }), ...(envio && { envio_id: envio }) }));
  } catch (e) {
    // O arquivo continua no Drive: a anotação fica e a próxima tentativa só confirma (queda de rede, servidor fora do ar).
    // r2 B6: recusa do servidor (4xx: 410 não existe, 422 não serve, 403 sem permissão, 409 conflito...) não muda tentando de novo:
    // a anotação sai e a tela mostra o motivo dele, em vez de "tente de novo" para sempre.
    // Ocasião que mudou durante o envio NÃO é motivo: o servidor move o arquivo para a pasta atual do card.
    if (recusaDefinitiva(e)) { anotacao(chave, null); throw e; }
    throw new Error("Não deu para confirmar o envio, tente de novo.", { cause: e });
  }
  anotacao(chave, null);
  return { id: arquivo_id, nome: arquivo.name, tipo, driveId, ordem, papel };
}

/** Guarda a ordem do carrossel (só os anexos do Drive que mudaram de lugar). */
export const ordenarAnexosDrive = (tarefaId: string, ordem: { id: string; ordem: number }[]) => chamar({ acao: "ordenar_anexos", tarefa_id: tarefaId, ordem }).then(() => undefined);

/** Endereço assinado de 10 min que serve o vídeo do Drive por pedaços (Range), para a barrinha de escolher o quadro da capa. */
export async function linkDeVideo(arquivoId: string): Promise<string> {
  return (await chamar<{ url: string }>({ acao: "link_video", arquivo_id: arquivoId })).url;
}
/** Tira um anexo do Drive (vai para a lixeira do Google) e apaga a linha. */
export const apagarAnexoDrive = (arquivoId: string) => chamar({ acao: "apagar_anexo", arquivo_id: arquivoId }).then(() => undefined);
/** Apaga o card COM os arquivos dele (Drive e Supabase). Lança Error com a mensagem da tela se falhar; nada some pela metade. */
export const apagarTarefaComArquivos = (tarefaId: string) => chamar({ acao: "apagar_tarefa", tarefa_id: tarefaId }).then(() => undefined);

// ---- Progresso do envio (a barra do Anexos): chave = endereço local (blob:) do arquivo que está subindo ----
let progresso: Record<string, number> = {};
const ouvintesProgresso = new Set<() => void>();
export function registrarProgresso(chave: string | undefined, fracao: number) {
  if (!chave) return;
  const { [chave]: _antigo, ...resto } = progresso;
  void _antigo;
  progresso = fracao >= 1 ? resto : { ...resto, [chave]: fracao };
  ouvintesProgresso.forEach((f) => f());
}
const SEM_PROGRESSO: Record<string, number> = {};
/** Fração (0 a 1) de cada arquivo que está subindo ao Drive agora. */
export const useProgressoEnvio = () => useSyncExternalStore((f) => (ouvintesProgresso.add(f), () => void ouvintesProgresso.delete(f)), () => progresso, () => SEM_PROGRESSO);

// ---- Temas (no banco: "ocasioes"). Agrupam os conteúdos da empresa; no Drive: Empresa → Formato → Tema → pasta do conteúdo (item 229) ----
/** `permanente` = a limpeza dos 7 dias não apaga nada deste tema (cadeado). `desligadoEm` = quando o Natham desligou (ISO): os 7 dias recomeçam dali. */
export type Ocasiao = { id: string; empresaId: string; nome: string; permanente: boolean; desligadoEm?: string };
let ocasioes: Ocasiao[] = [];
let carregou = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
type LinhaTema = { id: string; empresa_id: string; nome: string; permanente?: boolean; desligado_em?: string | null };
const doBanco = (o: LinhaTema): Ocasiao => ({ id: o.id, empresaId: o.empresa_id, nome: o.nome, permanente: o.permanente === true, desligadoEm: o.desligado_em ?? undefined });
async function carregarOcasioes() {
  const { data, error } = await supabase().from("ocasioes").select("id, empresa_id, nome, permanente, desligado_em").order("nome");
  if (error || !data) return;
  ocasioes = (data as LinhaTema[]).map(doBanco);
  avisar();
}
let desligarTempoReal: (() => void) | undefined;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  if (!carregou && typeof window !== "undefined") { carregou = true; void carregarOcasioes(); void carregarDocumentos(); void carregarPastasLivres(); void carregarPostagemAutomatica(); acompanharPostagemAutomatica(document); }
  desligarTempoReal ??= ligarTempoReal("pastas", AVISOS.pastas, () => { void carregarOcasioes(); void carregarDocumentos(); void carregarPastasLivres(); }); // 274
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};
const NADA: Ocasiao[] = [];
/** Temas de todas as empresas (reativo). */
export const useOcasioes = () => useSyncExternalStore(assinar, () => ocasioes, () => NADA);

/** Cria o tema (só a linha; as pastas do Drive nascem com o 1º arquivo). `permanente` já na criação: Natham e Matheus podem. Lança Error com a mensagem da tela. */
export async function criarOcasiao(empresaId: string, nome: string, permanente = false): Promise<Ocasiao> {
  const { ocasiao } = await chamar<{ ocasiao: LinhaTema }>({ acao: "criar_ocasiao", empresa_id: empresaId, nome, permanente });
  const nova = doBanco(ocasiao);
  ocasioes = [...ocasioes, nova];
  avisar();
  return nova;
}
/** Nome novo do tema: o servidor renomeia as pastas dele no Drive e as pastas dos conteúdos, em levas de 40 com cursor; esta função repete até acabar (tema com mais de 40 pastas
    também termina). Devolve quantas pastas ficaram para trás (0 = tudo feito). */
export async function renomearOcasiao(id: string, nome: string): Promise<number> {
  let cursor: string | undefined, restantes = 0;
  for (let volta = 0; volta < 200; volta++) {
    const r = await chamar<{ restantes?: number; cursor?: string }>({ acao: "renomear_ocasiao", ocasiao_id: id, nome, ...(cursor ? { cursor } : {}) });
    restantes = r.restantes ?? 0;
    if (!restantes || !r.cursor || r.cursor === cursor) break;
    cursor = r.cursor;
  }
  ocasioes = ocasioes.map((o) => (o.id === id ? { ...o, nome: nome.trim() } : o));
  avisar();
  return restantes;
}
/** Liga ou desliga o Permanente. Natham liga e desliga; o Matheus só liga: o BANCO recusa o resto (Error "Só o Natham desliga o Permanente."). Desligar recomeça os 7 dias. */
export async function ligarPermanente(id: string, ligado: boolean): Promise<void> {
  await chamar({ acao: "permanente_ocasiao", ocasiao_id: id, ligado });
  ocasioes = ocasioes.map((o) => (o.id === id ? { ...o, permanente: ligado, desligadoEm: ligado ? undefined : new Date().toISOString() } : o));
  avisar();
}
/** Depois de salvar um card que já tem arquivo no Drive: título, formato, tema ou empresa mudaram → a pasta do conteúdo muda de lugar e de nome. Sem arquivo ainda não faz nada. */
export const organizarCard = (tarefaId: string) => chamar<{ movida: boolean }>({ acao: "organizar_card", tarefa_id: tarefaId }).then((r) => r.movida);
/** Recarrega a lista de temas. */
export const recarregarOcasioes = () => carregarOcasioes();

// ---- Interruptor da postagem automática (238/239): a tela só promete "vai ao ar" quando está LIGADA e a função publica DE VERDADE ----
/** `ligada` = o interruptor do banco (o 019b liga). `deVerdade` = a função postar-meta confirmou POSTAR_DE_VERDADE=sim; FALSE também quando ela está fora do ar ou não respondeu
    (conservador: sem confirmação a tela fala "modo de teste", nunca promete post). */
export type PostagemAutomatica = { ligada: boolean; deVerdade: boolean };
const DESLIGADA: PostagemAutomatica = { ligada: false, deVerdade: false };
let postagemAutomatica: PostagemAutomatica = DESLIGADA;
/** Pergunta à função postar-meta (ação "modo": devolve só um verdadeiro/falso, sem segredo) se ela publica de verdade. Qualquer falha = false. */
async function perguntarModo(): Promise<boolean> {
  try {
    const r = await fetch(`${base()}/functions/v1/postar-meta`, { method: "POST", headers: await cabecalho(), body: JSON.stringify({ acao: "modo" }) });
    return r.ok && ((await r.json().catch(() => ({}))) as { deVerdade?: boolean }).deVerdade === true;
  } catch { return false; }
}
async function carregarPostagemAutomatica() {
  const { data, error } = await supabase().rpc("postagem_automatica_ligada"); // antes do 019 a função não existe: fica "desligada"
  const ligada = !error && data === true;
  const deVerdade = ligada && (await perguntarModo());
  if (ligada === postagemAutomatica.ligada && deVerdade === postagemAutomatica.deVerdade) return;
  postagemAutomatica = ligada ? { ligada, deVerdade } : DESLIGADA;
  avisar();
}
/** A postagem automática está ligada? E publica de verdade? `{ ligada: false, deVerdade: false }` enquanto carrega, antes do 019 e entre o 019 e o 019b. Reativo. */
export const usePostagemAutomatica = (): PostagemAutomatica => useSyncExternalStore(assinar, () => postagemAutomatica, () => DESLIGADA);
/** Valor atual, fora de componente. */
export const lerPostagemAutomatica = () => postagemAutomatica;
/** Lê de novo. A própria camada já faz isso quando a aba volta a ficar visível (acompanharPostagemAutomatica). */
export const recarregarPostagemAutomatica = () => carregarPostagemAutomatica();
/** 239 · Mantém a tela em dia sem recarregar a página: relê quando a aba volta a ficar visível. Sem relógio (290): o interruptor muda uma vez na vida. Devolve quem desliga. */
export function acompanharPostagemAutomatica(doc: Pick<Document, "addEventListener" | "removeEventListener" | "hidden">): () => void {
  const aoVoltar = () => { if (!doc.hidden) void recarregarPostagemAutomatica(); };
  doc.addEventListener("visibilitychange", aoVoltar);
  return () => doc.removeEventListener("visibilitychange", aoVoltar);
}

// ---- Pastas livres (item 234): a "+ Nova pasta". Ficam na empresa, ao lado das pastas de formato; NÃO são Tema; qualquer arquivo; nada sai sozinho ----
/** `permanente` = cadeado: a pasta não se apaga (renomear pode). Só o Natham desliga (o banco recusa o Matheus). */
export type PastaLivre = { id: string; empresaId: string; nome: string; permanente: boolean };
let pastasLivres: PastaLivre[] = [];
type LinhaLivre = { id: string; empresa_id: string; nome: string; permanente?: boolean };
const livreDoBanco = (p: LinhaLivre): PastaLivre => ({ id: p.id, empresaId: p.empresa_id, nome: p.nome, permanente: p.permanente === true });
async function carregarPastasLivres() {
  const { data, error } = await supabase().from("pastas_livres").select("id, empresa_id, nome, permanente").order("nome");
  if (error || !data) return;
  pastasLivres = (data as LinhaLivre[]).map(livreDoBanco);
  avisar();
}
const SEM_PASTAS: PastaLivre[] = [];
/** Pastas livres de todas as empresas (reativo). */
export const usePastasLivres = () => useSyncExternalStore(assinar, () => pastasLivres, () => SEM_PASTAS);
/** "+ Nova pasta": nome + Permanente (padrão desligado). Natham e Matheus podem. Lança Error com a mensagem da tela (nome repetido, nome de formato...). */
export async function criarPastaLivre(empresaId: string, nome: string, permanente = false): Promise<PastaLivre> {
  const { pasta } = await chamar<{ pasta: LinhaLivre }>({ acao: "criar_pasta_livre", empresa_id: empresaId, nome, permanente });
  const nova = livreDoBanco(pasta);
  pastasLivres = [...pastasLivres, nova];
  avisar();
  return nova;
}
/** Renomear vale também com cadeado. */
export async function renomearPastaLivre(id: string, nome: string): Promise<void> {
  await chamar({ acao: "renomear_pasta_livre", pasta_id: id, nome });
  pastasLivres = pastasLivres.map((p) => (p.id === id ? { ...p, nome: nome.trim() } : p));
  avisar();
}
/** Cadeado da pasta livre. Natham liga e desliga; o Matheus só liga (Error "Só o Natham desliga o Permanente." quando o banco recusa). */
export async function ligarPermanentePastaLivre(id: string, ligado: boolean): Promise<void> {
  await chamar({ acao: "permanente_pasta_livre", pasta_id: id, ligado });
  pastasLivres = pastasLivres.map((p) => (p.id === id ? { ...p, permanente: ligado } : p));
  avisar();
}
/** Apaga a pasta e tudo que tem nela (vai para a lixeira do Drive). A tela confirma antes. Com cadeado: Error "Esta pasta tem cadeado. Desligue o Permanente para apagar.". */
export async function apagarPastaLivre(id: string): Promise<void> {
  await chamar({ acao: "apagar_pasta_livre", pasta_id: id });
  pastasLivres = pastasLivres.filter((p) => p.id !== id);
  documentos = documentos.filter((d) => d.pastaLivreId !== id);
  avisar();
}

// ---- Documentos soltos: arquivo posto direto numa pasta de Tema (ou "Sem tema"), sem card. Moram no Drive, não vencem em 7 dias, só saem quando alguém apaga ----
export type DocumentoSolto = { id: string; nome: string; tipo: NonNullable<Arquivo["tipo"]>; driveId: string; empresaId: string; formato?: Formato; ocasiaoId?: string; pastaLivreId?: string; tamanho?: number; criadoEm?: string };
/** Com `pastaLivreId` o documento vai para a pasta livre (formato e tema são ignorados). Sem ele, para a pasta do Tema/Formato (como no 229). */
export type DestinoPasta = { empresaId: string; formato?: Formato; ocasiaoId?: string; pastaLivreId?: string };
let documentos: DocumentoSolto[] = [];
type LinhaSolta = { id: string; nome: string; tipo: DocumentoSolto["tipo"]; drive_id: string; empresa_id: string; formato: Formato | null; ocasiao_id: string | null; pasta_livre_id?: string | null; tamanho: number | null; created_at: string };
async function carregarDocumentos() {
  const { data, error } = await supabase().from("arquivos").select("id, nome, tipo, drive_id, empresa_id, formato, ocasiao_id, pasta_livre_id, tamanho, created_at").not("empresa_id", "is", null).order("created_at");
  if (error || !data) return;
  documentos = (data as LinhaSolta[]).map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, driveId: a.drive_id, empresaId: a.empresa_id, formato: a.formato ?? undefined, ocasiaoId: a.ocasiao_id ?? undefined, pastaLivreId: a.pasta_livre_id ?? undefined, tamanho: a.tamanho ?? undefined, criadoEm: a.created_at }));
  avisar();
}
const SEM_DOCUMENTOS: DocumentoSolto[] = [];
/** Documentos soltos de todas as pastas (reativo). */
export const useDocumentosSoltos = () => useSyncExternalStore(assinar, () => documentos, () => SEM_DOCUMENTOS);
const corpoDestino = (d: DestinoPasta) => (d.pastaLivreId ? { pasta_id: d.pastaLivreId } : { empresa_id: d.empresaId, formato: d.formato ?? null, ocasiao_id: d.ocasiaoId ?? null });
const acaoDestino = (d: DestinoPasta, nome: "sessao" | "confirmar") => `${nome === "sessao" ? "sessao_envio" : "confirmar_envio"}_${d.pastaLivreId ? "livre" : "pasta"}`;

/** Sobe um documento (imagem, vídeo ou documento) para a pasta do tema, direto ao Drive. Natham e Matheus podem. Devolve o documento já na lista da tela. */
export async function enviarDocumentoNaPasta(destino: DestinoPasta, arquivo: File, aoProgredir?: (fracao: number) => void): Promise<DocumentoSolto> {
  const tipo = tipoDe(arquivo), mime = arquivo.type || "application/octet-stream";
  const chave = `grade:envio-pasta:${destino.pastaLivreId ?? destino.empresaId}:${destino.formato ?? ""}:${destino.ocasiaoId ?? ""}:${arquivo.name}:${arquivo.size}:${arquivo.lastModified}`;
  let nota = anotacao(chave);
  let driveId = nota?.driveId; // já chegou ao Drive numa tentativa anterior: só falta confirmar
  if (!driveId && nota) {
    try {
      const ret = await ondeParou(nota.sessao, arquivo.size, (...a) => fetch(...a));
      driveId = "id" in ret ? ret.id : await enviarEmPartes(nota.sessao, arquivo, aoProgredir, undefined, undefined, ret.recebido);
    } catch { nota = undefined; anotacao(chave, null); }
  }
  if (!driveId) {
    const { sessao_url } = await chamar<{ sessao_url: string }>({ acao: acaoDestino(destino, "sessao"), ...corpoDestino(destino), nome: arquivo.name, tipo, mime, tamanho: arquivo.size });
    anotacao(chave, { sessao: sessao_url });
    driveId = await enviarEmPartes(sessao_url, arquivo, aoProgredir);
  }
  anotacao(chave, { sessao: nota?.sessao ?? "", driveId });
  let arquivo_id: string;
  try {
    ({ arquivo_id } = await chamar<{ arquivo_id: string }>({ acao: acaoDestino(destino, "confirmar"), ...corpoDestino(destino), drive_id: driveId, nome: arquivo.name, tipo, tamanho: arquivo.size }));
  } catch (e) {
    if (recusaDefinitiva(e)) { anotacao(chave, null); throw e; }
    throw new Error("Não deu para confirmar o envio, tente de novo.", { cause: e });
  }
  anotacao(chave, null);
  const novo: DocumentoSolto = { id: arquivo_id, nome: arquivo.name, tipo, driveId, empresaId: destino.empresaId, formato: destino.pastaLivreId ? undefined : destino.formato, ocasiaoId: destino.pastaLivreId ? undefined : destino.ocasiaoId, pastaLivreId: destino.pastaLivreId, tamanho: arquivo.size };
  documentos = [...documentos.filter((x) => x.id !== novo.id), novo];
  avisar();
  return novo;
}
/** Apaga um documento solto (vai para a lixeira do Google). Natham e Matheus podem. */
export async function apagarDocumentoSolto(id: string): Promise<void> {
  await apagarAnexoDrive(id);
  documentos = documentos.filter((x) => x.id !== id);
  avisar();
}

// ---- Google Drive ligado? (Configurações, só o Natham) ----
async function autorizar<T>(consulta: string): Promise<T> {
  const r = await fetch(`${base()}/functions/v1/google-autorizar?${consulta}`, { headers: await cabecalho() });
  const j = (await r.json().catch(() => ({}))) as { erro?: string };
  if (!r.ok) throw new Error(j.erro ?? "Não consegui falar com o servidor.");
  return j as T;
}
export const estadoGoogleDrive = () => autorizar<{ ligado: boolean; email?: string }>("status=1");
/** Devolve o endereço do Google onde o Natham aceita; a tela navega até ele. */
export const enderecoLigarGoogle = async () => (await autorizar<{ url: string }>("inicio=1")).url;
