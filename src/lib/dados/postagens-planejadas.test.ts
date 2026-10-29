import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }) }));
import { apagarPlanejada, carregar, daLinha, daSerie, lerSerie, lerAusente, lerPeriodo, paraBanco, salvarPlanejada, type Planejada } from "./postagens-planejadas";

beforeEach(() => { rpc.mockReset(); maybeSingle.mockReset(); });

const linha = {
  planejada_id: "p1", dia: "2026-11-02", hora: "17:00", empresa_id: "you", formato: "reels" as const, redes: ["instagram" as const],
  responsavel: "matheus" as const, titulo: null, repete: "semana" as const, estado: "feita" as const, card_id: "c1", card_titulo: "Reels real",
};
const semana: Planejada = { empresaId: "you", formato: "reels", redes: ["instagram", "facebook"], hora: "17:00", repete: "semana", diasSemana: [1, 3], inicio: "2026-11-02" };

describe("calendário de postagens (315)", () => {
  it("linha do banco vira bloco; extra fica sem planejada", () => {
    expect(daLinha(linha)).toEqual({ planejadaId: "p1", dia: "2026-11-02", hora: "17:00", empresaId: "you", formato: "reels", redes: ["instagram"],
      responsavel: "matheus", titulo: undefined, repete: "semana", estado: "feita", cardId: "c1", cardTitulo: "Reels real" });
    expect(daLinha({ ...linha, hora: null }).hora).toBe(""); // meta do dia: sem hora
    const extra = daLinha({ ...linha, planejada_id: null, redes: null, responsavel: null, repete: null, formato: null, estado: "extra" });
    expect(extra.planejadaId).toBeUndefined();
    expect(extra.formato).toBeUndefined();
    expect(extra.estado).toBe("extra");
  });

  it("para o banco: responsável padrão Matheus; semana manda os dias e não a data; data não manda dias nem fim", () => {
    expect(paraBanco(semana)).toEqual({ id: null, empresa_id: "you", formato: "reels", redes: ["instagram", "facebook"], hora: "17:00", responsavel: "matheus",
      titulo: null, repete: "semana", data: null, dias_semana: [1, 3], inicio: "2026-11-02", fim: null });
    const umaVez = paraBanco({ ...semana, repete: "data", data: "2026-11-05", fim: "2026-12-01", titulo: "  Black Friday ", responsavel: "natham" });
    expect(umaVez).toMatchObject({ repete: "data", data: "2026-11-05", dias_semana: null, fim: null, titulo: "Black Friday", responsavel: "natham" });
  });

  it("carrega o período pela função do banco", async () => {
    rpc.mockResolvedValue({ data: [linha], error: null });
    await carregar("2026-11-02", "2026-11-08");
    expect(rpc).toHaveBeenCalledWith("postagens_calendario", { p_de: "2026-11-02", p_ate: "2026-11-08" });
    expect(lerPeriodo("2026-11-02", "2026-11-08")?.[0].cardId).toBe("c1");
    expect(lerAusente()).toBe(false);
  });

  it("antes do SQL colado (função ausente): marca ausente e não apaga o que já estava na tela", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await carregar("2026-11-02", "2026-11-08");
    expect(lerAusente()).toBe(true);
    expect(lerPeriodo("2026-11-02", "2026-11-08")).toHaveLength(1);
    rpc.mockResolvedValue({ data: [], error: null });
    await carregar("2026-11-09", "2026-11-15");
    expect(lerAusente()).toBe(false);
  });

  it("salvar manda escopo e dia; devolve o id", async () => {
    rpc.mockResolvedValueOnce({ data: "novo", error: null }).mockResolvedValue({ data: [], error: null });
    expect(await salvarPlanejada({ ...semana, id: "p1", hora: "19:00" }, "proximos", "2026-11-09")).toEqual({ id: "novo", erro: "" });
    expect(rpc.mock.calls[0]).toEqual(["salvar_planejada", { p: expect.objectContaining({ id: "p1", hora: "19:00" }), p_escopo: "proximos", p_dia: "2026-11-09" }]);
  });

  it("recusa do banco vira aviso em português (Matheus e Adrian só olham)", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    expect(await salvarPlanejada(semana)).toEqual({ id: null, erro: "Só o Natham monta o calendário de postagens." });
    expect(await apagarPlanejada("p1", "dia", "2026-11-04")).toBe("Só o Natham monta o calendário de postagens.");
    expect(rpc).toHaveBeenLastCalledWith("apagar_planejada", { p_id: "p1", p_escopo: "dia", p_dia: "2026-11-04" });
  });

  it("apagar sem escopo apaga a postagem inteira", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await apagarPlanejada("p1")).toBe("");
    expect(rpc).toHaveBeenCalledWith("apagar_planejada", { p_id: "p1", p_escopo: "todos", p_dia: null });
  });
});

describe("série inteira para a ficha (315-fecho)", () => {
  const serie = { id: "s1", empresa_id: "you", formato: "reels" as const, redes: ["instagram" as const], hora: "17:00:00".slice(0, 5), titulo: null, repete: "semana" as const,
    data: null, dias_semana: [1, 3], inicio: "2026-09-21", fim: "2026-12-31", pessoas: { slug: "natham" as const } };
  it("traz dias, começo, fim e quem posta (o que o bloco do calendário não tem)", () => {
    expect(daSerie(serie)).toEqual({ id: "s1", empresaId: "you", formato: "reels", redes: ["instagram"], hora: "17:00", titulo: "", responsavel: "natham",
      repete: "semana", data: undefined, diasSemana: [1, 3], inicio: "2026-09-21", fim: "2026-12-31" });
  });
  it("sem pessoa ligada cai no Matheus; data avulsa não tem dias", () => {
    expect(daSerie({ ...serie, hora: null }).hora).toBe(""); // meta do dia: sem hora
    expect(daSerie({ ...serie, pessoas: null, repete: "data", data: "2026-11-05", dias_semana: null }))
      .toMatchObject({ responsavel: "matheus", data: "2026-11-05", diasSemana: [] });
  });
  it("lerSerie: achou devolve a série; não achou ou erro devolve null", async () => {
    maybeSingle.mockResolvedValueOnce({ data: serie, error: null });
    expect((await lerSerie("s1"))?.inicio).toBe("2026-09-21");
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    expect(await lerSerie("x")).toBeNull();
    maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "42501" } });
    expect(await lerSerie("x")).toBeNull();
  });
});

describe("B11: leituras fora de ordem", () => {
  it("a resposta da leitura mais velha, chegando por último, não pisa na mais nova", async () => {
    let soltarVelha: (v: unknown) => void = () => {};
    rpc.mockReturnValueOnce(new Promise((ok) => { soltarVelha = ok; })).mockResolvedValueOnce({ data: [{ ...linha, card_id: "novo" }], error: null });
    const velha = carregar("2026-12-07", "2026-12-13");
    await carregar("2026-12-07", "2026-12-13");
    soltarVelha({ data: [{ ...linha, card_id: "velho" }], error: null });
    await velha;
    expect(lerPeriodo("2026-12-07", "2026-12-13")?.[0].cardId).toBe("novo");
  });
});
