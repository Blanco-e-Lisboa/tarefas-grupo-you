// Protocolo do envio retomável do Google Drive (item 203): o arquivo vai em partes para o endereço da sessão que a função `drive` abriu,
// e o Drive diz até onde já recebeu. Sem estado e sem Supabase: saiu do drive.ts para ele caber no limite de linhas. drive.ts reexporta.

const PARTE = 8 * 1024 * 1024; // múltiplo de 256 KB, como o Drive exige
const TENTATIVAS = 3;

/** O que o Drive respondeu a uma parte: acabou (com o id), ou até onde já recebeu. */
type Retorno = { id: string } | { recebido: number };
async function lerRetorno(r: Response): Promise<Retorno> {
  if (r.status === 200 || r.status === 201) return { id: ((await r.json()) as { id: string }).id };
  const faixa = /bytes=0-(\d+)/.exec(r.headers.get("range") ?? ""); // sem Range = nada recebido ainda
  return { recebido: faixa ? Number(faixa[1]) + 1 : 0 };
}
/** Pergunta ao Drive até onde a sessão já recebeu (depois de uma parte que falhou). Se o último pedaço já tinha chegado, devolve o id. */
export async function ondeParou(sessao: string, total: number, buscar: typeof fetch): Promise<Retorno> {
  const r = await buscar(sessao, { method: "PUT", headers: { "content-range": `bytes */${total}` } });
  if (r.status !== 200 && r.status !== 201 && r.status !== 308) throw new Error(`Drive ${r.status}`);
  return lerRetorno(r);
}

/** Manda o arquivo em partes de 8 MB para o endereço da sessão; refaz a parte que falhou (até 3 vezes) e segue o Range que o Drive devolve. Devolve o id do arquivo no Drive. */
export async function enviarEmPartes(sessao: string, arquivo: Blob, aoProgredir?: (fracao: number) => void, buscar: typeof fetch = (...a) => fetch(...a), parte = PARTE, desde = 0): Promise<string> {
  const total = arquivo.size;
  let inicio = desde, falhas = 0;
  while (inicio < total) {
    const fim = Math.min(inicio + parte, total);
    try {
      const r = await buscar(sessao, { method: "PUT", headers: { "content-range": `bytes ${inicio}-${fim - 1}/${total}` }, body: arquivo.slice(inicio, fim) });
      if (r.status !== 200 && r.status !== 201 && r.status !== 308) throw new Error(`Drive ${r.status}`);
      const ret = await lerRetorno(r);
      if ("id" in ret) { aoProgredir?.(1); return ret.id; }
      inicio = ret.recebido; // o que o Drive diz que tem, não o que achamos que mandamos
      falhas = 0;
      aoProgredir?.(inicio / total);
    } catch (e) {
      if (++falhas >= TENTATIVAS) throw new Error("O envio para o Drive falhou. Tente de novo.", { cause: e });
      try {
        const ret = await ondeParou(sessao, total, buscar);
        if ("id" in ret) { aoProgredir?.(1); return ret.id; }
        inicio = ret.recebido;
      } catch { /* sem resposta: tenta a mesma parte de novo */ }
    }
  }
  throw new Error("O Drive não confirmou o envio. Tente de novo.");
}
