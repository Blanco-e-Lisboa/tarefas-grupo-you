// r3 A7: sem o 038 a API não conhece p_envio (PGRST202); a marca é pedida de novo sem ele, como antes.
import { expect, it, vi } from "vitest";

const rpc = vi.fn(async (_f: string, args: Record<string, unknown>) => ("p_envio" in args ? { error: { code: "PGRST202" } } : { error: null }));
vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => ({ rpc }) }));
vi.mock("./repositorio", () => ({ funcaoAusente: (e: { code?: string } | null) => e?.code === "PGRST202" }));

import { marcarPendente } from "./subindo";

it("banco antes do 038: marca sem o id do envio e devolve 'deu certo'", async () => {
  expect(await marcarPendente("t1", "e1")).toBeNull();
  expect(rpc.mock.calls.map(([, a]) => a)).toEqual([{ p_tarefa: "t1", p_envio: "e1" }, { p_tarefa: "t1" }]);
});
