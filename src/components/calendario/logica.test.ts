import { describe, expect, it } from "vitest";
import type { EventoAgenda, Tarefa } from "@/lib/dados";
import { agendaPorDia, andar, semanaDoAno, diasCobertos, eventoNoTopo, ultimoDia, diasDoMes, empilhar, esperarFimDoArraste, faixas, inicioSemana, mover, paraDia, tituloPeriodo, vaiProGoogle, postProgramado, avisoProgramado } from "./logica";

const base: Tarefa = {
  id: "x", titulo: "Gravar", tipo: "gravacao", empresaId: "beec", responsavel: "matheus",
  inicio: "2026-10-09T14:00", fim: "2026-10-09T17:00", diaInteiro: false, cor: "etiqueta-3", links: [], arquivos: [],
};

describe("calendário", () => {
  it("numera a semana como o Google Agenda (domingo a sábado, a semana é do ano da sua quinta)", () => {
    expect(semanaDoAno("2026-01-01")).toBe(1);
    expect(semanaDoAno("2025-12-28")).toBe(1);
    expect(semanaDoAno("2026-10-25")).toBe(44);
    expect(semanaDoAno("2026-10-31")).toBe(44);
    expect(semanaDoAno("2026-12-27")).toBe(53);
    expect(semanaDoAno("2027-01-02")).toBe(53);
    expect(semanaDoAno("2027-01-03")).toBe(1);
    expect(semanaDoAno("2027-10-24")).toBe(43);
    expect(semanaDoAno("2027-12-26")).toBe(52);
  });

  it("usa o relógio local (23h50 continua no mesmo dia)", () => {
    expect(paraDia(new Date(2026, 9, 18, 23, 50))).toBe("2026-10-18");
  });

  it("monta semana e mês a partir do domingo", () => {
    expect(inicioSemana("2026-10-21")).toBe("2026-10-18");
    const mes = diasDoMes("2026-10-21");
    expect(mes[0]).toBe("2026-09-27");
    expect(mes.length % 7).toBe(0);
    expect(mes).toContain("2026-10-31");
  });

  it("anda de mês sem pular fevereiro", () => {
    expect(andar("mes", "2026-01-31", 1)).toBe("2026-02-01");
    expect(andar("semana", "2026-10-18", -1)).toBe("2026-10-11");
    expect(tituloPeriodo("semana", "2026-10-28")).toEqual(["25 a 31 de outubro", "2026"]);
    expect(tituloPeriodo("semana", "2026-10-01")[0]).toBe("27/09 a 3/10");
  });

  it("move mantendo a duração, a hora ou virando dia inteiro", () => {
    expect(mover(base, { dia: "2026-10-12", minuto: 600 })).toMatchObject({ inicio: "2026-10-12T10:00", fim: "2026-10-12T13:00" });
    expect(mover(base, { dia: "2026-10-20" })).toMatchObject({ inicio: "2026-10-20T14:00", fim: "2026-10-20T17:00" });
    expect(mover(base, { dia: "2026-10-20", diaInteiro: true })).toMatchObject({ inicio: "2026-10-20", fim: undefined, diaInteiro: true });
    expect(mover(base, null)).toMatchObject({ inicio: undefined, fim: undefined, diaInteiro: false });
    const semData = { ...base, inicio: undefined, fim: undefined };
    expect(mover(semData, { dia: "2026-10-20", minuto: 540 })).toMatchObject({ inicio: "2026-10-20T09:00", fim: undefined });
    expect(mover(semData, { dia: "2026-10-20" })).toMatchObject({ inicio: "2026-10-20", diaInteiro: true });
  });

  it("espalha tarefa de vários dias e põe lado a lado as que se cruzam", () => {
    expect(diasCobertos({ ...base, fim: "2026-10-11T12:00" })).toEqual(["2026-10-09", "2026-10-10", "2026-10-11"]);
    const r = faixas([{ ini: 0, fim: 60 }, { ini: 30, fim: 90 }, { ini: 120, fim: 150 }]);
    expect(r.map((x) => [x.faixa, x.total])).toEqual([[0, 2], [1, 2], [0, 1]]);
  });

  it("semana: curtas no mesmo horário empilham na largura toda; o que não cabe até a próxima vira +N (Régua 215 v2)", () => {
    const como = (ps: ReturnType<typeof empilhar>) => ps.map((p) => ("mais" in p ? `+${p.mais.length}@${p.topo}` : `${p.topo}:${p.faixa}/${p.total}`));
    // 09:00 duas de 30 min, nada depois: duas linhas (09:00 e 09:30), cada uma com a largura toda
    expect(como(empilhar(faixas([{ ini: 540, fim: 570 }, { ini: 540, fim: 570 }]), true))).toEqual(["540:0/1", "570:0/1"]);
    // três às 09:00: cabem 2 linhas em 1 h -> uma tarefa e "+2"
    expect(como(empilhar(faixas([{ ini: 540, fim: 570 }, { ini: 540, fim: 570 }, { ini: 540, fim: 570 }]), true))).toEqual(["540:0/1", "+2@570"]);
    // outra tarefa às 09:30: só 1 linha livre -> "+2" no lugar das duas
    expect(como(empilhar(faixas([{ ini: 540, fim: 570 }, { ini: 540, fim: 570 }, { ini: 570, fim: 600 }]), true))).toEqual(["+2@540", "570:0/1"]);
    // longa (1 h) junto, ou visão Dia (desligado): continua lado a lado
    expect(como(empilhar(faixas([{ ini: 540, fim: 600 }, { ini: 540, fim: 570 }]), true))).toEqual(["540:0/2", "540:1/2"]);
    expect(como(empilhar(faixas([{ ini: 540, fim: 570 }, { ini: 540, fim: 570 }]), false))).toEqual(["540:0/2", "540:1/2"]);
  });

  it("fim do arraste: chama uma vez só e, parado (tela saiu), não chama mais", () => {
    const janela = new EventTarget();
    let vezes = 0;
    esperarFimDoArraste(janela, () => vezes++);
    janela.dispatchEvent(new Event("drop"));
    janela.dispatchEvent(new Event("dragend"));
    expect(vezes).toBe(1);
    const parar = esperarFimDoArraste(janela, () => vezes++);
    parar();
    janela.dispatchEvent(new Event("dragend"));
    expect(vezes).toBe(1);
  });

  it("compromisso do Google: por dia, dia inteiro no topo, meia-noite em ponto não ocupa o dia seguinte", () => {
    const ev = (id: string, inicio: string, fim?: string, diaInteiro = false): EventoAgenda => ({ id, titulo: id, inicio, fim, diaInteiro, particular: false, fontes: ["contato"] });
    const hora = ev("hora", "2026-10-22T14:00", "2026-10-22T15:00");
    const ateMeiaNoite = ev("23h", "2026-10-22T23:00", "2026-10-23T00:00");
    const viraDia = ev("vira", "2026-10-22T22:00", "2026-10-23T02:00");
    const feriado = ev("feriado", "2026-10-22", "2026-10-24", true);
    const mapa = agendaPorDia([hora, ateMeiaNoite, viraDia, feriado]);
    expect(mapa.get("2026-10-22")?.map((e) => e.id)).toEqual(["hora", "23h", "vira", "feriado"]);
    expect(mapa.get("2026-10-23")?.map((e) => e.id)).toEqual(["vira", "feriado"]);
    expect(mapa.get("2026-10-24")?.map((e) => e.id)).toEqual(["feriado"]);
    expect([hora, ateMeiaNoite, viraDia, feriado].map(eventoNoTopo)).toEqual([false, false, true, true]);
    expect([hora, ateMeiaNoite, viraDia, feriado].map(ultimoDia)).toEqual(["2026-10-22", "2026-10-22", "2026-10-23", "2026-10-24"]);
  });

  it("vai para o Google: marcada, com data, e para si mesmo ou criada pelo Natham (R5-3, R5-5)", () => {
    const m = (responsavel: Tarefa["responsavel"], marcada = true) => ({ vaiProGoogle: marcada, responsavel });
    expect(vaiProGoogle(m("natham"), true, "natham")).toBe(true);
    expect(vaiProGoogle(m("matheus"), true, "natham")).toBe(true); // Natham cria para alguém
    expect(vaiProGoogle(m("matheus"), true, "matheus")).toBe(true); // para si mesmo
    expect(vaiProGoogle(m("natham"), true, "matheus")).toBe(false); // Matheus cria para o Natham: não vai
    expect(vaiProGoogle(m("natham"), false, "natham")).toBe(false); // sem data
    expect(vaiProGoogle(m("natham", false), true, "natham")).toBe(false); // criada no Caderno
    expect(vaiProGoogle(m("natham"), true, null)).toBe(false);
  });
});

describe("A9: card programado não muda de dia por arraste", () => {
  const base = { id: "p", titulo: "Reels", tipo: "postagem", empresaId: "you", responsavel: "matheus", diaInteiro: false, cor: "etiqueta-1", links: [], arquivos: [] } as Tarefa;
  it("só Aprovado com data do post conta como programado", () => {
    expect(postProgramado({ ...base, etapa: "aprovado", postarEm: "2026-10-30T18:00" })).toBe(true);
    expect(postProgramado({ ...base, etapa: "aprovado" })).toBe(false);
    expect(postProgramado({ ...base, etapa: "postado", postarEm: "2026-10-30T18:00" })).toBe(false);
    expect(avisoProgramado({ postarEm: "2026-10-30T18:00" })).toContain("30/10 às 18:00");
  });
});
