// Repositório no Supabase (Etapa 1 da fase login). A API pública (index.ts) é a mesma de antes; só este arquivo fala com o banco.
// O app fala com o banco COM a sessão de quem está logado: quem decide o que cada pessoa vê são as travas (RLS) do banco.
// Escrita otimista: a tela muda na hora; se o banco recusar, volta ao que era e mostra o aviso (ver lerErro).
import { supabase } from "@/lib/supabase/cliente";
import { carregarAnexos, ErroAnexo, sincronizarAnexos } from "./anexos";
import { apagarSemAnexo } from "./apagar-card";
import { apagarTarefaComArquivos } from "./drive";
import { AVISOS, ligarTempoReal } from "./tempo-real"; import { gravarExtras } from "./linha-caderno";
import { campoOcasiao, paraBanco, podeAlterar, podeApagar, postadoEmDe, trocarFazendo } from "./repositorio-regras";
export { campoOcasiao, paraBanco, podeAlterar, podeApagar, postadoEmDe, trocarFazendo };
import { campoConsertoTexto, fecharAprovada } from "./esteira";
import { carregarPostagens, postarEmQueVale, redesQueValem } from "./postagens";
import type { Empresa, Fazendo, NovaTarefa, Responsavel, Tag, Tarefa } from "./tipos";
import { APAGADO, daLinha, funcaoAusente, motivoDoBanco, MUDOU, semAcesso, type LinhaTarefa } from "./linha-tarefa";
import { anotarMudancaPropria, salvarNaVez } from "./versao-card";
export { APAGADO, daLinha, funcaoAusente, motivoDoBanco, MUDOU };

type Pessoa = { id: string; slug: Responsavel; user_id: string | null };

let tarefas: Tarefa[] = [];
let empresas: Empresa[] = [];
let tags: Tag[] = [];
let pessoas: Pessoa[] = [];
let fazendo: Record<string, Fazendo> = {};
let eu: Responsavel | null = null;
let erro = "";
let iniciado: Promise<void> | undefined;
const ouvintes = new Set<() => void>(); const avisar = () => ouvintes.forEach((f) => f());

// Snapshots imutáveis: cada escrita troca o array (exigência do useSyncExternalStore).
export const lerTarefas = () => tarefas;
export const lerEmpresas = () => empresas;
export const lerTags = () => tags;
export const lerFazendo = () => fazendo;
export const lerEu = () => eu;
export const lerErro = () => erro;
export const limparErro = () => { erro = ""; avisar(); };
let desligarTempoReal: (() => void) | undefined;
export const assinar = (f: () => void) => {
  ouvintes.add(f);
  iniciar();
  // 274 · Tempo real: enquanto houver tela olhando, o banco avisa quando algo muda. Última tela sai = desliga.
  desligarTempoReal ??= ligarTempoReal("esteira", AVISOS.esteira, () => void carregar());
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};

export const falhou = (mensagem: string) => { erro = mensagem; avisar(); };
export const recarregarTarefas = () => carregar(); // 268: o envio em segundo plano relê o card ao terminar
const idDe = (slug: Responsavel) => pessoas.find((p) => p.slug === slug)?.id;
const slugDe = (id: string | null) => pessoas.find((p) => p.id === id)?.slug;

type LinhaFazendo = { pessoa_id: string; tarefa_id: string; desde: string };
const doBanco = (ls: LinhaFazendo[]) =>
  ls.toSorted((a, b) => a.desde.localeCompare(b.desde)).reduce((m, l) => { const q = slugDe(l.pessoa_id); return q ? trocarFazendo(m, q, l.tarefa_id, l.desde) : m; }, {} as Record<string, Fazendo>);

function iniciar() {
  if (typeof window === "undefined" || iniciado) return;
  iniciado = carregar();
  // Voltou para a aba: busca de novo, para ver o que o outro mexeu enquanto isso.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void carregar(); });
}

const daTag = (x: Tag): Tag => ({ id: x.id, nome: x.nome, cor: x.cor, ...(x.aprovacao && { aprovacao: true as const }) });

/** 274 · Leitura x gravação: enquanto alguma gravação está no ar, a leitura espera (relerDepois) e, se uma gravação começou depois dela,
    a resposta é descartada. Sem isso, o aviso do banco trazia o dado antigo por cima da tela e o card "voltava". */
let escrevendo = 0, relerDepois = false, leitura = 0, gravacoes = 0; // gravacoes: quantas gravações já terminaram (r2 B7)
const protegida = <A extends unknown[], R>(f: (...a: A) => Promise<R>) => async (...a: A): Promise<R> => {
  escrevendo++; leitura++;
  try { return await f(...a); } finally { leitura++; gravacoes++; if (--escrevendo === 0 && relerDepois) { relerDepois = false; void carregar(); } }
};

/** Só para o teste da corrida (repositorio-corrida.test.ts). */
export const carregarAgora = () => carregar();
async function carregar() {
  if (escrevendo) { relerDepois = true; return; }
  const n = ++leitura, feitas = gravacoes;
  // Leitura velha é descartada. Gravação no ar: relê quando ela acabar. r2 B7: se a gravação que a atropelou JÁ acabou, relê agora
  // (senão a mudança de outra pessoa que esta leitura trazia ficava fora da tela). Atropelada só por outra leitura: a outra vale.
  const descartar = () => { if (escrevendo) relerDepois = true; else if (feitas !== gravacoes) void carregar(); };
  const sb = supabase();
  const [p, e, t, g, f, sessao] = await Promise.all([
    sb.from("pessoas").select("id, slug, user_id"),
    sb.from("empresas").select("id, nome, sigla").order("ordem").order("nome"),
    sb.from("tarefas").select("*, tarefa_tags(tag_id)").order("created_at"),
    sb.from("tags").select("id, nome, cor, aprovacao").order("nome"),
    sb.from("fazendo_agora").select("pessoa_id, tarefa_id, desde"),
    sb.auth.getClaims(),
  ]);
  const problema = p.error ?? e.error ?? t.error ?? g.error ?? f.error;
  if (problema) return falhou("Não consegui carregar os dados. Recarregue a página.");
  if (n !== leitura || escrevendo) return descartar(); // uma gravação começou no meio: esta leitura já nasceu velha
  pessoas = p.data as Pessoa[];
  eu = pessoas.find((x) => x.user_id === sessao.data?.claims.sub)?.slug ?? null;
  if (!eu) falhou("Seu login ainda não está ligado a uma pessoa. Fale com o Natham.");
  const [anexos, postagens] = await Promise.all([carregarAnexos(sb), carregarPostagens(sb)]);
  if (n !== leitura || escrevendo) return descartar();
  if (!anexos) falhou("Não consegui ler os anexos dos cards agora. Os que já estavam na tela continuam; recarregue a página."); // M10: falha não vira "card sem anexo"
  empresas = e.data as Empresa[];
  tags = (g.data as Tag[]).map(daTag);
  // M9: anexo que esta aba ainda sobe fica na tela junto com os do banco. M10: leitura falhou = ficam os que já estavam.
  const anexosDe = (id: string) => { const velhos = tarefas.find((x) => x.id === id)?.arquivos; return anexos ? [...(anexos.get(id) ?? []), ...(velhos?.filter((a) => a.pendente) ?? [])] : velhos; };
  tarefas = (t.data as LinhaTarefa[]).map((l) => daLinha(l, anexosDe(l.id), slugDe, postagens.get(l.id)))
    .map((x) => (cancelados.has(x.id) && !x.postarEm ? { ...x, programacaoCancelada: true } : x));
  fazendo = doBanco(f.data as LinhaFazendo[]);
  avisar();
  // r4 (economizar execuções): o resultado do Postando chega pelo tempo real (o sino de `postagens` e de `tarefas` toca "esteira").
  // Antes a tela relia tudo a cada 15 s enquanto algum card postava.
}

const cancelados = new Set<string>(); // cards cuja programação o salvar desta sessão tirou (ver salvarTarefa)

const soLeitura = "Essa tarefa é só para olhar: você não pode mexer nela.";

/** Grava o card (sem os anexos). Devolve a tarefa gravada e como estava antes, ou null se o banco recusou (nada mudou). */
async function gravarCardDireto(nova: NovaTarefa): Promise<{ tarefa: Tarefa; antes?: Tarefa } | null> {
  const id = nova.id ?? crypto.randomUUID();
  const antes = tarefas.find((t) => t.id === id);
  const dono = antes?.dono ?? nova.enviarPara ?? eu ?? undefined;
  const { enviarPara: _enviarPara, ...resto } = nova;
  void _enviarPara;
  // O gatilho do 015 faz o mesmo no banco: Conserto só em Edição, data do post só em Aprovado/Postado.
  const tarefa: Tarefa = { ...resto, ...fecharAprovada(resto, tags), conserto: resto.etapa === "edicao" && resto.conserto ? true : undefined,
    postarEm: postarEmQueVale({ ...resto, postarRedes: redesQueValem(resto) }), postarRedes: redesQueValem(resto), programacaoCancelada: undefined, id, dono, criadoPor: antes?.criadoPor ?? eu ?? undefined, enviadaPor: antes ? antes.enviadaPor : dono !== eu ? eu ?? undefined : undefined };
  tarefa.postadoEm = postadoEmDe(antes, tarefa.etapa); // 238: a data real de entrada em Postado (o banco grava a mesma)
  // Havia data e o salvar a tirou (só Facebook + vídeo): a tela avisa "Programação cancelada" até alguém programar de novo.
  if (antes?.postarEm && !tarefa.postarEm && tarefa.etapa === "aprovado") { cancelados.add(id); tarefa.programacaoCancelada = true; }
  if (tarefa.postarEm) cancelados.delete(id);
  if (!eu || !dono) { falhou("Seu login ainda não está ligado a uma pessoa. Fale com o Natham."); return null; }
  if (antes && !podeAlterar(antes, eu)) { falhou(soLeitura); return null; } // trava na origem: nenhuma tela mexe em tarefa só de leitura
  tarefas = antes ? tarefas.map((t) => (t.id === id ? tarefa : t)) : [...tarefas, tarefa];
  avisar();
  try {
    const sb = supabase();
    const campos = paraBanco(tarefa, idDe(tarefa.responsavel));
    const linha = { id, ...campos, postar_em: tarefa.postarEm ?? null, conserto: !!tarefa.conserto, formato: tarefa.formato ?? null, responsavel_id: campos.responsavel_id ?? null, dono_id: idDe(dono), criado_por: idDe(eu), enviada_por: dono !== eu ? idDe(eu) : null,
      legenda: tarefa.legenda?.trim() || null, postar_redes: tarefa.postarRedes ?? null, capa_quadro_ms: tarefa.capaQuadroMs ?? null,
      // 238: Tema escolhido vai; Tema TIRADO (tinha e agora não tem) vai como null; nunca teve, nem vai (ver campoOcasiao)
      ...campoOcasiao(tarefa.ocasiaoId, antes?.ocasiaoId), ...campoConsertoTexto(tarefa.consertoTexto, antes?.consertoTexto),
      // só vai quando é verdade: antes do 010 a coluna não existe e mandar `false` derrubaria o salvar de toda tarefa do Caderno
      ...(tarefa.vaiProGoogle ? { vai_pro_google: true } : {}) };
    // Tarefa e tags numa só chamada (007; com o número de edição desde o 040). r3: saiu o caminho de reserva de antes do 007 (a função existe em
    // produção desde então; o reserva gravava só parte dos campos e passaria por cima da conferência de versão se a API demorasse a ver o 040).
    // A1: manda o número de edição que a tela viu (ver versao-card.ts); o banco devolve o número novo. r2 F1: vai também quando o card
    // já sumiu da memória (outra pessoa apagou e o tempo real tirou): com o número, o banco recusa em vez de criar o card de novo.
    const { data, error } = await salvarNaVez(id, nova.id ? tarefa.versao : undefined, (de) => sb.rpc("salvar_tarefa", { p: linha, p_tags: tarefa.tags ?? [], ...(de !== undefined && { p_versao: de }) }));
    if (error) throw error;
    if (typeof data === "number") tarefa.versao = data;
  } catch (e) {
    // B7: só desfaz se a tela ainda mostra o que ESTE salvar pôs; um salvar seguinte já pôs outra coisa por cima e não pode ser apagado.
    if (tarefas.find((t) => t.id === id) === tarefa) tarefas = antes ? tarefas.map((t) => (t.id === id ? antes : t)) : tarefas.filter((t) => t.id !== id);
    relerDepois = true; // quando as gravações acabarem, a tela relê o que o banco tem de verdade
    falhou(motivoDoBanco(e, "Não consegui salvar a tarefa. Tente de novo."));
    return null;
  }
  if (!(await gravarExtras(id, antes, tarefa))) falhou("Não consegui guardar a linha ou a cor da tarefa. Tente de novo.");
  return { tarefa, antes };
}

/** M9: os anexos sobem FORA da trava de leitura (o card já está gravado): um envio de minutos não congela mais a tela.
    A tarefa já está no banco (o anexo precisa dela). Se o anexo falhar, a tarefa fica e o aviso diz que o anexo não subiu. */
async function subirAnexos(tarefa: Tarefa, antes: Tarefa | undefined): Promise<Tarefa> {
  const id = tarefa.id;
  const conhecidos = new Set([...(antes?.arquivos ?? []), ...tarefa.arquivos].flatMap((a) => (a.id ? [a.id] : []))); // o que ESTE salvar viu (antes de subir)
  try {
    const arquivos = await sincronizarAnexos(supabase(), id, tarefa.empresaId, eu ? idDe(eu) : undefined, antes?.arquivos ?? [], tarefa.arquivos);
    tarefa.arquivos = arquivos;
    // bug novo 6 do Codex: o que chegou na tela DURANTE o envio (anexo de outra pessoa, vídeo em segundo plano) fica; só o que este salvar viu é trocado
    const chegou = (t: Tarefa) => t.arquivos.filter((a) => a.id && !conhecidos.has(a.id) && !arquivos.some((x) => x.id === a.id));
    tarefas = tarefas.map((t) => (t.id === id ? { ...t, arquivos: [...arquivos, ...chegou(t)] } : t));
    avisar();
  } catch (e) {
    falhou(e instanceof ErroAnexo ? `A tarefa foi salva, mas ${e.message}` : "A tarefa foi salva, mas não consegui guardar os anexos. Abra a ficha e anexe de novo.");
  }
  return tarefa;
}
const gravarCard = protegida(gravarCardDireto);
/** Devolve a tarefa gravada, ou null se o banco recusou (nada mudou). Gravada com anexo que não subiu: devolve a tarefa e o aviso
    (lerErro) diz que "a tarefa foi salva, mas..." (Lupa 215 v2: quem chama trata como salva). */
export const salvarTarefa = async (nova: NovaTarefa): Promise<Tarefa | null> => {
  const r = await gravarCard(nova);
  return r && subirAnexos(r.tarefa, r.antes);
};

async function removerTarefaDireto(id: string): Promise<void> {
  const alvo = tarefas.find((t) => t.id === id);
  if (alvo && !podeApagar(alvo, eu)) return falhou(soLeitura);
  const antes = tarefas;
  tarefas = tarefas.filter((t) => t.id !== id);
  avisar();
  // Card com anexo guardado só sai pela função drive (019): ela tira os arquivos do Drive e do Storage antes, para nada ficar órfão.
  if (alvo?.arquivos.some((a) => !a.pendente)) {
    try { await apagarTarefaComArquivos(id); } catch (e) {
      tarefas = antes;
      falhou(e instanceof Error && e.message ? e.message : "Não consegui apagar a tarefa. Tente de novo.");
    }
    return;
  }
  const { data, error } = await apagarSemAnexo(alvo, id); // 287: card de conteúdo passa pela função apagar_card (029)
  // M10: a tela não sabia dos anexos (a leitura deles falhou), o banco sabe: apaga pelo caminho que tira os arquivos junto
  if (error?.message?.includes("card com anexo")) {
    try { await apagarTarefaComArquivos(id); } catch (e) { tarefas = antes; falhou(e instanceof Error && e.message ? e.message : "Não consegui apagar a tarefa. Tente de novo."); }
    return;
  }
  if (error || !data?.length) {
    tarefas = antes;
    falhou(error ? motivoDoBanco(error, "Não consegui apagar a tarefa. Tente de novo.") : semAcesso);
  }
}

/** "Postar agora" (196): só Natham/aprovador, card de Postagem em Aprovado; o banco marca a hora e chama a função. */
async function postarAgoraDireto(id: string): Promise<void> {
  const { data, error } = await supabase().rpc("postar_agora", { p_tarefa: id });
  if (error) return falhou(motivoDoBanco(error, "Não consegui mandar postar. Tente de novo."));
  // Mostra "Postando…" na hora (a rede que já saiu fica como está); a próxima carga traz o que a função gravou.
  tarefas = tarefas.map((t) => (t.id === id ? { ...t, postagens: (t.postarRedes ?? ["instagram", "facebook"]).map((rede) => t.postagens?.find((p) => p.rede === rede && p.status === "postado") ?? { rede, status: "fila" as const }) } : t));
  avisar();
  mandou(id, data);
}
/** Depois de mandar postar: olha por 2 min. O "Postar agora" (041) devolve o número de edição antes/depois da mudança dele: anota como desta aba (r3 A1). */
const mandou = (id: string, resposta?: unknown) => { anotarMudancaPropria(id, tarefas.find((t) => t.id === id)?.versao, resposta); };

/** "Tentar de novo" (196): volta para a fila só as redes que deram erro (a que já saiu não repete). */
async function tentarDeNovoDireto(id: string): Promise<void> {
  const { error } = await supabase().rpc("tentar_de_novo", { p_tarefa: id });
  if (error) return falhou(motivoDoBanco(error, "Não consegui tentar de novo. Tente outra vez."));
  tarefas = tarefas.map((t) => (t.id === id ? { ...t, postagens: t.postagens?.map((p) => (p.status === "erro" ? { ...p, status: "fila" as const, erro: undefined } : p)) } : t));
  avisar();
  mandou(id);
}

async function salvarEmpresaDireto(empresa: Empresa): Promise<Empresa> {
  const antes = empresas;
  const nova = !empresas.some((e) => e.id === empresa.id);
  empresas = nova ? [...empresas, empresa] : empresas.map((e) => (e.id === empresa.id ? empresa : e));
  avisar();
  const ordem = nova ? { ordem: empresas.length } : {};
  const { error } = await supabase().from("empresas").upsert({ id: empresa.id, nome: empresa.nome, sigla: empresa.sigla, ...ordem });
  if (error) { empresas = antes; avisar(); throw new Error("Não consegui salvar a empresa."); }
  return empresa;
}

async function salvarTagDireto(nova: Omit<Tag, "id">): Promise<Tag> {
  const tag = { ...nova, id: crypto.randomUUID() };
  tags = [...tags, tag];
  avisar();
  const { error } = await supabase().from("tags").insert({ id: tag.id, nome: tag.nome, cor: tag.cor, aprovacao: !!tag.aprovacao });
  if (error) { tags = tags.filter((t) => t.id !== tag.id); falhou("Não consegui criar a tag. Tente de novo."); }
  return tag;
}

/** 242 · Nome e cor de uma tag (pela lista de Tags da ficha). Otimista; volta se o banco recusar. A tag do sistema (aprovacao) não muda. */
async function editarTagDireto(id: string, mudou: Pick<Tag, "nome" | "cor">): Promise<void> {
  const antes = tags.find((t) => t.id === id);
  if (!antes || antes.aprovacao) return;
  tags = tags.map((t) => (t.id === id ? { ...t, ...mudou } : t));
  avisar();
  const { error } = await supabase().from("tags").update({ nome: mudou.nome, cor: mudou.cor }).eq("id", id);
  if (error) { tags = tags.map((t) => (t.id === id ? antes : t)); falhou("Não consegui mudar a tag. Tente de novo."); }
}

/** 242 · Apaga a tag; o banco a tira de todos os cards sozinho (tarefa_tags com on delete cascade).
    243: NÃO é otimista: a tag só sai da tela (e dos rascunhos, que filtram ao salvar) DEPOIS que o banco confirma. true = apagou. */
async function excluirTagDireto(id: string): Promise<boolean> {
  const antes = tags.find((t) => t.id === id);
  if (!antes || antes.aprovacao) return false;
  const { error } = await supabase().from("tags").delete().eq("id", id);
  if (error) { falhou("Não consegui excluir a tag. Tente de novo."); return false; }
  tags = tags.filter((t) => t.id !== id);
  tarefas = tarefas.map((t) => {
    if (!t.tags?.includes(id)) return t;
    const resto = t.tags.filter((x) => x !== id);
    return { ...t, tags: resto.length ? resto : undefined };
  });
  avisar();
  return true;
}

/** 243 · Quantos cards usam a tag, contando TODOS (inclusive os que só o dono vê): public.contar_cards_da_tag (022). null = a função falhou
    (antes do 022 colado, ou sem rede): quem chama cai na contagem dos cards que a pessoa vê. */
export async function contarCardsDaTag(id: string): Promise<number | null> {
  const { data, error } = await supabase().rpc("contar_cards_da_tag", { p_tag: id });
  return !error && typeof data === "number" ? data : null;
}

/** 243 · Lê as tags de novo do banco e devolve os ids que existem. A ficha chama antes de salvar: outra pessoa pode ter excluído
    uma tag marcada no rascunho, e o id apagado faria o salvar inteiro falhar (chave estrangeira em tarefa_tags). Falhou a leitura: fica a lista atual. */
export async function recarregarTags(): Promise<string[]> {
  const { data, error } = await supabase().from("tags").select("id, nome, cor, aprovacao").order("nome");
  if (!error && data) { tags = (data as Tag[]).map(daTag); avisar(); }
  return tags.map((t) => t.id);
}

/** Marca a tarefa em que `eu` está agora (troca a anterior, se houver). Otimista; volta se o banco recusar. */
async function comecarDireto(tarefaId: string): Promise<void> {
  if (!eu) return falhou("Seu login ainda não está ligado a uma pessoa. Fale com o Natham.");
  const t = tarefas.find((x) => x.id === tarefaId);
  if (!t || !podeAlterar(t, eu)) return falhou("Você só pode marcar tarefa que pode editar.");
  const antes = fazendo;
  fazendo = trocarFazendo(fazendo, eu, tarefaId);
  avisar();
  const { error } = await supabase().from("fazendo_agora").upsert({ pessoa_id: idDe(eu), tarefa_id: tarefaId, desde: fazendo[tarefaId].desde });
  if (error) { fazendo = antes; falhou("Não consegui marcar a tarefa. Tente de novo."); }
}

/** Tira o selo de `eu`. */
async function pararDireto(): Promise<void> {
  if (!eu) return;
  const antes = fazendo;
  fazendo = trocarFazendo(fazendo, eu, null);
  avisar();
  // B8: a trava que não deixa apagar devolve 0 linhas SEM erro. r3 (Ferreiro 4): 0 linhas também é "a marca já não existe" (2º clique, outra aba): é recusa só se ela ficou
  const { data, error } = await supabase().from("fazendo_agora").delete().eq("pessoa_id", idDe(eu)).select("pessoa_id");
  const confere = !error && !data?.length ? await supabase().from("fazendo_agora").select("pessoa_id").eq("pessoa_id", idDe(eu)) : null;
  const ficou = !!confere && (!!confere.error || !!confere.data?.length); // r4 (novo 5): reconferência com erro não é "a marca já saiu"
  if (error || ficou) { fazendo = antes; falhou("Não consegui tirar a marca. Tente de novo."); }
}

export const removerTarefa = protegida(removerTarefaDireto);
export const postarAgora = protegida(postarAgoraDireto);
export const tentarDeNovo = protegida(tentarDeNovoDireto);
export const salvarEmpresa = protegida(salvarEmpresaDireto);
export const salvarTag = protegida(salvarTagDireto);
export const editarTag = protegida(editarTagDireto);
export const excluirTag = protegida(excluirTagDireto);
export const comecar = protegida(comecarDireto);
export const parar = protegida(pararDireto);
