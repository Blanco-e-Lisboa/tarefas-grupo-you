// r3/r4 (Ferreiro 5): a tela "Escolha sua senha" trocava a senha de QUALQUER sessão aberta, sem pedir a atual.
// r4: a dispensa da senha atual não depende mais de uma chave do navegador. Vem da própria sessão: o Supabase grava no token
// (assinado por ele) como a pessoa entrou (`amr`). Só a sessão criada há pouco pelo link do e-mail (convite, "esqueci a senha")
// dispensa. Um token editado à mão não passa: o Supabase confere a assinatura ao trocar a senha.
const PELO_LINK = new Set(["invite", "recovery", "otp", "magiclink", "email/signup"]);
const PRAZO_S = 60 * 60; // shortcut: 1 h depois do link a sessão passa a pedir a senha atual; se convidado reclamar, aumentar

/** true se o token veio de um link do e-mail aberto há menos de 1 h. Qualquer dúvida (token estranho) = false = pede a senha atual. */
export function veioDoLink(token: string | undefined, agoraS = Date.now() / 1000) {
  try {
    const corpo = JSON.parse(atob(token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))) as { amr?: { method?: string; timestamp?: number }[] };
    return (corpo.amr ?? []).some((a) => PELO_LINK.has(a.method ?? "") && agoraS - (a.timestamp ?? 0) < PRAZO_S);
  } catch {
    return false;
  }
}

/** Confere a senha atual de quem está logado (entrar de novo com ela). Devolve o aviso ou "" se está certa. */
export async function conferirSenhaAtual(entrar: (p: { email: string; password: string }) => Promise<{ error: unknown }>, email: string | undefined, atual: string) {
  if (!email) return "Não consegui conferir a sua conta. Saia e entre de novo.";
  if (!atual) return "Digite a sua senha atual.";
  return (await entrar({ email, password: atual })).error ? "A senha atual não confere." : "";
}
