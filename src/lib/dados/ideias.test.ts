import { beforeEach, describe, expect, it, vi } from "vitest";

const { falhou } = vi.hoisted(() => ({ falhou: vi.fn() }));
vi.mock("./repositorio", () => ({ falhou }));

// Banco de mentira (só o que ideias.ts usa): select/eq/order, upsert (com onConflict e ignoreDuplicates) e delete/eq.
type L = Record<string, unknown>;
let tabelas: Record<string, L[]>;
let recusar: Set<string>; // operações que o "banco" recusa: "upsert:ideias", "delete:ideias"...
let seq: number;
let segurar: Promise<void> | null = null; // se definido, os upserts em ideias só terminam quando ele resolver
let semColuna = false; // banco antes do 025: não conhece a coluna "links"
let removidos: string[] = []; // arquivos tirados do armário (Storage)
let recusaSe: ((mudanca: L) => boolean) | null = null; // recusa só o update cuja mudança combina
const fake = {
  storage: { from: () => ({ remove: async (c: string[]) => (recusar.has("remove:armario") ? { error: "x" } : (removidos.push(...c), { error: null })) }) },
  from(t: string) {
    const filtros: [string, unknown][] = [];
    let mudanca: L | null = null;
    let espera: Promise<void> | null = null;
    let fim: () => { data?: L[]; error: unknown } = () => ({ data: [], error: null });
    const q = {
      // depois de um update, o select devolve as linhas mudadas (update().eq().select(): o banco diz quantas mudou)
      select: (cols?: string) => (fim = mudanca ? (() => { if (recusar.has(`update:${t}`) || recusaSe?.(mudanca!)) return { error: "x" }; const ls = tabelas[t].filter((l) => filtros.every(([k, v]) => l[k] === v)); ls.forEach((l) => Object.assign(l, mudanca)); return { data: ls, error: null }; })
        : () => semColuna && cols?.includes("links") ? { error: "42703" } : ({ data: tabelas[t].filter((l) => filtros.every(([k, v]) => l[k] === v)).toSorted((a, b) => (a.seq as number) - (b.seq as number)), error: null }), q),
      eq: (k: string, v: unknown) => (filtros.push([k, v]), q),
      order: () => q,
      update: (campos: L) => ((mudanca = campos), (fim = () => (tabelas[t].filter((l) => filtros.every(([k, v]) => l[k] === v)).forEach((l) => Object.assign(l, campos)), { error: null })), q),
      delete: () => (fim = () => (recusar.has(`delete:${t}`) ? { error: "x" } : ((tabelas[t] = tabelas[t].filter((l) => !filtros.every(([k, v]) => l[k] === v))), { error: null })), q),
      upsert: (linhas: L | L[], o: { onConflict: string; ignoreDuplicates?: boolean }) => (espera = t === "ideias" ? segurar : null, fim = () => {
        if (recusar.has(`upsert:${t}`) || [].concat(linhas as never).some((l: L) => l.titulo === "falha") || (semColuna && [].concat(linhas as never).some((l: L) => "links" in l))) return { error: "x" };
        for (const l of [].concat(linhas as never) as L[]) {
          const i = tabelas[t].findIndex((x) => o.onConflict.split(",").every((k) => x[k] === l[k]));
          if (i < 0) tabelas[t].push({ ...l, seq: ++seq });
          else if (!o.ignoreDuplicates) tabelas[t][i] = { ...tabelas[t][i], ...l };
        }
        return { error: null };
      }, q),
      then: (ok: (r: unknown) => unknown) => (espera ?? Promise.resolve()).then(() => fim()).then(ok),
    };
    return q;
  },
};
vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => fake }));

let guardado: Map<string, string>;
const CHAVE = "grade-conteudo:ideias:v1";
const ex = (e: string, n: number, categoria: string, titulo: string) => ({ id: `${e}-ideia-${n}`, empresaId: e, categoria, titulo, texto: "t", links: [] });
const doNavegador = {
  you: [ex("you", 1, "Formatos de conteúdo", "A"), ex("you", 5, "Perfis - Contabilidade", "Você está pagando imposto a mais"), ex("you", 6, "Perfis - Contabilidade", "Ninguém te conta isso"), ex("you", 7, "Ganchos", "Erro")],
  beec: [ex("beec", 1, "Formatos na prática", "B"), { id: "11111111-1111-4111-8111-111111111111", empresaId: "beec", categoria: "Perfis - Empresários sellers", titulo: "Minha ideia", texto: "", link: "https://x" }],
};

beforeEach(() => {
  vi.resetModules(); // estado novo do módulo = "abrir a página de novo"
  tabelas = { ideias: [], ideias_categorias: [] };
  recusar = new Set();
  segurar = null;
  removidos = [];
  recusaSe = null;
  falhou.mockClear();
  semColuna = false;
  seq = 0;
  guardado = new Map([[CHAVE, JSON.stringify(doNavegador)]]);
  vi.stubGlobal("localStorage", { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => void guardado.set(k, v), removeItem: (k: string) => void guardado.delete(k) });
});

describe("cópia do navegador para o banco", () => {
  it("sobe só as ideias escritas pela pessoa, sem duplicar ao rodar de novo ou em outra aba; os exemplos não sobem", async () => {
    const m = await import("./ideias");
    await Promise.all([m.carregarIdeias("beec"), m.carregarIdeias("beec")]); // duas abas ao mesmo tempo
    expect(tabelas.ideias).toHaveLength(1);
    expect(tabelas.ideias[0]).toMatchObject({ id: "11111111-1111-4111-8111-111111111111", link: "https://x", categoria: "Perfis - Empresários sellers" });
    expect(tabelas.ideias_categorias.map((l) => l.nome)).toEqual(["Perfis - Empresários sellers"]);
    expect(guardado.get(`${CHAVE}:subiu:beec`)).toBe("1");
    expect(guardado.get(CHAVE)).toBe(JSON.stringify(doNavegador)); // nada apagado do navegador

    vi.resetModules(); // reabre a página
    await (await import("./ideias")).carregarIdeias("beec");
    expect(tabelas.ideias).toHaveLength(1);
  });

  it("exemplo apagado não volta quando outro endereço, com cópia antiga, abre depois (achado 1)", async () => {
    let m = await import("./ideias");
    await m.carregarIdeias("you");
    expect(tabelas.ideias).toHaveLength(0); // os 4 exemplos da You já estão no banco de verdade; a cópia não os sobe
    expect(guardado.get(`${CHAVE}:subiu:you`)).toBe("1");

    guardado = new Map([[CHAVE, JSON.stringify(doNavegador)]]); // outro endereço, sem marca
    vi.resetModules();
    m = await import("./ideias");
    await m.carregarIdeias("you");
    expect(tabelas.ideias).toHaveLength(0);
  });

  it("ideia real com uuid começando por 5eed sobe; só o id de exemplo derivado é descartado (Lupa re-revisão 1)", async () => {
    const real = "5eedc0de-1234-4abc-9def-0123456789ab";
    const derivado = "5eed0005-0000-4000-8000-796f75000000";
    guardado.set(CHAVE, JSON.stringify({ beec: [{ ...ex("beec", 1, "Formatos na prática", "Real"), id: real }, { ...ex("beec", 2, "Formatos na prática", "Derivado"), id: derivado }] }));
    await (await import("./ideias")).carregarIdeias("beec");
    expect(tabelas.ideias.map((l) => l.id)).toEqual([real]);
  });

  it("se o banco recusar, avisa na tela, não marca como subiu e tenta de novo na próxima abertura (achado 4)", async () => {
    recusar.add("upsert:ideias");
    let m = await import("./ideias");
    await m.carregarIdeias("beec");
    expect(guardado.has(`${CHAVE}:subiu:beec`)).toBe(false);
    expect(falhou).toHaveBeenCalledWith(expect.stringContaining("copiar"));
    recusar.clear();
    vi.resetModules();
    m = await import("./ideias");
    await m.carregarIdeias("beec");
    expect(tabelas.ideias).toHaveLength(1);
  });
});

describe("mural no banco: salvar, mover e apagar", () => {
  it("grava, edita e apaga; se o banco recusar, a tela volta ao que era", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Nova", texto: "", links: [] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1));
    m.gravarIdeia("you", { ...a, categoria: "Datas e sazonais" });
    await vi.waitFor(() => expect(tabelas.ideias[0].categoria).toBe("Datas e sazonais"));

    recusar.add("delete:ideias");
    m.apagarIdeia("you", a.id);
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1)); // recusou: continua no banco
    await m.carregarIdeias("you");
    expect(tabelas.ideias).toHaveLength(1);
    recusar.clear();
    m.apagarIdeia("you", a.id);
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(0));
  });

  it("M21: tirar print só apaga o arquivo depois de o banco guardar a folha; apagar a ideia leva os prints junto", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Com prints", texto: "", links: [], prints: ["ideias/you/1.png", "ideias/you/2.png"] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1));
    recusar.add("update:ideias");
    await m.tirarPrint("you", a, "ideias/you/1.png");
    expect(removidos).toEqual([]); // o banco recusou: o arquivo continua, e a folha volta a mostrá-lo
    expect(m.ideiasDe("you").ideias[0].prints).toEqual(["ideias/you/1.png", "ideias/you/2.png"]);
    recusar.clear();
    await m.tirarPrint("you", a, "ideias/you/1.png");
    expect(removidos).toEqual(["ideias/you/1.png"]);
    m.apagarIdeia("you", a.id);
    await vi.waitFor(() => expect(removidos).toEqual(["ideias/you/1.png", "ideias/you/2.png"]));
  });

  it("r3 N4: print que termina de subir depois de a ideia ser apagada não a recria; o arquivo sai do armário", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Vai sumir", texto: "", links: [] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1));
    tabelas.ideias = []; // outra pessoa apagou (a tela ainda mostra a folha)
    await m.anexarPrints("you", a.id, ["ideias/you/novo.png"]);
    expect(tabelas.ideias).toHaveLength(0); // não voltou
    expect(m.ideiasDe("you").ideias).toHaveLength(0); // e sai da tela
    expect(removidos).toEqual(["ideias/you/novo.png"]);
    m.apagarIdeia("you", a.id); // já tinha sido apagada aqui mesmo: o print que chega depois também não a recria
    await m.anexarPrints("you", a.id, ["ideias/you/outro.png"]);
    expect(tabelas.ideias).toHaveLength(0);
  });

  it("r4 novo 2: acrescentar Q falha, mas tirar P (gravado depois, com Q) deu certo: Q continua no armário", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Dois prints", texto: "", links: [], prints: ["P"] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1));
    recusaSe = (x) => (x.prints as string[]).includes("P"); // a inclusão de Q ([P, Q]) falha; a retirada de P ([Q]) passa
    await Promise.all([m.anexarPrints("you", a.id, ["Q"]), m.tirarPrint("you", m.ideiasDe("you").ideias[0], "P")]);
    expect(tabelas.ideias[0].prints).toEqual(["Q"]);
    expect(m.ideiasDe("you").ideias[0].prints).toEqual(["Q"]);
    expect(removidos).toEqual(["P"]); // antes: P e Q apagados, com o banco apontando para Q
  });

  it("M21 (conferência do Codex): print que o armário não apagou fica anotado e sai na próxima leitura do mural", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Com print", texto: "", links: [], prints: ["ideias/you/1.png"] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1));
    recusar.add("remove:armario");
    await m.tirarPrint("you", a, "ideias/you/1.png");
    expect(removidos).toEqual([]);
    expect(guardado.get("grade:prints-a-apagar")).toBe(JSON.stringify(["ideias/you/1.png"]));
    recusar.clear();
    await m.carregarIdeias("you");
    await vi.waitFor(() => expect(removidos).toEqual(["ideias/you/1.png"]));
    expect(guardado.has("grade:prints-a-apagar")).toBe(false);
  });

  it("coluna nova fica guardada mesmo vazia", async () => {
    guardado.clear();
    const m = await import("./ideias");
    m.criarCategoria("beec", "Coluna vazia");
    await vi.waitFor(() => expect(tabelas.ideias_categorias.map((l) => l.nome)).toEqual(["Coluna vazia"]));
  });
});

describe("vários links por ideia (257)", () => {
  it("guarda a lista, o 1º também em link; tirar e acrescentar funcionam; o link único de antes vira o 1º da lista", async () => {
    guardado.clear();
    tabelas.ideias.push({ id: "a", empresa_id: "you", categoria: "Ganchos", titulo: "Velha", texto: "", link: "https://um", links: [], seq: 1 });
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Visual", texto: "", links: ["https://a", "https://b", "https://c"] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(2));
    expect(tabelas.ideias[1]).toMatchObject({ link: "https://a", links: ["https://a", "https://b", "https://c"] });
    m.gravarIdeia("you", { ...a, links: ["https://b", "https://c"] });
    await vi.waitFor(() => expect(tabelas.ideias[1]).toMatchObject({ link: "https://b", links: ["https://b", "https://c"] }));
    m.gravarIdeia("you", { ...a, links: [] });
    await vi.waitFor(() => expect(tabelas.ideias[1]).toMatchObject({ link: null, links: [] }));
    await m.carregarIdeias("you");
    expect(tabelas.ideias[0].link).toBe("https://um");
  });

  it("antes do 025 (sem a coluna) o mural carrega e salva com o link único, sem erro", async () => {
    guardado.clear();
    semColuna = true;
    tabelas.ideias.push({ id: "a", empresa_id: "you", categoria: "Ganchos", titulo: "Velha", texto: "", link: "https://um", seq: 1 });
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    m.gravarIdeia("you", { categoria: "Ganchos", titulo: "Nova", texto: "", links: ["https://x", "https://y"] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(2));
    expect(tabelas.ideias[1]).toMatchObject({ link: "https://x" });
    expect(tabelas.ideias[1]).not.toHaveProperty("links");
  });
});

describe("conferências da Lupa (261)", () => {
  it("r2 B5: leitura descartada por uma gravação no ar é refeita quando ela acaba (a ideia nova de outra pessoa aparece)", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    let soltarGravacao!: () => void;
    segurar = new Promise<void>((ok) => (soltarGravacao = ok));
    m.gravarIdeia("you", { categoria: "Ganchos", titulo: "minha", texto: "", links: [] }); // gravação no ar
    tabelas.ideias.push({ id: "99999999-9999-4999-8999-999999999999", empresa_id: "you", categoria: "Ganchos", titulo: "do Matheus", texto: "", link: null, links: [], prints: [], seq: 99 });
    await m.carregarIdeias("you"); // o aviso do tempo real: lê no meio da gravação e descarta
    expect(m.ideiasDe("you").ideias.map((i) => i.titulo)).toEqual(["minha"]);
    soltarGravacao();
    await vi.waitFor(() => expect(m.ideiasDe("you").ideias.map((i) => i.titulo).sort()).toEqual(["do Matheus", "minha"]));
  });

  it("falha antiga não desfaz a edição posterior que deu certo (achado 6)", async () => {
    guardado.clear();
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    const a = m.gravarIdeia("you", { categoria: "Ganchos", titulo: "base", texto: "", links: [] });
    await vi.waitFor(() => expect(tabelas.ideias).toHaveLength(1));
    m.gravarIdeia("you", { ...a, titulo: "falha" }); // o banco recusa
    m.gravarIdeia("you", { ...a, titulo: "boa" });
    await vi.waitFor(() => expect(falhou).toHaveBeenCalled());
    expect(m.ideiasDe("you").ideias[0].titulo).toBe("boa");
  });

  it("a gravação de uma empresa não descarta a leitura de outra (achado 7)", async () => {
    guardado.clear();
    tabelas.ideias.push({ id: "a", empresa_id: "you", categoria: "Ganchos", titulo: "Velha", texto: "", link: null, links: [], seq: 1 });
    const m = await import("./ideias");
    let soltar!: () => void;
    segurar = new Promise<void>((ok) => (soltar = ok));
    m.gravarIdeia("beec", { categoria: "Ganchos", titulo: "Lenta", texto: "", links: [] });
    await m.carregarIdeias("you");
    expect(m.ideiasDe("you").ideias).toHaveLength(1);
    soltar();
  });

  it("categoria vazia guardada aparece na lista de categorias (achado 8)", async () => {
    guardado.clear();
    tabelas.ideias_categorias.push({ empresa_id: "you", nome: "Vazia", seq: 1 });
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    expect(m.ideiasDe("you")).toMatchObject({ ideias: [], categorias: ["Vazia"] });
  });
});

describe("colunas do mural (298)", () => {
  const abrir = async () => {
    guardado.clear();
    tabelas.ideias_categorias.push({ empresa_id: "you", nome: "A", seq: 1 }, { empresa_id: "you", nome: "B", seq: 2 });
    tabelas.ideias.push({ id: "i", empresa_id: "you", categoria: "B", titulo: "x", texto: "", link: null, links: [], seq: 1 });
    const m = await import("./ideias");
    await m.carregarIdeias("you");
    return m;
  };
  it("mover troca a coluna de lugar e guarda a ordem", async () => {
    const m = await abrir();
    m.moverCategoria("you", "B", -1);
    expect(m.ideiasDe("you").categorias).toEqual(["B", "A"]);
    await vi.waitFor(() => expect(tabelas.ideias_categorias.map((c) => [c.nome, c.ordem])).toEqual([["A", 2], ["B", 1]]));
    m.moverCategoria("you", "B", -1); // já está na ponta: nada muda
    expect(m.ideiasDe("you").categorias).toEqual(["B", "A"]);
  });
  it("apagar só vale com a coluna vazia", async () => {
    const m = await abrir();
    expect(m.apagarCategoria("you", "B")).toBe(false);
    expect(m.ideiasDe("you").categorias).toEqual(["A", "B"]);
    expect(m.apagarCategoria("you", "A")).toBe(true);
    expect(m.ideiasDe("you").categorias).toEqual(["B"]);
  });
  it("renomear recusa nome já usado (sem acento/maiúscula) e leva as ideias junto", async () => {
    const m = await abrir();
    expect(m.renomearCategoria("you", "A", "b")).toBe(false);
    expect(m.renomearCategoria("you", "B", "Ç")).toBe(true);
    expect(m.ideiasDe("you")).toMatchObject({ categorias: ["A", "Ç"], ideias: [{ categoria: "Ç" }] });
    await vi.waitFor(() => expect(tabelas.ideias[0].categoria).toBe("Ç"));
    expect(tabelas.ideias_categorias.map((c) => c.nome).sort()).toEqual(["A", "Ç"]);
  });
});
