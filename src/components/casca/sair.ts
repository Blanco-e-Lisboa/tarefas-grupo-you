// B14 (pente fino r1): sair apaga o que fica guardado dos envios (lista da aba e anotações de envio ao Drive), para a próxima pessoa no
// mesmo computador não herdar. Conferência do Codex: as OUTRAS abas abertas também guardam a lista delas e seguem com o envio na memória.
// Por isso, sair numa aba deixa um recado no navegador (SAIU); as outras abas ouvem, limpam o que é delas e voltam para a tela de entrar.
export const SAIU = "grade:saiu";

/** Apaga desta aba a lista de envios e, do navegador, as anotações de envio ao Drive e os sinais de vida dos envios. */
export function limparEnvios() {
  try {
    sessionStorage.clear();
    Object.keys(localStorage).filter((k) => k.startsWith("grade:envio")).forEach((k) => localStorage.removeItem(k));
  } catch { /* sem armazenamento: nada guardado */ }
}

/** Avisa as outras abas que a pessoa saiu (o evento `storage` só chega às OUTRAS abas). */
export function avisarSaida() {
  try { localStorage.setItem(SAIU, String(Date.now())); } catch { /* sem armazenamento: as outras abas só saem ao recarregar */ }
}

/** Liga a escuta: outra aba saiu -> `sair()`. Devolve quem desliga. */
export function ouvirSaida(alvo: Pick<Window, "addEventListener" | "removeEventListener">, sair: () => void) {
  const ouvir = (e: Event) => { if ((e as StorageEvent).key === SAIU) sair(); };
  alvo.addEventListener("storage", ouvir);
  return () => alvo.removeEventListener("storage", ouvir);
}
