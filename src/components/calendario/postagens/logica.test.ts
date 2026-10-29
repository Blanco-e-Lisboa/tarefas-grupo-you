import { describe, expect, it } from "vitest";
import type { Ocorrencia, Planejada } from "@/lib/dados";
import { comODia, diasRepetidos, estadoDoGrupo, faltaPreencher, HORAS, janelaDaPlanejada, naHoraDoCard, paraGravar, periodoDe, planejadaNova, porDiaPostagens, soHoraQuemTitulo, temPostagens } from "./logica";

const o = (dia: string, hora: string, empresaId: string): Ocorrencia => ({ dia, hora, empresaId, estado: "planejada" });

describe("periodoDe", () => {
  it("dia: só ele", () => {
    const p = periodoDe("dia", "2026-10-28");
    expect([p.de, p.ate, p.dias]).toEqual(["2026-10-28", "2026-10-28", ["2026-10-28"]]);
  });
  it("semana: domingo a sábado", () => {
    const p = periodoDe("semana", "2026-10-28");
    expect([p.de, p.ate, p.dias.length]).toEqual(["2026-10-25", "2026-10-31", 7]);
  });
  it("mês: semanas inteiras que cobrem o mês", () => {
    const p = periodoDe("mes", "2026-10-15");
    expect([p.de, p.ate]).toEqual(["2026-09-27", "2026-10-31"]);
  });
});

describe("porDiaPostagens", () => {
  it("ordena por hora e, no empate, por empresa", () => {
    const m = porDiaPostagens([o("2026-10-26", "17:00", "you"), o("2026-10-26", "09:00", "you"), o("2026-10-26", "17:00", "beec")]);
    expect(m.get("2026-10-26")!.map((x) => `${x.hora}${x.empresaId}`)).toEqual(["09:00you", "17:00beec", "17:00you"]);
  });
});

describe("faltaPreencher", () => {
  const base = planejadaNova("2026-10-26");
  it("pede empresa", () => expect(faltaPreencher(base)).toMatch(/empresa/));
  it("data avulsa pronta", () => expect(faltaPreencher({ ...base, empresaId: "you" })).toBe(""));
  it("toda semana pede dias e confere o fim", () => {
    const s: Planejada = { ...base, empresaId: "you", repete: "semana" };
    expect(faltaPreencher(s)).toMatch(/dias/);
    expect(faltaPreencher({ ...s, diasSemana: [1], fim: "2026-10-01", inicio: "2026-10-26" })).toMatch(/fim/);
    expect(faltaPreencher({ ...s, diasSemana: [1], inicio: "2026-10-26" })).toBe("");
  });
  it("sem rede não salva", () => expect(faltaPreencher({ ...base, empresaId: "you", redes: [] })).toMatch(/rede/));
});

describe("soHoraQuemTitulo", () => {
  const a: Planejada = { ...planejadaNova("2026-10-26"), empresaId: "you", repete: "semana", diasSemana: [1, 3], inicio: "2026-10-01" };
  it("hora, quem faz e título não impedem 'só este dia'", () => expect(soHoraQuemTitulo(a, { ...a, hora: "18:00", responsavel: "natham", titulo: "x" })).toBe(true));
  it("formato ou dias impedem", () => {
    expect(soHoraQuemTitulo(a, { ...a, formato: "post" })).toBe(false);
    expect(soHoraQuemTitulo(a, { ...a, diasSemana: [1] })).toBe(false);
    expect(soHoraQuemTitulo(a, { ...a, hora: "" })).toBe(false); // virar meta do dia não cabe em "só este dia"
  });
});

it("horas vão de 05:00 a 21:30", () => expect([HORAS[0], HORAS.at(-1), HORAS.length]).toEqual(["05:00", "21:30", 34]));

describe("Lupa 315: dia com \"só este dia\" na ficha", () => {
  const serie: Planejada = { ...planejadaNova("2026-11-02"), id: "s", empresaId: "you", repete: "semana", diasSemana: [1, 3], hora: "17:00", titulo: "" };
  const dia = comODia(serie, { hora: "18:30", responsavel: "natham", titulo: "Só hoje" });
  it("abre mostrando hora, quem e título do DIA", () => expect([dia.hora, dia.responsavel, dia.titulo]).toEqual(["18:30", "natham", "Só hoje"]));
  it("todos/próximos: o que não foi mexido volta a ser da série; o que foi mexido vai", () => {
    const g = paraGravar(serie, dia, { ...dia, titulo: "Novo para todos" }, "todos");
    expect([g.hora, g.responsavel, g.titulo, g.diasSemana]).toEqual(["17:00", "matheus", "Novo para todos", [1, 3]]);
  });
  it("só este dia grava o que está na ficha", () => expect(paraGravar(serie, dia, { ...dia, hora: "19:00" }, "dia").hora).toBe("19:00"));
  it("dia sem exceção: nada muda", () => expect(paraGravar(serie, comODia(serie, { hora: "17:00" }), comODia(serie, { hora: "17:00" }), "todos")).toEqual(serie));
});

it("etiqueta de metas: tudo saiu = feita, alguma faltou = faltou, senão planejada", () => {
  expect(estadoDoGrupo([{ estado: "feita" }, { estado: "feita" }])).toBe("feita");
  expect(estadoDoGrupo([{ estado: "feita" }, { estado: "faltou" }])).toBe("faltou");
  expect(estadoDoGrupo([{ estado: "feita" }, { estado: "planejada" }])).toBe("planejada");
});

describe("Lince 27/10: planejada repetida e hora do card", () => {
  const you: Planejada = { ...planejadaNova("2026-10-27"), id: "nova", empresaId: "you", repete: "semana", diasSemana: [1, 2, 3, 4, 5, 6], inicio: "2026-10-27", hora: "" };
  const antiga: Ocorrencia = { planejadaId: "938a", dia: "2026-10-27", hora: "19:00", empresaId: "you", formato: "reels", estado: "feita", cardId: "ef3d" };
  it("acha a outra planejada You + Reels no mesmo dia", () => expect(diasRepetidos(you, [antiga], "2026-10-27")).toEqual(["2026-10-27"]));
  it("ignora a própria série, outro formato, outra empresa, extra e dia que a série não cobre", () => {
    const outros: Ocorrencia[] = [
      { ...antiga, planejadaId: "nova" }, { ...antiga, formato: "post" }, { ...antiga, empresaId: "beec" },
      { ...antiga, planejadaId: undefined, estado: "extra" }, { ...antiga, dia: "2026-11-01" }, { ...antiga, dia: "2026-10-26" },
    ];
    expect(diasRepetidos(you, outros, "2026-10-20")).toEqual([]); // 01/11 é domingo; 26/10 é antes do começo
  });
  it("data avulsa: só aquele dia", () => expect(diasRepetidos({ ...you, repete: "data", data: "2026-10-28" }, [antiga, { ...antiga, dia: "2026-10-28" }], "2026-10-27")).toEqual(["2026-10-28"]));
  it("janela da série: até o fim ou 5 semanas", () => {
    expect(janelaDaPlanejada(you, "2026-10-20")).toEqual({ de: "2026-10-27", ate: "2026-11-30" });
    expect(janelaDaPlanejada({ ...you, fim: "2026-10-30" }, "2026-10-20")).toEqual({ de: "2026-10-27", ate: "2026-10-30" });
  });
  it("série antiga olha a partir do dia aberto, não do começo dela (Lince)", () => {
    const velha: Planejada = { ...you, id: "pp-1", hora: "17:00", diasSemana: [1, 3], inicio: "2026-09-21" };
    const meta: Ocorrencia = { ...antiga, planejadaId: "meta", dia: "2026-10-28", hora: "" };
    expect(diasRepetidos(velha, [meta], "2026-10-28")).toEqual(["2026-10-28"]);
    expect(janelaDaPlanejada({ ...you, repete: "data", data: "" }, "2026-10-28")).toEqual({ de: "2026-10-28", ate: "2026-10-28" }); // nunca chama o banco com ""
  });
  it("bloco feita vai para a hora em que o card saiu", () => {
    expect(naHoraDoCard(antiga, () => "18:30").hora).toBe("18:30");
    expect(naHoraDoCard(antiga, () => "").hora).toBe("19:00");
    expect(naHoraDoCard({ ...antiga, estado: "planejada" }, () => "18:30").hora).toBe("19:00");
  });
});

describe("L3: o botão Tarefas | Postagens não some na virada da semana", () => {
  it("depois de ver o calendário de postagens uma vez, a semana nova carregando não esconde a tela", () => {
    expect(temPostagens(false, undefined, false)).toBe(false); // ainda não carregou nada
    expect(temPostagens(false, [], false)).toBe(true);
    expect(temPostagens(true, undefined, false)).toBe(true); // virou a semana: carregando a nova
    expect(temPostagens(true, undefined, true)).toBe(false); // função ausente no banco: esconde
  });
});
