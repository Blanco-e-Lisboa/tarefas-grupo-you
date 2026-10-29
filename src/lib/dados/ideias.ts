"use client";
// Ideias de conteúdo (itens 65 e 256). Moram no banco (public.ideias + public.ideias_categorias, supabase/_colar/024):
// Natham e Matheus veem e editam as mesmas, por empresa. Escrita otimista: a tela muda na hora e, se o banco recusar, volta e avisa.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { falhou } from "./repositorio";
import { AVISOS, ligarTempoReal } from "./tempo-real";

export type Ideia = { id: string; empresaId: string; categoria: string; titulo: string; texto: string; links: string[]; prints: string[] };
type Estado = { ideias: Ideia[]; categorias: string[] };
type Linha = { id: string; empresa_id: string; categoria: string; titulo: string; texto: string; link: string | null; links?: string[] | null; prints?: string[] | null };

const VAZIO: Estado = { ideias: [], categorias: [] };
const CHAVE = "grade-conteudo:ideias:v1"; // onde ficavam, no navegador, antes do banco
const marca = (e: string) => `${CHAVE}:subiu:${e}`;

let estado = new Map<string, Estado>(); // troca o mapa a cada mudança (exigência do useSyncExternalStore)
const geracao = new Map<string, number>(); // por empresa: sobe a cada escrita; uma leitura que começou antes de uma escrita é velha e não vale
const pendentes = new Map<string, number>(); // por empresa: escritas ainda não confirmadas; a leitura daquela empresa não pisa por cima delas
const versoes = new Map<string, number>(); // por ideia: nº da última gravação; uma falha antiga só desfaz se ainda for a última
const ouvintes = new Set<() => void>();
let iniciado = false;
let desligarTempoReal: (() => void) | undefined;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  if (!iniciado && typeof window !== "undefined") {
    iniciado = true;
    document.addEventListener("visibilitychange", () => { if (!document.hidden) [...estado.keys()].forEach((e) => void carregarIdeias(e)); });
  }
  desligarTempoReal ??= ligarTempoReal("ideias", AVISOS.ideias, () => [...estado.keys()].forEach((e) => void carregarIdeias(e))); // 274
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};
const trocar = (e: string, f: (s: Estado) => Estado) => { estado = new Map(estado).set(e, f(estado.get(e) ?? VAZIO)); ouvintes.forEach((o) => o()); };
const com = (cats: string[], c: string) => (cats.includes(c) ? cats : [...cats, c]);

// Item 257: várias referências por ideia. Antes do 025 (coluna "links") só existe o link único; o código serve aos dois casos,
// para o mural nunca quebrar no meio da colagem. A coluna "link" continua sendo o 1º da lista (cópia para quem ainda lê só ela).
let comLista = true; // o banco já tem a coluna "links"? (descoberto a cada leitura)
let comPrints = true; // item 300: o banco já tem a coluna "prints" (e a gaveta ideias/ no Storage)?
let comOrdem = true; // item 298: o banco já tem a coluna "ordem" nas colunas do mural? Sem ela, a ordem nova vale só até recarregar
const daLinha = (l: Linha): Ideia => ({ id: l.id, empresaId: l.empresa_id, categoria: l.categoria, titulo: l.titulo, texto: l.texto, links: l.links?.length ? l.links : l.link ? [l.link] : [], prints: l.prints ?? [] });
const paraBanco = (i: Omit<Ideia, "links" | "prints"> & { links?: string[]; link?: string; prints?: string[] }) => {
  const links = i.links ?? (i.link ? [i.link] : []);
  return { id: i.id, empresa_id: i.empresaId, categoria: i.categoria, titulo: i.titulo, texto: i.texto, link: links[0] ?? null, ...(comLista && { links }), ...(comPrints && { prints: i.prints ?? [] }) };
};

// ---- cópia única do navegador para o banco ------------------------------------------------------------------------------
const ehUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
/** Os exemplos do código tinham ids como "you-ideia-5" (ou o uuid derivado "5eed...", da cópia anterior). Eles já estão no banco:
 *  não sobem de novo, senão um exemplo apagado voltaria por outro endereço. */
// Só o formato completo que idDoExemplo gerava (5eedNNNN-0000-4000-8000-...): um uuid real que por acaso comece com "5eed" sobe normalmente.
const ehExemplo = (id: string) => !ehUuid(id) || /^5eed[0-9a-f]{4}-0000-4000-8000-[0-9a-f]{12}$/i.test(id);

const subidas = new Map<string, Promise<boolean>>();
/** Uma vez por abertura e empresa: o que esta pessoa tinha guardado no navegador sobe para o banco sem pisar no que já está lá
 *  (ignora o que já existe pelo id). Só depois do banco confirmar é que a marca "subiu" é gravada; os dados antigos ficam
 *  no navegador como cópia de segurança, mas nunca mais são lidos. */
export function subirIdeiasDoNavegador(e: string): Promise<boolean> {
  let p = subidas.get(e);
  if (!p) subidas.set(e, (p = subir(e).then((ok) => (ok || subidas.delete(e), ok))));
  return p;
}
async function subir(e: string): Promise<boolean> {
  try {
    if (localStorage.getItem(marca(e))) return true;
    const lista = (JSON.parse(localStorage.getItem(CHAVE) || "{}") as Record<string, (Omit<Ideia, "links"> & { links?: string[]; link?: string })[]>)[e];
    if (!lista?.length) return true;
    const linhas = lista.filter((i) => !ehExemplo(i.id)).map((i) => paraBanco({ ...i, empresaId: e, texto: i.texto ?? "" }));
    if (!linhas.length) { localStorage.setItem(marca(e), "1"); return true; }
    const cats = [...new Set(linhas.map((l) => l.categoria))].map((nome) => ({ empresa_id: e, nome }));
    const sb = supabase();
    // categorias antes: uma ideia nunca fica numa coluna que não existe. Linhas na ordem original = cards na mesma ordem.
    const a = await sb.from("ideias_categorias").upsert(cats, { onConflict: "empresa_id,nome", ignoreDuplicates: true });
    if (a.error) return false;
    const b = await sb.from("ideias").upsert(linhas, { onConflict: "id", ignoreDuplicates: true });
    if (b.error) return false;
    localStorage.setItem(marca(e), "1");
    return true;
  } catch {
    return false;
  }
}

// ---- leitura -------------------------------------------------------------------------------------------------------------
export async function carregarIdeias(e: string) {
  const copiou = await subirIdeiasDoNavegador(e);
  void apagarPrints([]); // M21: tenta de novo o que o armário não apagou da última vez
  const g = geracao.get(e) ?? 0;
  const sb = supabase();
  const ler = (cols: string) => sb.from("ideias").select(cols).eq("empresa_id", e).order("seq");
  const [i0, c0] = await Promise.all([
    ler("id, empresa_id, categoria, titulo, texto, link, links, prints"),
    sb.from("ideias_categorias").select("nome").eq("empresa_id", e).order("ordem", { nullsFirst: false }).order("seq"),
  ]);
  let i = i0;
  let c = c0;
  comPrints = !i.error;
  comOrdem = !c.error;
  if (c.error) c = await sb.from("ideias_categorias").select("nome").eq("empresa_id", e).order("seq"); // ainda sem a coluna "ordem"
  if (i.error) i = await ler("id, empresa_id, categoria, titulo, texto, link, links"); // ainda sem a coluna "prints"
  comLista = !i.error;
  if (i.error) i = await ler("id, empresa_id, categoria, titulo, texto, link"); // ainda sem a coluna "links": lê o link único
  if (i.error || c.error) return falhou("Não consegui carregar as ideias. Recarregue a página.");
  if (!copiou) falhou("Não consegui copiar as ideias que estavam só neste navegador. Elas continuam guardadas; tento de novo na próxima abertura.");
  // Leitura velha (uma gravação começou no meio, ou está no ar) não pisa na tela. r2 B5: mas é refeita, senão a mudança de outra pessoa
  // que ela trazia ficava fora da tela até o próximo aviso. Gravação no ar: relê quando ela acabar; já acabou: relê agora.
  if (pendentes.get(e) || (geracao.get(e) ?? 0) !== g) { if (pendentes.get(e)) relerDepois.add(e); else void carregarIdeias(e); return; }
  const ideias = (i.data as unknown as Linha[]).map(daLinha);
  trocar(e, () => ({ ideias, categorias: ideias.reduce((cats, x) => com(cats, x.categoria), (c.data ?? []).map((x) => x.nome as string)) }));
}

// ---- escrita otimista ----------------------------------------------------------------------------------------------------
async function escrever(e: string, op: PromiseLike<{ error: unknown }>, desfazer: () => void, aviso: string | (() => string)) {
  pendentes.set(e, (pendentes.get(e) ?? 0) + 1);
  geracao.set(e, (geracao.get(e) ?? 0) + 1);
  const { error } = await op;
  pendentes.set(e, pendentes.get(e)! - 1);
  if (error) { desfazer(); falhou(typeof aviso === "function" ? aviso() : aviso); }
  if (!pendentes.get(e) && relerDepois.delete(e)) void carregarIdeias(e); // r2 B5: a leitura que esta gravação atropelou
  return !error;
}
const relerDepois = new Set<string>(); // empresas cuja leitura foi descartada com gravação no ar
const versao = (id: string) => { const v = (versoes.get(id) ?? 0) + 1; versoes.set(id, v); return v; };
const colocar = (e: string, id: string, ideia: Ideia | undefined) =>
  trocar(e, (s) => ({ ...s, ideias: ideia ? (s.ideias.some((i) => i.id === id) ? s.ideias.map((i) => (i.id === id ? ideia : i)) : [...s.ideias, ideia]) : s.ideias.filter((i) => i.id !== id) }));

/** Grava e devolve a ideia já na tela e a confirmação do banco (true = gravou). */
function gravar(e: string, nova: Omit<Ideia, "id" | "empresaId" | "prints"> & { id?: string; prints?: string[] }) {
  const ideia: Ideia = { prints: [], ...nova, id: nova.id ?? crypto.randomUUID(), empresaId: e };
  const antes = (estado.get(e) ?? VAZIO).ideias.find((i) => i.id === ideia.id);
  const v = versao(ideia.id);
  colocar(e, ideia.id, ideia);
  trocar(e, (s) => ({ ...s, categorias: com(s.categorias, ideia.categoria) }));
  const ok = escrever(e, supabase().from("ideias").upsert(paraBanco(ideia), { onConflict: "id" }), () => versoes.get(ideia.id) === v && colocar(e, ideia.id, antes), "Não consegui salvar a ideia. Tente de novo.");
  return { ideia, ok };
}
/** Cria (sem id) ou edita (com id existente). Devolve a ideia já na tela; o banco confirma depois. */
export const gravarIdeia = (e: string, nova: Parameters<typeof gravar>[1]): Ideia => gravar(e, nova).ideia;

/** Apaga uma ideia (Mural de folhas). M21: os prints dela saem do armário só depois que o banco apagou a ideia (antes ficavam órfãos). */
export function apagarIdeia(e: string, id: string) {
  const antes = (estado.get(e) ?? VAZIO).ideias.find((i) => i.id === id);
  if (!antes) return;
  const v = versao(id);
  colocar(e, id, undefined);
  void escrever(e, supabase().from("ideias").delete().eq("id", id), () => versoes.get(id) === v && colocar(e, id, antes), "Não consegui apagar a ideia. Tente de novo.")
    .then((ok) => { if (ok) void apagarPrints(antes.prints); });
}

/** r3 N4: muda SÓ a lista de prints de uma ideia que ainda existe (update; nunca cria). Antes ia pelo gravar (upsert): o print que terminava
    de subir depois de a ideia ser apagada a recriava com o mesmo id. Apagada (aqui ou por outra pessoa): sai da tela e devolve false. */
async function trocarPrints(e: string, id: string, mudar: (prints: string[]) => string[]): Promise<boolean> {
  const atual = (estado.get(e) ?? VAZIO).ideias.find((i) => i.id === id);
  if (!atual) return false;
  const prints = mudar(atual.prints), v = versao(id);
  colocar(e, id, { ...atual, prints });
  let sumiu = false;
  const op = supabase().from("ideias").update({ prints }).eq("id", id).select("id")
    .then((r) => { sumiu = !r.error && !r.data?.length; return { error: r.error ?? (sumiu ? "ideia apagada" : null) }; });
  return escrever(e, op, () => versoes.get(id) === v && colocar(e, id, sumiu ? undefined : atual),
    () => (sumiu ? "Esta ideia foi apagada; o print não foi guardado." : "Não consegui guardar o print. Tente de novo."));
}

/** Print que terminou de subir entra na folha. Se a folha não existe mais (ou o banco recusou), o arquivo sai do armário.
    r4 (novo 2): menos o que outra gravação desta folha, feita depois, já levou para o banco (ex.: tirar outro print grava a lista com este). */
export async function anexarPrints(e: string, id: string, novos: string[]) {
  if (await trocarPrints(e, id, (p) => [...p, ...novos])) return;
  const ficou = (estado.get(e) ?? VAZIO).ideias.find((i) => i.id === id)?.prints ?? [];
  await apagarPrints(novos.filter((n) => !ficou.includes(n)));
}

/** M21: tira o print da folha e só apaga o arquivo DEPOIS que o banco guardou a folha sem ele (se a gravação falha, o print volta inteiro). */
export async function tirarPrint(e: string, ideia: Ideia, caminho: string) {
  if (await trocarPrints(e, ideia.id, (p) => p.filter((x) => x !== caminho))) await apagarPrints([caminho]);
}

/** Nova coluna do mural; fica guardada mesmo vazia. */
export function criarCategoria(e: string, nome: string) {
  trocar(e, (s) => ({ ...s, categorias: com(s.categorias, nome) }));
  void escrever(
    e,
    supabase().from("ideias_categorias").upsert({ empresa_id: e, nome }, { onConflict: "empresa_id,nome", ignoreDuplicates: true }),
    () => trocar(e, (s) => ({ ...s, categorias: s.categorias.filter((c) => c !== nome || s.ideias.some((i) => i.categoria === nome)) })),
    "Não consegui criar a categoria. Tente de novo.",
  );
}

// ---- colunas do mural (298): renomear, mover, apagar --------------------------------------------------------------------
const ordemParaBanco = (e: string, cats: string[]) => cats.map((nome, n) => ({ empresa_id: e, nome, ...(comOrdem && { ordem: n + 1 }) }));
const reler = (e: string) => () => void carregarIdeias(e); // falha: relê o banco e a tela volta ao que ele tem
const emSerie = async (ops: (() => PromiseLike<{ error: unknown }>)[]) => { for (const op of ops) { const r = await op(); if (r.error) return r; } return { error: null }; };

/** Grava a ordem atual das colunas (todas, de 1 a N). Sem a coluna "ordem" no banco, só avisa que vale até recarregar. */
function guardarOrdem(e: string, cats: string[], aviso: string) {
  if (!comOrdem) { falhou("A ordem das colunas ainda não pode ser guardada no banco (falta colar o SQL). Ela vale até recarregar a página."); return; }
  void escrever(e, supabase().from("ideias_categorias").upsert(ordemParaBanco(e, cats), { onConflict: "empresa_id,nome" }), reler(e), aviso);
}

/** Move a coluna uma casa (-1 esquerda, +1 direita) e guarda a ordem para todo mundo. */
export function moverCategoria(e: string, nome: string, passo: -1 | 1) {
  const cats = (estado.get(e) ?? VAZIO).categorias, de = cats.indexOf(nome), para = de + passo;
  if (de < 0 || para < 0 || para >= cats.length) return;
  const nova = [...cats];
  [nova[de], nova[para]] = [nova[para], nova[de]];
  trocar(e, (s) => ({ ...s, categorias: nova }));
  guardarOrdem(e, nova, "Não consegui guardar a nova ordem das colunas. Tente de novo.");
}

/** Renomeia a coluna e leva as ideias dela junto. Devolve false se já existe outra coluna com esse nome. */
export function renomearCategoria(e: string, velho: string, novo: string): boolean {
  const s = estado.get(e) ?? VAZIO, norm = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (s.categorias.some((c) => c !== velho && norm(c) === norm(novo))) return false;
  if (novo === velho) return true;
  const cats = s.categorias.map((c) => (c === velho ? novo : c));
  trocar(e, (x) => ({ categorias: cats, ideias: x.ideias.map((i) => (i.categoria === velho ? { ...i, categoria: novo } : i)) }));
  const sb = supabase();
  void escrever(
    e,
    emSerie([
      () => sb.from("ideias_categorias").upsert(ordemParaBanco(e, cats), { onConflict: "empresa_id,nome" }), // a coluna nova nasce antes: a ideia nunca fica sem coluna
      () => sb.from("ideias").update({ categoria: novo }).eq("empresa_id", e).eq("categoria", velho),
      () => sb.from("ideias_categorias").delete().eq("empresa_id", e).eq("nome", velho),
    ]),
    reler(e),
    "Não consegui renomear a coluna. Tente de novo.",
  );
  return true;
}

/** Apaga a coluna, só se estiver vazia (as ideias nunca somem junto). Devolve false se ainda tem ideia dentro. */
export function apagarCategoria(e: string, nome: string): boolean {
  const s = estado.get(e) ?? VAZIO;
  if (s.ideias.some((i) => i.categoria === nome)) return false;
  trocar(e, (x) => ({ ...x, categorias: x.categorias.filter((c) => c !== nome) }));
  void escrever(e, supabase().from("ideias_categorias").delete().eq("empresa_id", e).eq("nome", nome), reler(e), "Não consegui apagar a coluna. Tente de novo.");
  return true;
}

// ---- prints (300) -------------------------------------------------------------------------------------------------------
const BALDE = "arquivos"; // o mesmo balde dos anexos; os prints ficam na gaveta ideias/<empresa>/
const ATE_10_MB = 10 * 1024 * 1024;

/** Sobe a imagem colada e devolve o caminho dela, para a folha guardar na lista. Devolve null (e avisa) se não deu. */
export async function subirPrint(e: string, arquivo: File): Promise<string | null> {
  if (!comPrints) { falhou("Prints ainda não podem ser guardados (falta colar o SQL do item 300)."); return null; }
  if (arquivo.size > ATE_10_MB) { falhou("Essa imagem passa de 10 MB. Use uma menor."); return null; }
  const caminho = `ideias/${e}/${crypto.randomUUID()}.${arquivo.type.split("/")[1]?.replace(/[^\w]/g, "") || "png"}`;
  const { error } = await supabase().storage.from(BALDE).upload(caminho, arquivo, { contentType: arquivo.type });
  if (error) { falhou("Não consegui guardar o print. Tente de novo."); return null; }
  return caminho;
}

/** Tira os arquivos do armário (a folha já deixou de listá-los). M21 (conferência do Codex): confere a resposta; o que não saiu fica anotado
    neste navegador e sai na próxima tentativa (a próxima leitura do mural, ou o próximo print apagado). */
const A_APAGAR = "grade:prints-a-apagar";
const lerAApagar = (): string[] => { try { return JSON.parse(localStorage.getItem(A_APAGAR) ?? "[]"); } catch { return []; } };
export async function apagarPrints(caminhos: readonly string[]) {
  const todos = [...new Set([...lerAApagar(), ...caminhos])];
  if (!todos.length) return;
  let falhou = true;
  try { falhou = !!(await supabase().storage.from(BALDE).remove(todos)).error; } catch { /* sem rede: fica anotado */ }
  try { if (falhou) localStorage.setItem(A_APAGAR, JSON.stringify(todos)); else localStorage.removeItem(A_APAGAR); } catch { /* sem armazenamento: não lembra */ }
}

/** Endereços temporários (1 hora) para mostrar os prints; o balde é privado. */
export async function urlsDosPrints(caminhos: string[]): Promise<Map<string, string>> {
  const { data } = caminhos.length ? await supabase().storage.from(BALDE).createSignedUrls(caminhos, 3600) : { data: [] };
  return new Map((data ?? []).flatMap((u) => (u.path && u.signedUrl ? [[u.path, u.signedUrl] as const] : [])));
}

export const ideiasDe = (e: string) => estado.get(e) ?? VAZIO;

/** Ideias e colunas de uma empresa (reativo). Vem do banco; antes de chegar, vazio. */
export function useIdeias(e: string) {
  const s = useSyncExternalStore(assinar, () => ideiasDe(e), () => VAZIO);
  useEffect(() => { void carregarIdeias(e); }, [e]);
  const salvar = useCallback((nova: Parameters<typeof gravarIdeia>[1]) => gravarIdeia(e, nova), [e]);
  const apagar = useCallback((id: string) => apagarIdeia(e, id), [e]);
  const criar = useCallback((nome: string) => criarCategoria(e, nome), [e]);
  const mover = useCallback((nome: string, passo: -1 | 1) => moverCategoria(e, nome, passo), [e]);
  const renomear = useCallback((velho: string, novo: string) => renomearCategoria(e, velho, novo), [e]);
  const apagarCat = useCallback((nome: string) => apagarCategoria(e, nome), [e]);
  return { ideias: s.ideias, categorias: s.categorias, salvar, apagar, criarCategoria: criar, moverCategoria: mover, renomearCategoria: renomear, apagarCategoria: apagarCat };
}
