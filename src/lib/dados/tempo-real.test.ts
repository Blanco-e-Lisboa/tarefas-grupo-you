import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Ouvinte = { evento: string; table: string; cb: (p: unknown) => void };
const ouvidas: Ouvinte[] = [];
const removeChannel = vi.fn();
const canal: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> } = {
  on: vi.fn((_t: string, f: { event: string; table: string }, cb: (p: unknown) => void) => { ouvidas.push({ evento: f.event, table: f.table, cb }); return canal; }),
  subscribe: vi.fn(() => canal),
};
const channel = vi.fn<(nome: string) => typeof canal>(() => canal);
vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => ({ channel, removeChannel }) }));

import { AVISOS, ligarTempoReal } from "./tempo-real";

beforeEach(() => { ouvidas.length = 0; vi.useFakeTimers(); vi.stubGlobal("window", {}); vi.stubGlobal("document", { hidden: false }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const aviso = (chave: string) => ({ new: { chave } });

it("escuta só a tabela de avisos (inclusão e alteração, nunca exclusão) e só as chaves pedidas", () => {
  const aoMudar = vi.fn();
  const desligar = ligarTempoReal("t", AVISOS.caderno, aoMudar);
  expect(ouvidas.map((o) => `${o.evento}:${o.table}`)).toEqual(["INSERT:aviso_mudanca", "UPDATE:aviso_mudanca"]);
  ouvidas[1].cb(aviso("cartao:x")); // outro assunto: ignora
  vi.advanceTimersByTime(300);
  expect(aoMudar).not.toHaveBeenCalled();
  ouvidas[1].cb(aviso("caderno:a")); ouvidas[0].cb(aviso("caderno:b")); ouvidas[1].cb(aviso("caderno:a"));
  vi.advanceTimersByTime(300);
  expect(aoMudar).toHaveBeenCalledTimes(1); // três avisos seguidos = uma releitura
  desligar();
  expect(removeChannel).toHaveBeenCalledWith(canal);
});

it("M5: religar logo depois de desligar usa um canal NOVO (o cliente devolve o canal que ainda está saindo quando o nome se repete)", () => {
  channel.mockClear();
  ligarTempoReal("agenda", AVISOS.agenda, vi.fn())(); // a tela sai: o canal começa a sair, sem esperar o servidor
  ligarTempoReal("agenda", AVISOS.agenda, vi.fn()); // a tela nova entra no mesmo instante
  const [primeiro, segundo] = channel.mock.calls.map(([nome]) => nome);
  expect(segundo).not.toBe(primeiro);
  expect(segundo.startsWith("tempo-real:agenda")).toBe(true);
});
