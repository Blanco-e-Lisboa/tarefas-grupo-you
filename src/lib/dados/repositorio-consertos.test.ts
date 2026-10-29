// Pente fino r1 (Lince): A1 (versão do card), B7 (dois salvar seguidos), B8 (parar barrado), M9 (leitura durante envio), M10 (anexos que não carregam).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
const base = { tipo: "postagem", empresa_id: "you", rede: null, etapa: "edicao", responsavel_id: "p1", inicio: null, fim: null, dia_inteiro: false, cor: "etiqueta-5", concluida: false, links: [], dono_id: "p1", criado_por: "p1", objetivo: null, notas: null, aprovador: null, enviada_por: null };
let linhas: Linha[];
let fazendoBanco: Linha[];
let apagadosFazendo: Linha[]; // o que o delete...select("pessoa_id") devolve (vazio = a trava não deixou)
let leiturasTarefas = 0;
let falharFazendo = false; // a leitura de fazendo_agora dá erro (r4 novo 5)
let segurarLeitura = false; // segura a leitura de tarefas (para ver a tela ANTES da releitura)
let soltarLeitura: (() => void) | undefined;
type Rpc = (nome: string, args: { p_versao?: number }) => Promise<{ data: unknown; error: unknown }>;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
const resposta = (tabela: string): { data: unknown; error: unknown } => tabela === "fazendo_agora" && falharFazendo ? { data: null, error: "rede" } : ({
  data: tabela === "pessoas" ? [{ id: "p1", slug: "natham", user_id: "u1" }] : tabela === "tarefas" ? linhas.map((l) => ({ ...base, ...l })) : tabela === "fazendo_agora" ? fazendoBanco : [],
  error: null,
});
const cadeia = (tabela: string) => {
  let apagando = false;
  const c: Record<string, unknown> = {};
  for (const k of ["select", "order", "eq", "not", "in", "upsert", "insert", "update"]) c[k] = () => c;
  c.delete = () => ((apagando = true), c);
  c.then = (ok: (r: unknown) => void) => {
    if (apagando) return ok({ data: apagadosFazendo, error: null });
    if (tabela === "tarefas") leiturasTarefas++;
    if (tabela === "tarefas" && segurarLeitura) return void (soltarLeitura = () => ok(resposta(tabela))); // só responde quando o teste soltar
    ok(resposta(tabela));
  };
  return c;
};
const anexos = vi.hoisted(() => ({ carregar: vi.fn(), sincronizar: vi.fn() }));
vi.mock("./anexos", () => ({ carregarAnexos: anexos.carregar, sincronizarAnexos: anexos.sincronizar, ErroAnexo: class extends Error {} }));
vi.mock("./linha-caderno", () => ({ gravarExtras: async () => true }));
vi.mock("./tempo-real", () => ({ AVISOS: { esteira: [] }, ligarTempoReal: () => () => {} }));
vi.mock("@/lib/supabase/cliente", () => ({
  supabase: () => ({ from: cadeia, rpc: (n: string, a: { p_versao?: number }) => rpc(n, a), auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } } }) } }),
}));
vi.stubGlobal("window", {});
vi.stubGlobal("document", { hidden: false, addEventListener: () => {} });

let m: typeof import("./repositorio");
beforeEach(async () => {
  vi.resetModules();
  linhas = [{ id: "t1", titulo: "x", versao: 5 }];
  fazendoBanco = [];
  apagadosFazendo = [];
  falharFazendo = false;
  segurarLeitura = false;
  anexos.carregar.mockReset().mockResolvedValue(new Map());
  anexos.sincronizar.mockReset().mockImplementation(async (_sb, _id, _e, _p, _antes, agora) => agora);
  rpc = vi.fn<Rpc>(async (_n, a) => ({ data: (a.p_versao ?? 0) + 1, error: null }));
  m = await import("./repositorio");
  m.assinar(() => {});
  await vi.waitFor(() => expect(m.lerTarefas()).toHaveLength(1));
});
const card = () => m.lerTarefas()[0];

describe("A1: versão do card", () => {
  it("manda a versão que a tela viu; o 2º salvar seguido manda a que o 1º deixou (não é recusado à toa)", async () => {
    const a = m.salvarTarefa({ ...card(), titulo: "a" });
    const b = m.salvarTarefa({ ...card(), titulo: "b" }); // nasceu da cópia otimista, ainda com a versão 5
    await Promise.all([a, b]);
    expect(rpc.mock.calls.map(([, x]) => (x as { p_versao: number }).p_versao)).toEqual([5, 6]);
    expect(card().versao).toBe(7);
  });
  it("salvar sem mudança (o banco devolve o mesmo número) não trava o salvar seguinte", async () => {
    rpc.mockResolvedValueOnce({ data: 5, error: null }); // nada mudou: o número continua 5
    await m.salvarTarefa({ ...card() });
    const seguinte = m.salvarTarefa({ ...card(), titulo: "depois" });
    expect(await Promise.race([seguinte.then(() => "terminou"), new Promise((ok) => setTimeout(() => ok("travou"), 500))])).toBe("terminou");
    expect(rpc.mock.calls.map(([, x]) => x.p_versao)).toEqual([5, 5]);
  });
  it("card que mudou no banco: recusa, a tela volta e avisa 'Este card mudou...'", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: "40001", message: "card mudou" } });
    expect(await m.salvarTarefa({ ...card(), titulo: "velho por cima" })).toBeNull();
    expect(card().titulo).toBe("x");
    expect(m.lerErro()).toBe(m.MUDOU);
  });
});

it("B7: o 1º salvar que falha não desfaz o 2º que já está na tela", async () => {
  let falhar!: () => void;
  rpc.mockImplementationOnce(() => new Promise((ok) => { falhar = () => ok({ data: null, error: { code: "XX000" } }); }));
  const a = m.salvarTarefa({ ...card(), titulo: "a" });
  const b = m.salvarTarefa({ ...card(), titulo: "b" });
  segurarLeitura = true; // a releitura depois da falha não chega: o teste vê a tela como o salvar a deixou
  await vi.waitFor(() => expect(falhar).toBeDefined());
  falhar();
  await Promise.all([a, b]);
  expect(card().titulo).toBe("b");
});

it("B8: parar barrado pela trava (0 linhas, sem erro) não some com a marca", async () => {
  fazendoBanco = [{ pessoa_id: "p1", tarefa_id: "t1", desde: "2026-10-29T10:00:00Z" }];
  await m.carregarAgora();
  expect(m.lerFazendo().t1?.quem).toBe("natham");
  await m.parar();
  expect(m.lerFazendo().t1?.quem).toBe("natham");
  expect(m.lerErro()).toMatch(/tirar a marca/);
});

it("M9: enquanto o anexo sobe, a tela continua recebendo o que os outros mudam", async () => {
  anexos.sincronizar.mockImplementation(() => new Promise(() => {})); // envio que não termina
  const foto = { nome: "f.png", tipo: "imagem" as const, pendente: new File(["x"], "f.png") };
  void m.salvarTarefa({ ...card(), arquivos: [foto] });
  await vi.waitFor(() => expect(anexos.sincronizar).toHaveBeenCalled());
  linhas = [{ id: "t1", titulo: "mudado por outra pessoa", versao: 7 }];
  await m.carregarAgora();
  expect(card().titulo).toBe("mudado por outra pessoa");
  expect(card().arquivos).toEqual([foto]); // o que ainda sobe continua na tela
});

it("bug novo 6 do Codex: o fim do envio não apaga da tela o anexo que chegou durante ele", async () => {
  let terminar!: () => void;
  const foto = { nome: "f.png", tipo: "imagem" as const, pendente: new File(["x"], "f.png") };
  const subida = { id: "a1", nome: "f.png", tipo: "imagem" as const, driveId: "d1" };
  const daOutra = { id: "b9", nome: "outra.png", tipo: "imagem" as const, driveId: "d9" };
  anexos.sincronizar.mockImplementation(() => new Promise((ok) => { terminar = () => ok([subida]); }));
  const salvar = m.salvarTarefa({ ...card(), arquivos: [foto] });
  await vi.waitFor(() => expect(terminar).toBeDefined());
  anexos.carregar.mockResolvedValueOnce(new Map([["t1", [daOutra]]])); // outra pessoa anexou enquanto a foto subia
  await m.carregarAgora();
  terminar();
  await salvar;
  expect(card().arquivos.map((a) => a.id)).toEqual(["a1", "b9"]);
});

it("M10: falha ao ler os anexos mantém os que já estavam e avisa", async () => {
  const foto = { id: "a1", nome: "f.png", tipo: "imagem" as const, driveId: "d1" };
  anexos.carregar.mockResolvedValueOnce(new Map([["t1", [foto]]]));
  await m.carregarAgora();
  expect(card().arquivos).toEqual([foto]);
  anexos.carregar.mockResolvedValueOnce(null);
  await m.carregarAgora();
  expect(card().arquivos).toEqual([foto]);
  expect(m.lerErro()).toMatch(/anexos/);
});

describe("pente fino r2", () => {
  it("F1: a ficha aberta de um card que outra pessoa apagou manda o número de edição (o banco recusa e não recria o card)", async () => {
    const aberto = card(); // a ficha nasceu desta cópia
    linhas = [];
    await m.carregarAgora(); // o tempo real tirou o card apagado da memória
    expect(m.lerTarefas()).toHaveLength(0);
    rpc.mockResolvedValueOnce({ data: null, error: { code: "P0002", message: "card apagado enquanto a ficha estava aberta" } });
    expect(await m.salvarTarefa({ ...aberto, notas: "legenda nova" })).toBeNull();
    expect(rpc.mock.calls.at(-1)?.[1].p_versao).toBe(5);
    expect(m.lerTarefas()).toHaveLength(0); // não voltou
    expect(m.lerErro()).toBe(m.APAGADO);
  });
  it("F1: card novo (sem id) continua sem número", async () => {
    await m.salvarTarefa({ ...card(), id: undefined, titulo: "novo" });
    expect(rpc.mock.calls.at(-1)?.[1].p_versao).toBeUndefined();
  });
  it("B7: leitura atropelada por uma gravação que já terminou é refeita (a mudança do outro chega à tela)", async () => {
    segurarLeitura = true;
    const leitura = m.carregarAgora(); // o aviso do tempo real: a leitura começa
    await vi.waitFor(() => expect(soltarLeitura).toBeDefined());
    await m.salvarTarefa({ ...card(), cor: "etiqueta-7" }); // uma gravação curta começa e termina no meio
    linhas = [{ id: "t1", titulo: "mudado pelo Matheus", versao: 7, cor: "etiqueta-7" }];
    segurarLeitura = false;
    soltarLeitura!(); // a leitura velha chega depois e é descartada
    await leitura;
    await vi.waitFor(() => expect(card().titulo).toBe("mudado pelo Matheus"));
  });
});

it("r3 (Ferreiro 4): Parar quando a marca já não existe (2º clique, ou outra aba já parou) não é erro e o selo sai", async () => {
  fazendoBanco = [{ pessoa_id: "p1", tarefa_id: "t1", desde: "2026-10-29T10:00:00Z" }];
  await m.carregarAgora();
  fazendoBanco = []; // outra aba parou
  await m.parar(); // o delete apaga 0 linhas
  expect(m.lerFazendo().t1).toBeUndefined();
  expect(m.lerErro()).not.toMatch(/tirar a marca/);
});

it("r4 novo 5: Parar com 0 linhas e a reconferência com erro não conta como sucesso: o selo volta e avisa", async () => {
  fazendoBanco = [{ pessoa_id: "p1", tarefa_id: "t1", desde: "2026-10-29T10:00:00Z" }];
  await m.carregarAgora();
  falharFazendo = true; // a consulta que confere se a marca ficou falha
  await m.parar();
  expect(m.lerFazendo().t1).toBeDefined();
  expect(m.lerErro()).toMatch(/tirar a marca/);
});

it("r4 (economizar execuções): depois do Postar agora a tela não relê o banco em intervalo; espera o tempo real", async () => {
  vi.useFakeTimers();
  await m.postarAgora("t1");
  const antes = leiturasTarefas;
  await vi.advanceTimersByTimeAsync(5 * 60_000);
  expect(leiturasTarefas).toBe(antes);
  vi.useRealTimers();
});
