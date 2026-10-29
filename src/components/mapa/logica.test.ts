import { describe, expect, it, vi } from "vitest";
import type { Tarefa } from "@/lib/dados";
import { ETAPAS_ATE_POSTAR, PASSO, conteudos, diaDe, quandoDe, diasDoPeriodo, filaPorDia, foiPostado, semData, marcosDoMapa, inicioDaLinha, postadosFora, recuoMaximo, hoje, prazo, tituloDe, postadosNoMes, ultimoDia, aCadaMinuto } from "./logica";

const t = (id: string, tipo: Tarefa["tipo"], inicio?: string, extra: Partial<Tarefa> = {}): Tarefa => ({
  id, titulo: id, tipo, empresaId: "beec", etapa: "roteiro", responsavel: "natham", inicio, diaInteiro: false, cor: "etiqueta-1", links: [], arquivos: [], ...extra,
});

describe("mapa", () => {
  it("vai de 19/10 até 31/10", () => {
    const dias = diasDoPeriodo("2026-10-19");
    expect(dias[0]).toBe("2026-10-19");
    expect(dias.at(-1)).toBe("2026-10-31");
  });

  it("estica o período até a última postagem se ela passar do fim do mês", () => {
    expect(diasDoPeriodo("2026-10-19", "2026-11-02").at(-1)).toBe("2026-11-02");
    expect(diasDoPeriodo("2026-10-19", "2026-10-25").at(-1)).toBe("2026-10-31");
    expect(ultimoDia([t("a", "postagem", "2026-11-09T12:00"), t("b", "postagem", "2026-10-20T09:00")])).toBe("2026-11-09");
  });

  it("o início é hoje em data local e o 'já postados' conta o mês de hoje", () => {
    expect(hoje(new Date(2026, 10, 3, 23, 30))).toBe("2026-11-03"); // 23h30 local: toISOString daria 04/11 no Brasil
    const lista = [t("a", "postagem", "2026-10-30T09:00", { etapa: "postado" }), t("b", "postagem", "2026-11-02T09:00", { etapa: "postado" })];
    expect(postadosNoMes(lista, hoje(new Date(2026, 10, 3)))).toBe(1);
  });

  it("só postagem com data vira nó, e o dia ignora o horário", () => {
    const lista = conteudos([t("a", "postagem", "2026-10-20T12:00"), t("b", "gravacao", "2026-10-20T09:00"), t("c", "postagem"), t("pessoal", "postagem", "2026-10-20T09:00", { empresaId: "" }), t("sem-etapa", "postagem", "2026-10-20T09:00", { etapa: undefined })]);
    expect(lista.map((x) => x.id)).toEqual(["a"]);
  });

  it("marca postado e acha o objetivo", () => {
    expect(foiPostado(t("a", "postagem", "2026-10-20", { etapa: "postado" }))).toBe(true);
    expect(foiPostado(t("a", "postagem", "2026-10-20", { etapa: "aprovado" }))).toBe(false);
    expect(tituloDe(t("a", "postagem", undefined, { objetivo: "Vender" }))).toBe("a"); // título vence o objetivo
    expect(tituloDe(t("b", "postagem", undefined, { titulo: "  ", objetivo: " Vender " }))).toBe("Vender"); // sem título, o objetivo é a reserva
  });
});

describe("fila por dia", () => {
  const lista = [
    t("c-sem-hora", "postagem", "2026-10-21", { etapa: "aprovado" }),
    t("b-tarde", "postagem", "2026-10-21T15:00", { etapa: "edicao" }),
    t("a-sem-hora", "postagem", "2026-10-21", { etapa: "roteiro" }),
    t("cedo", "postagem", "2026-10-21T08:00", { etapa: "aprovado" }),
    t("velho2", "postagem", "2026-10-18", { etapa: "gravacao" }),
    t("velho1", "postagem", "2026-10-17", { etapa: "gravacao" }),
    t("feito", "postagem", "2026-10-19", { etapa: "postado" }),
    t("roteiro-velho", "roteiro", "2026-10-07T10:00", { etapa: "roteiro" }), // não é postagem, mas é conteúdo atrasado
    t("reuniao-velha", "reuniao", "2026-10-07T10:00", { etapa: undefined }), // sem etapa: não é conteúdo
    t("longe", "postagem", "2026-11-30", { etapa: "aprovado" }),
  ];
  const f = filaPorDia(lista, "2026-10-19");

  it("um card por dia, hoje primeiro com o atrasado no topo e o postado de fora", () => {
    expect(f.map((g) => [g.dia, g.dias])).toEqual([["2026-10-19", 0], ["2026-10-21", 2], ["2026-11-30", 42]]);
    expect(f[0].itens.map((i) => i.t.id)).toEqual(["roteiro-velho", "velho1", "velho2"]);
    expect(f[0].itens.map((i) => i.dias)).toEqual([-12, -2, -1]);
  });

  it("no dia: sem horário na ordem de criação (no topo, como na folha), com horário na linha do horário", () => {
    expect(f[1].itens.map((i) => i.t.id)).toEqual(["c-sem-hora", "a-sem-hora", "cedo", "b-tarde"]);
    expect(f[1].itens.map((i) => i.passo)).toEqual(["Postar", "Gravar", "Postar", "Enviar para análise"]);
  });

  it("o próximo passo segue a ordem das etapas", () => {
    expect(ETAPAS_ATE_POSTAR.map((e) => PASSO[e])).toEqual(["Gravar", "Editar", "Enviar para análise", "Aprovar", "Postar"]);
  });

  it("hoje aparece mesmo sem nada hoje, e sem nada a fazer não há card", () => {
    expect(filaPorDia([t("x", "postagem", "2026-10-25")], "2026-10-19")[0]).toMatchObject({ dia: "2026-10-19", itens: [] });
    expect(filaPorDia([t("y", "postagem", "2026-10-25", { etapa: "postado" })], "2026-10-19")).toEqual([]);
  });

  it("textos de prazo", () => {
    expect([prazo(-2), prazo(0), prazo(1), prazo(9)]).toEqual(["Atrasado 2 dias", "Hoje", "Amanhã", "Em 9 dias"]);
  });

  it("não coloca tarefa pessoal na fila, mesmo se for postagem atrasada", () => {
    const pessoal = t("pessoal", "postagem", "2026-10-18", { etapa: "roteiro", empresaId: "" });
    expect(filaPorDia([pessoal], "2026-10-19")).toEqual([]);
  });

  it("reunião com empresa e etapa não entra na fila nem no Mapa (item 188)", () => {
    const reuniao = t("Reunião de pauta", "reuniao", "2026-10-18", { titulo: "Reunião de pauta" });
    expect(filaPorDia([reuniao], "2026-10-19")).toEqual([]);
    expect(conteudos([reuniao])).toEqual([]);
  });
});

describe("278 · todo Postado aparece no Mapa", () => {
  it("Postado de dia passado vira marco e a linha recua até ele; o que não é Postado e já passou segue fora", () => {
    const teto = t("teto", "postagem", undefined, { etapa: "postado", postarEm: "2026-10-21T16:30" });
    const velho = t("velho", "postagem", "2026-10-10T09:00", { etapa: "postado" });
    const atrasado = t("atrasado", "postagem", "2026-10-15T09:00", { etapa: "edicao" });
    const futuro = t("futuro", "postagem", "2026-10-25T09:00", { etapa: "aprovado" });
    const marcos = marcosDoMapa(conteudos([teto, velho, atrasado, futuro]), "2026-10-22");
    expect(marcos.map((x) => x.id)).toEqual(["velho", "teto", "futuro"]);
    expect(inicioDaLinha(marcos, "2026-10-22")).toBe("2026-10-10");
    expect(inicioDaLinha([futuro], "2026-10-22")).toBe("2026-10-22");
  });
});

describe("278 · teto do recuo", () => {
  it("a linha volta no máximo ao 1º dia do mês anterior; Postado mais antigo fica fora e é contado", () => {
    const hojeX = "2026-10-22";
    const noTeto = t("a", "postagem", "2026-09-01T09:00", { etapa: "postado" });
    const antigo = t("b", "postagem", "2026-08-31T09:00", { etapa: "postado" });
    const todos = conteudos([noTeto, antigo]);
    expect(recuoMaximo(hojeX)).toBe("2026-09-01");
    expect(recuoMaximo("2027-01-10")).toBe("2026-12-01");
    expect(marcosDoMapa(todos, hojeX).map((x) => x.id)).toEqual(["a"]);
    expect(postadosFora(todos, hojeX)).toBe(1);
    expect(inicioDaLinha(marcosDoMapa(todos, hojeX), hojeX)).toBe("2026-09-01");
    expect(postadosNoMes([antigo, t("c", "postagem", "2026-10-02T09:00", { etapa: "postado" })], hojeX)).toBe(1); // o contador do mês segue certo
  });
});

describe("278 · Postado de qualquer tipo", () => {
  it("card de outro tipo em Postado entra na linha (com data) e na faixa Sem data (sem data); fora de Postado, só Postagem", () => {
    const edicao = t("ed", "edicao", "2026-10-12T09:00", { etapa: "postado" });
    const roteiroSem = t("ro", "roteiro", undefined, { etapa: "postado" });
    const gravacaoAberta = t("gr", "gravacao", "2026-10-30T09:00", { etapa: "gravacao" });
    const reuniao = t("Reunião de pauta", "reuniao", "2026-10-12T09:00", { etapa: "postado" });
    expect(conteudos([edicao, gravacaoAberta, reuniao]).map((x) => x.id)).toEqual(["ed"]);
    expect(semData([roteiroSem, gravacaoAberta]).map((x) => x.id)).toEqual(["ro"]);
  });
});

describe("semData (item 198)", () => {
  it("postagem de empresa sem data entra; com data, postada, pessoal e reunião ficam fora", () => {
    const lista = [t("a", "postagem"), t("b", "postagem", "2026-10-20T09:00"), t("c", "postagem", undefined, { etapa: "postado" }), t("d", "postagem", undefined, { empresaId: "" }), t("e", "roteiro"), t("Reunião de pauta", "reuniao"), t("f", "postagem", undefined, { concluida: true })];
    expect(semData(lista).map((x) => x.id)).toEqual(["a", "c"]); // 278: Postado sem data entra; só concluído sem Postado fica fora
  });

  // Bug visto pelo Sextante: o Mapa desenhava só pelo início; card programado sem início caía em "Sem data".
  it("card de Postagem usa a data de POSTAR quando existe; senão o início", () => {
    const programado = t("prog", "postagem", undefined, { etapa: "aprovado", postarEm: "2026-10-25T18:00" });
    const comAmbos = t("ambos", "postagem", "2026-10-22T12:00", { etapa: "aprovado", postarEm: "2026-10-27T09:30" });
    const soInicio = t("inicio", "postagem", "2026-10-23T08:00");
    expect(quandoDe(programado)).toBe("2026-10-25T18:00");
    expect(diaDe(comAmbos)).toBe("2026-10-27");
    expect(diaDe(soInicio)).toBe("2026-10-23");
    expect(quandoDe(t("reuniao", "reuniao", "2026-10-22T12:00", { postarEm: "2026-10-27T09:30" }))).toBe("2026-10-22T12:00"); // postar_em só vale para Postagem
  });

  it("programado SEM início entra na linha (não cai em Sem data) e na fila, no dia de postar", () => {
    const programado = t("prog", "postagem", undefined, { etapa: "aprovado", postarEm: "2026-10-25T18:00" });
    const sem = t("sem", "postagem", undefined, { etapa: "edicao" });
    const lista = [programado, sem];
    expect(conteudos(lista).map((x) => x.id)).toEqual(["prog"]);
    expect(semData(lista).map((x) => x.id)).toEqual(["sem"]);
    expect(filaPorDia(lista, "2026-10-20").map((g) => [g.dia, g.itens.map((i) => i.t.id)])).toEqual([["2026-10-20", []], ["2026-10-25", ["prog"]]]);
  });

  // Bug do Natham (27/10): post da Beec foi para Postado sem data de postar nem início; o banco (quando_do_post) e o calendário
  // de postagens o põem no dia em que entrou em Postado, o Mapa o deixava em "Sem data". 22:25 UTC = 19:25 em Brasília.
  it("Postado sem data de postar nem início entra no dia em que foi para Postado (hora de Brasília)", () => {
    const postado = t("beec", "postagem", undefined, { etapa: "postado", postadoEm: "2026-10-27T22:25:06.248993+00:00" });
    expect(quandoDe(postado)).toBe("2026-10-27T19:25");
    expect(conteudos([postado]).map((x) => x.id)).toEqual(["beec"]);
    expect(semData([postado])).toEqual([]);
  });

  it("a ordem na linha segue a data de postar", () => {
    const a = t("a", "postagem", "2026-10-22T12:00", { etapa: "aprovado", postarEm: "2026-10-28T10:00" });
    const b = t("b", "postagem", undefined, { etapa: "aprovado", postarEm: "2026-10-26T10:00" });
    expect(conteudos([a, b]).map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("L6: o hoje do Mapa vira à meia-noite", () => {
  it("o relógio avisa a cada minuto e para ao sair", () => {
    vi.useFakeTimers();
    const avisar = vi.fn();
    const parar = aCadaMinuto(avisar);
    vi.advanceTimersByTime(60_000);
    expect(avisar).toHaveBeenCalledTimes(1);
    parar();
    vi.advanceTimersByTime(60_000);
    expect(avisar).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
