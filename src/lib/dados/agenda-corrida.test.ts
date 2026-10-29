import { beforeEach, expect, it, vi } from "vitest";

// Cada recarregarAgenda pede 3 coisas; `respostas` guarda, por leitura, a promessa dos eventos (as outras duas respondem na hora).
const respostas: Promise<unknown>[] = [];
const acesso = { data: [{ fonte: "adrian" }, { fonte: "adrian_pessoal" }], error: null };
vi.mock("@/lib/supabase/cliente", () => ({
  supabase: () => ({
    from: (t: string) => ({
      select: () => (t === "agenda_acesso" ? Promise.resolve(acesso) : { gte: () => ({ lt: () => ({ order: () => respostas.shift() }) }) }),
    }),
    rpc: () => Promise.resolve({ data: [], error: null }),
  }),
}));
import { recarregarAgenda, useAgendaEventos, type LinhaEvento } from "./agenda";

const linha: LinhaEvento = { id: "e1", fontes: ["adrian_pessoal"], titulo: "Dentista", particular: false, inicio: "2026-11-02T13:00:00+00:00", fim: null, dia_inteiro: false, local: null };
const eventos = (titulo: string) => ({ data: [{ ...linha, titulo }], error: null });
let atuais: { titulo: string }[] = [];
vi.mock("react", () => ({ useSyncExternalStore: (_a: unknown, ler: () => { titulo: string }[]) => (atuais = ler()) }));

beforeEach(() => { respostas.length = 0; });

it("M15: a agenda pessoal do Adrian não some do compromisso", async () => {
  respostas.push(Promise.resolve(eventos("Dentista")));
  await recarregarAgenda();
  useAgendaEventos();
  expect((atuais as unknown as { fontes: string[] }[])[0].fontes).toEqual(["adrian_pessoal"]);
});

it("B11: a resposta da leitura mais velha, chegando por último, não pisa na mais nova", async () => {
  let soltarVelha: (v: unknown) => void = () => {};
  respostas.push(new Promise((ok) => { soltarVelha = ok; }), Promise.resolve(eventos("novo")));
  const velha = recarregarAgenda();
  await recarregarAgenda();
  soltarVelha(eventos("velho"));
  await velha;
  useAgendaEventos();
  expect(atuais.map((e) => e.titulo)).toEqual(["novo"]);
});
