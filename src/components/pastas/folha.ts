// A3 (pente fino r1): a folha do mural só grava ao sair do campo se a PESSOA mudou o texto desde que entrou nele.
// Antes comparava com a ideia do banco: se outra pessoa tinha mudado o título, só passar pelo campo regravava o texto velho por cima.

/** O texto a gravar ao sair do campo, ou null se a pessoa não mexeu (nada a gravar). */
export function textoAoSair(aoEntrar: string, agora: string): string | null {
  const v = agora.trim();
  return v === aoEntrar.trim() ? null : v;
}
