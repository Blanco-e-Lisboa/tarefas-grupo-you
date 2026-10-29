// r3 (Ferreiro 5): trocar a senha com uma sessão comum pede a senha atual; pelo link do convite, não.
import { expect, it, vi } from "vitest";
import { conferirSenhaAtual, veioDoLink } from "./convite";

it("a senha atual é conferida entrando de novo com ela", async () => {
  const entrar = vi.fn(async ({ password }: { email: string; password: string }) => ({ error: password === "certa123" ? null : { message: "Invalid login" } }));
  expect(await conferirSenhaAtual(entrar, "matheus@x.com", "errada")).toBe("A senha atual não confere.");
  expect(await conferirSenhaAtual(entrar, "matheus@x.com", "")).toBe("Digite a sua senha atual.");
  expect(await conferirSenhaAtual(entrar, "matheus@x.com", "certa123")).toBe("");
  expect(entrar).toHaveBeenCalledWith({ email: "matheus@x.com", password: "certa123" });
});

// r4 (Ferreiro 5): a dispensa vem do token assinado pelo Supabase (amr), não de uma chave editável do navegador.
const token = (amr: unknown) => `x.${btoa(JSON.stringify({ amr })).replace(/=+$/, "")}.y`;
it("só a sessão aberta há pouco pelo link do e-mail dispensa a senha atual", () => {
  const agora = 1_800_000_000;
  expect(veioDoLink(token([{ method: "invite", timestamp: agora - 60 }]), agora)).toBe(true);
  expect(veioDoLink(token([{ method: "recovery", timestamp: agora - 60 }]), agora)).toBe(true);
  expect(veioDoLink(token([{ method: "password", timestamp: agora - 60 }]), agora)).toBe(false);
  expect(veioDoLink(token([{ method: "invite", timestamp: agora - 2 * 3600 }]), agora)).toBe(false);
  expect(veioDoLink("lixo", agora)).toBe(false);
  expect(veioDoLink(undefined, agora)).toBe(false);
});
