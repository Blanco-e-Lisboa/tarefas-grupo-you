// r2 B9: o porteiro não manda quem já está logado para fora de /entrar (o convite "#access_token=..." só a tela enxerga).
import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

let logado = true;
vi.mock("@supabase/ssr", () => ({ createServerClient: () => ({ auth: { getClaims: async () => ({ data: logado ? { claims: { sub: "u1" } } : null }) } }) }));

import { proxy } from "./proxy";

it("logado em /entrar: a página abre (a tela decide; o convite não se perde)", async () => {
  logado = true;
  const r = await proxy(new NextRequest("http://127.0.0.1/entrar"));
  expect(r.headers.get("location")).toBeNull();
});

it("sem login fora da entrada: continua indo para /entrar", async () => {
  logado = false;
  const r = await proxy(new NextRequest("http://127.0.0.1/conteudos"));
  expect(r.headers.get("location")).toMatch(/\/entrar$/);
});
