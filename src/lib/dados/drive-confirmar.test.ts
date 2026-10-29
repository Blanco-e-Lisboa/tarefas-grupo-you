// r2 B6: recusa do servidor ao confirmar o envio (403, 409...) mostra o motivo dele e não deixa a anotação para "tentar de novo" para sempre.
import { expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "t" } } }) } }) }));
vi.mock("./tempo-real", () => ({ AVISOS: { pastas: [] }, ligarTempoReal: () => () => {} }));

const guardado = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => guardado.get(k) ?? null, setItem: (k: string, v: string) => void guardado.set(k, v), removeItem: (k: string) => void guardado.delete(k) });
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });
vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
  if (url === "https://sessao") return json(200, { id: "drive1" }); // o arquivo chegou ao Drive
  const acao = JSON.parse(String(init?.body)).acao;
  return acao === "sessao_envio" ? json(200, { sessao_url: "https://sessao" }) : json(403, { erro: "Você não pode mexer nos anexos deste card." });
}));
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";

import { enviarParaDrive } from "./drive";

it("403 na confirmação: a tela recebe o motivo do servidor e a anotação do envio sai", async () => {
  await expect(enviarParaDrive("t1", new File(["abc"], "f.png", { type: "image/png" }), "anexo", 0)).rejects.toThrow("Você não pode mexer nos anexos deste card.");
  expect([...guardado.keys()].filter((k) => k.startsWith("grade:envio:"))).toEqual([]);
});
