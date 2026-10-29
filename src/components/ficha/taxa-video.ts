// M20 (caso Nicolas): a Meta recusa vídeo acima de 25 Mbps. A ficha lê a duração no navegador ao anexar (nada sobe para isso)
// e avisa na hora, em vez de o erro só aparecer na hora de postar. Taxa média = tamanho do arquivo / duração.
export const LIMITE_MBPS = 25;

/** Megabits por segundo, em média. 0 se a duração é desconhecida. */
export const mbps = (bytes: number, segundos: number) => (segundos > 0 ? (bytes * 8) / segundos / 1_000_000 : 0);

/** Texto do aviso, ou "" se o vídeo está dentro do limite. */
export const avisoTaxa = (nome: string, taxa: number) =>
  taxa > LIMITE_MBPS ? `"${nome}" tem ${Math.round(taxa)} Mbps e a Meta recusa vídeo acima de ${LIMITE_MBPS} Mbps. Exporte de novo com até ${LIMITE_MBPS} Mbps antes de postar.` : "";

/** Duração do vídeo em segundos, lida pelo navegador. null = não deu para ler (formato que o navegador não abre). */
export function duracaoDoVideo(f: File): Promise<number | null> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(f);
    const v = document.createElement("video");
    const fim = (d: number | null) => { URL.revokeObjectURL(url); ok(d); };
    v.preload = "metadata";
    v.onloadedmetadata = () => fim(Number.isFinite(v.duration) ? v.duration : null);
    v.onerror = () => fim(null);
    v.src = url;
  });
}
