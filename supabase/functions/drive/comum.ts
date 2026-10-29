// Erro com código HTTP e mensagem pronta para a tela: a função `drive` o transforma em resposta.
export class Recusa extends Error {
  constructor(public status: number, mensagem: string) {
    super(mensagem);
  }
}
export const TIPOS = ["imagem", "video", "documento"];
export const SO_TEMA = "Só o Natham ou o Matheus criam e renomeiam temas."; // B2 (pente fino r1)
export const MAX_BYTES = 5 * 1024 ** 3;
export const nomeOk = (n: unknown, max = 120) => (typeof n === "string" && n.trim() && n.trim().length <= max ? n.trim() : undefined);
export const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
/** O tipo do anexo pelo mimeType que o Drive guardou: imagem/*, video/* ou documento (o resto). */
export const tipoDoMime = (mime: string) => (mime.startsWith("image/") ? "imagem" : mime.startsWith("video/") ? "video" : "documento");

// 289 · Range aberto ("bytes=N-", o que o <video> sempre pede) fazia o Drive despejar o vídeo INTEIRO por aqui a cada pulo da
// barrinha da capa: 130 GB de Egress num dia. Teto de 4 MB por pedido; o navegador recebe 206 e pede o pedaço seguinte se precisar.
export const PEDACO_VIDEO = 4 * 1024 * 1024;
export function limitarRange(range: string | null): string {
  // M16 (pente fino r1): "os últimos N bytes" e pedido fora do formato também respeitam o teto
  const fim = /^bytes=-(\d+)$/.exec(range ?? "");
  if (fim) return `bytes=-${Math.min(Number(fim[1]), PEDACO_VIDEO)}`;
  const m = /^bytes=(\d+)-(\d*)$/.exec(range ?? "bytes=0-");
  if (!m) return `bytes=0-${PEDACO_VIDEO - 1}`;
  const ini = Number(m[1]), teto = ini + PEDACO_VIDEO - 1;
  return `bytes=${ini}-${m[2] ? Math.min(Number(m[2]), teto) : teto}`;
}
/** B3: o tipo pelos primeiros bytes (assinatura do formato). undefined = não reconhecido (documento ou formato raro): aí vale o tipo declarado. */
export function tipoDosBytes(b: Uint8Array): "imagem" | "video" | undefined {
  const txt = (i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));
  if ((b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) || txt(0, 4) === "\x89PNG" || txt(0, 4) === "GIF8" || (txt(0, 4) === "RIFF" && txt(8, 4) === "WEBP")) return "imagem";
  if (txt(4, 4) === "ftyp") return ["heic", "heix", "mif1", "msf1", "avif"].includes(txt(8, 4)) ? "imagem" : "video"; // MP4, MOV, 3GP; HEIC/AVIF são foto
  if ((b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) || (txt(0, 4) === "RIFF" && txt(8, 4) === "AVI ")) return "video"; // WebM/MKV, AVI
  return undefined;
}
/** B3 (r1, r3) e F10 (r2): o tipo que vale é o dos primeiros bytes. Foto ou vídeo reconhecido corrige o declarado (vídeo mandado como documento entra
    como vídeo e segue a regra do legendado). Bytes que não são foto nem vídeo só entram como documento: se o navegador ou o Drive dizem foto ou vídeo,
    devolve null e a confirmação recusa (um PDF com nome .jpg não vira capa). */
export function tipoReal(cabeca: Uint8Array, declarado: string, mimeDoDrive: string): "imagem" | "video" | "documento" | null {
  const pelosBytes = tipoDosBytes(cabeca);
  if (pelosBytes) return pelosBytes;
  return declarado === "documento" && tipoDoMime(mimeDoDrive) === "documento" ? "documento" : null;
}
export const NAO_RECONHECI = "Não reconheci este arquivo como foto ou vídeo. Use JPG, PNG, GIF, WebP, HEIC, MP4, MOV, WebM ou AVI.";
