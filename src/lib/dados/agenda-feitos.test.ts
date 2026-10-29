import { beforeEach, expect, it, vi } from "vitest";

// Cada pedido ao banco fica pendurado até o teste soltar: assim dá para ver a ordem em que chegam.
const pedidos: { acao: string; soltar: (r: { error: unknown }) => void }[] = [];
const pendurar = (acao: string) => new Promise((ok) => pedidos.push({ acao, soltar: ok }));
vi.mock("@/lib/supabase/cliente", () => ({
  supabase: () => ({
    from: () => ({
      select: () => Promise.resolve({ data: [], error: null }),
      insert: () => pendurar("insert"),
      delete: () => ({ eq: () => pendurar("delete") }),
    }),
  }),
}));
const falhou = vi.fn();
vi.mock("./repositorio", () => ({ falhou: (m: string) => falhou(m) }));
import { marcarEventoFeito } from "./agenda-feitos";

beforeEach(() => { pedidos.length = 0; falhou.mockReset(); });
const vez = () => new Promise((r) => setTimeout(r, 0));

it("L4: marcar e desmarcar rápido chegam ao banco na ordem (o desmarcar só sai depois do marcar responder)", async () => {
  void marcarEventoFeito("e1", true);
  void marcarEventoFeito("e1", false);
  await vez();
  expect(pedidos.map((p) => p.acao)).toEqual(["insert"]);
  pedidos[0].soltar({ error: null });
  await vez();
  expect(pedidos.map((p) => p.acao)).toEqual(["insert", "delete"]);
  pedidos[1].soltar({ error: null });
});

it("L4: recusa do banco avisa (não volta calada)", async () => {
  const fim = marcarEventoFeito("e2", true);
  await vez();
  pedidos[0].soltar({ error: { code: "42501" } });
  await fim;
  expect(falhou).toHaveBeenCalledTimes(1);
});
