"use client";
import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/cliente";
import { CampoEntrar, CartaoEntrar } from "./CartaoEntrar";

// O convite (e o "esqueci a senha") do painel chega aqui com a sessão no endereço: #access_token=...&refresh_token=...&type=invite.
// O cliente do navegador usa o fluxo PKCE e IGNORA esse formato ("Not a valid PKCE flow url"), então a sessão é criada aqui, na mão.
const dadosDoLink = () => {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const [access_token, refresh_token] = [h.get("access_token"), h.get("refresh_token")];
  return /^(invite|recovery)$/.test(h.get("type") ?? "") && access_token && refresh_token ? { access_token, refresh_token } : null;
};
const semAssinar = () => () => {};
const linkVencido = () => /error_code=otp_expired|error=access_denied/.test(window.location.hash);

export function TelaEntrar() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erroForm, setErro] = useState("");
  const vencido = useSyncExternalStore(semAssinar, linkVencido, () => false);
  const erro = erroForm || (vencido ? "Este link venceu ou já foi usado. Peça um novo convite ao Natham." : "");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const link = dadosDoLink();
    let saiu = false;
    // r2 B9: sem convite no endereço e já logado: vai para dentro (era o porteiro que fazia; ele não enxerga o convite, então ficou aqui)
    if (!link) {
      void supabase().auth.getSession().then(({ data }) => { if (!saiu && data.session) router.replace("/"); });
      return () => { saiu = true; };
    }
    void supabase().auth.setSession(link).then(({ error }) => {
      if (saiu) return;
      if (error) setErro("Este link venceu ou já foi usado. Peça um novo convite ao Natham.");
      else router.replace("/entrar/nova-senha"); // sem o hash: a sessão já virou cookie
    });
    return () => { saiu = true; };
  }, [router]);

  async function entrar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password: senha });
    if (error) {
      setErro("E-mail ou senha incorretos.");
      setEnviando(false);
      return;
    }
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa de propósito: limpa a memória da sessão anterior
    window.location.href = "/"; // recarrega inteiro: nada da pessoa anterior fica na memória
  }

  return (
    <CartaoEntrar titulo="Entrar" texto="Só entra quem foi convidado. Esqueceu a senha? Peça um novo convite ao Natham.">
      <form className="entrar-form" onSubmit={entrar}>
        <CampoEntrar rotulo="E-mail" icone="email" type="email" name="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <CampoEntrar rotulo="Senha" icone="senha" type="password" name="senha" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        {erro && <p className="entrar-erro" role="alert">{erro}</p>}
        <button type="submit" className="btn" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      </form>
    </CartaoEntrar>
  );
}
