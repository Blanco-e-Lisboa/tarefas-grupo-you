"use client";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { avisarSaida, limparEnvios, ouvirSaida } from "./sair";

// Encerra a sessão e recarrega na tela de entrar (a memória da pessoa anterior não fica).
// B14: sem internet o "sair" do servidor falha e a sessão continuava no navegador (o porteiro devolvia para dentro, logado).
// Agora, se o servidor não responde, a sessão sai pelo menos deste navegador. O que fica guardado dos envios é apagado (ver sair.ts),
// e as outras abas abertas também limpam o delas e voltam para a tela de entrar.
const irParaEntrar = () => {
  limparEnvios();
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa de propósito: limpa a memória da sessão anterior
  window.location.href = "/entrar";
};

export function BotaoSair() {
  useEffect(() => ouvirSaida(window, irParaEntrar), []);
  async function sair() {
    const sb = supabase();
    const { error } = await sb.auth.signOut();
    if (error) await sb.auth.signOut({ scope: "local" });
    avisarSaida();
    irParaEntrar();
  }
  return (
    <button type="button" className="menu-item" onClick={sair} title="Sair">
      <svg className="menu-icone" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 4.5h3.5a2 2 0 012 2v11a2 2 0 01-2 2H14M10 8l-4 4 4 4M6 12h9" />
      </svg>
      <span className="menu-rotulo">Sair</span>
    </button>
  );
}
