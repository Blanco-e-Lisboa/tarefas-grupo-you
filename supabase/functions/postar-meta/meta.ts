// Cliente mínimo da Meta (Graph API v26.0 + rupload) por `fetch`. A chave vai SÓ no cabeçalho, nunca no endereço nem em log.
// Bases por ambiente (META_BASE, RUPLOAD_BASE) para apontar para a Meta falsa (scripts/meta-falsa.mjs) nos testes.
type Busca = typeof fetch;

export const VERSAO = "v26.0";

/** Recusa da própria Meta (resposta com `error`): nada foi publicado nesta chamada. */
export class ErroMeta extends Error {
  constructor(public http: number, public codigo: number, public sub: number, mensagem: string) {
    super(mensagem);
  }
}
/** A Meta descartou o rascunho (contêiner em ERROR/EXPIRED, vídeo que não processou, publicar recusado): nada saiu, recomeçar do zero é seguro. */
export class ErroDescartado extends ErroMeta {}
/** Problema nosso, que nova tentativa não resolve (formato, arquivo faltando). */
export class ErroLocal extends Error {}
/** Não dá para saber se publicou (queda no meio do publicar sem como conferir): nunca repetir sozinho. */
export class ErroIncerto extends Error {}

export type Meta = ReturnType<typeof criarMeta>;

export function criarMeta(o: { base: string; rupload: string; token: string; fetch: Busca }) {
  const cab = (token: string) => ({ authorization: `Bearer ${token}` });

  async function ler<T>(r: Response): Promise<T> {
    // O rupload responde erro em `debug_info`, não em `error` (1º teste real, 28/10: só chegava "HTTP 400")
    const j = (await r.json().catch(() => ({}))) as { error?: { code?: number; error_subcode?: number; message?: string }; debug_info?: { message?: string } };
    if (!r.ok || j.error) throw new ErroMeta(r.status, j.error?.code ?? 0, j.error?.error_subcode ?? 0, j.error?.message ?? j.debug_info?.message ?? `HTTP ${r.status}`);
    return j as T;
  }
  const corpo = (campos: Record<string, string | number | boolean | undefined>) =>
    new URLSearchParams(Object.entries(campos).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));

  return {
    get: async <T>(caminho: string, campos: string, token = o.token) =>
      ler<T>(await o.fetch(`${o.base}/${caminho}?fields=${encodeURIComponent(campos)}`, { headers: cab(token) })),
    post: async <T>(caminho: string, campos: Record<string, string | number | boolean | undefined>, token = o.token) =>
      ler<T>(await o.fetch(`${o.base}/${caminho}`, { method: "POST", headers: cab(token), body: corpo(campos) })),
    /** Uma parte do vídeo a partir de `offset` (envio retomável). Corpo em bytes, com tamanho conhecido: o Deno manda todo fluxo
        (ReadableStream) "chunked", sem content-length, e o rupload recusou com 400 (28/10). `tipo`: ig-api-upload ou video-upload. */
    async enviar(tipo: "ig-api-upload" | "video-upload", id: string, bytes: Uint8Array, offset: number, tamanho: number, token = o.token) {
      const init = { method: "POST", headers: { authorization: `OAuth ${token}`, offset: String(offset), file_size: String(tamanho) }, body: bytes as BodyInit };
      const j = await ler<{ success?: boolean }>(await o.fetch(`${o.rupload}/${tipo}/${VERSAO}/${id}`, init));
      if (j.success === false) throw new ErroMeta(200, 0, 0, "a Meta não confirmou o recebimento do vídeo");
    },
  };
}

const PERMISSAO = (c: number) => c === 190 || c === 10 || (c >= 200 && c <= 299);
const LIMITE = (c: number, s: number) => c === 4 || c === 17 || c === 32 || c === 613 || s === 2207042;
const POR_SUBCODIGO: Record<number, string> = {
  2207005: "formato de imagem não aceito (o Instagram só aceita JPG)",
  2207009: "proporção da imagem ou do vídeo fora da regra da Meta",
  2207004: "imagem grande demais (máximo 8 MB)",
  2207026: "vídeo fora da regra da Meta (formato, duração ou tamanho)",
  2207052: "a Meta não conseguiu baixar o arquivo",
  2207003: "a Meta demorou demais para baixar o arquivo",
};

/** Mensagem curta em português para a faixa vermelha e se vale UMA nova tentativa sozinho. Endereços saem (link assinado não vai para a tela). */
export function traduzir(e: unknown, token: string): { erro: string; repetir: boolean } {
  const limpar = (t: string) => (token ? t.replaceAll(token, "[chave]") : t).replace(/https?:\/\/\S+/g, "[link]").slice(0, 300);
  if (e instanceof ErroMeta) {
    if (PERMISSAO(e.codigo)) return { erro: `A chave da Meta perdeu acesso ou permissão (código ${e.codigo}).`, repetir: false };
    if (LIMITE(e.codigo, e.sub)) return { erro: "A Meta atingiu o limite de posts por API; tente mais tarde.", repetir: false };
    const conhecido = POR_SUBCODIGO[e.sub];
    return { erro: `A Meta recusou: ${conhecido ?? limpar(e.message)}${conhecido ? "" : ` (código ${e.codigo}/${e.sub})`}.`, repetir: true };
  }
  if (e instanceof ErroLocal || e instanceof ErroIncerto) return { erro: limpar(e.message), repetir: false };
  return { erro: `Falha de conexão: ${limpar(e instanceof Error ? e.message : String(e))}`, repetir: true };
}
