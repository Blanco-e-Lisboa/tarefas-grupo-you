// Meta FALSA: responde como a Graph API v26.0 e o rupload, para provar a postar-meta sem tocar na Meta real.
// Uso nos testes: criarMetaFalsa({ baixar }) -> { fetch, estado }; aponte META_BASE/RUPLOAD_BASE para BASE/RUPLOAD.
// Uso solto: node scripts/meta-falsa.mjs [porta]  (imprime META_BASE e RUPLOAD_BASE para a função local).
// Erros forçados pela LEGENDA do card: "ERRO-PNG" (recusa de formato), "ERRO-PERMISSAO" (chave sem permissão),
// "TIMEOUT-PUBLISH" (publica e a resposta se perde). A Meta falsa também recusa: imagem do Instagram que não é JPEG,
// cover_url junto com thumb_offset, publicar o mesmo contêiner duas vezes, chave errada.
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

export const BASE = "https://meta.falsa/v26.0";
export const RUPLOAD = "https://rupload.falsa";
export const IG = "17841445114922887";
export const PAGINA = "1156670167523861";
const TOKEN_PAGINA = "chave-da-pagina-falsa";

/** @param {{ token?: string, baixar?: (url: string) => Promise<Response>, conferenciasAteFinished?: number }} o */
export function criarMetaFalsa(o = {}) {
  let n = 0;
  const novoId = () => String(9000 + ++n);
  const estado = {
    token: o.token ?? "chave-meta-falsa",
    conteineres: new Map(), // id -> { campos, status, recebido, faltam, publicado }
    videosFb: new Map(), // id -> { tipo, recebido, publicado }
    fotosFb: new Map(),
    publicacoes: [], // { rede, tipo, id, legenda, conteiner }
    links: [], // file_url que a Meta baixou
    chamadas: [], // { metodo, caminho, auth }
    perdeuResposta: new Set(),
    conferenciasAteFinished: o.conferenciasAteFinished ?? 1,
    falhasDeRede: 0, // próximas N chamadas falham como queda de conexão
    recusarFacebook: false, // a página recusa tudo (prova de "saiu numa rede, falhou na outra")
    feedPublicaE500: false, // o /feed publica e mesmo assim responde HTTP 500 (como a Meta faz às vezes)
  };
  const json = (c, status = 200) => new Response(JSON.stringify(c), { status, headers: { "content-type": "application/json" } });
  const erro = (code, message, sub = 0, status = 400) => json({ error: { message, type: "OAuthException", code, error_subcode: sub } }, status);
  const legendaDe = (campos) => campos.caption ?? campos.message ?? campos.description ?? "";

  async function tratar(entrada, init) {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    const auth = req.headers.get("authorization") ?? "";
    estado.chamadas.push({ metodo: req.method, caminho: u.pathname, auth, url: req.url });
    if (estado.falhasDeRede > 0) {
      estado.falhasDeRede--;
      throw new TypeError("fetch failed");
    }

    if (u.origin === new URL(RUPLOAD).origin) {
      const m = /^\/(ig-api-upload|video-upload)\/v26\.0\/(\w+)$/.exec(u.pathname);
      if (!m || req.method !== "POST") return json({}, 404);
      const alvo = m[1] === "ig-api-upload" ? estado.conteineres.get(m[2]) : estado.videosFb.get(m[2]);
      const certo = m[1] === "ig-api-upload" ? estado.token : TOKEN_PAGINA;
      if (auth !== `OAuth ${certo}`) return erro(190, "Invalid OAuth access token", 0, 401);
      if (!alvo) return json({ debug_info: { type: "NotFound", message: "upload session not found" } }, 404);
      // Arquivo hospedado (file_url): a Meta baixa do link. Sem file_url, o corpo é o vídeo inteiro, com file_size igual ao recebido.
      const link = req.headers.get("file_url");
      let recebido = 0;
      if (link) {
        const r = o.baixar ? await o.baixar(link) : null;
        if (!r?.ok) return json({ debug_info: { type: "ProcessingFailedError", message: "could not download file_url" } }, 400);
        if (r.headers.get("content-length") === null) return json({ debug_info: { type: "ProcessingFailedError", message: "missing content-length" } }, 400);
        recebido = (await r.arrayBuffer()).byteLength;
        estado.links.push(link);
      } else {
        for await (const parte of req.body) recebido += parte.length;
        if (String(recebido) !== req.headers.get("file_size")) return json({ debug_info: { type: "ProcessingFailedError", message: "file_size mismatch" } }, 400);
      }
      alvo.recebido = recebido;
      if (alvo.status) alvo.status = "IN_PROGRESS";
      return json({ success: true });
    }
    if (u.origin !== new URL(BASE).origin || !u.pathname.startsWith("/v26.0/")) return json({}, 404);
    const partes = u.pathname.slice("/v26.0/".length).split("/");
    const doRobo = auth === `Bearer ${estado.token}`;
    const daPagina = auth === `Bearer ${TOKEN_PAGINA}`;
    if (!doRobo && !daPagina) return erro(190, "Invalid OAuth access token", 0, 401);
    if (u.searchParams.has("access_token")) return erro(100, "teste: a chave nunca vai no endereço");

    if (req.method === "GET") {
      const [id, aresta] = partes;
      if (id === PAGINA && !aresta) return json({ id, access_token: TOKEN_PAGINA });
      if (id === IG && aresta === "media") {
        return json({ data: estado.publicacoes.filter((p) => p.rede === "instagram").reverse().map((p) => ({ id: p.id, caption: p.legenda, permalink: `https://www.instagram.com/p/${p.id}/` })) });
      }
      const c = estado.conteineres.get(id);
      if (c) {
        if (c.status === "IN_PROGRESS" && --c.faltam <= 0) c.status = "FINISHED";
        return json({ id, status_code: c.publicado ? "PUBLISHED" : c.status, status: c.status === "ERROR" ? "Error: Media upload has failed with error code 2207026" : undefined });
      }
      const v = estado.videosFb.get(id);
      if (v) {
        const up = v.recebido ? "complete" : "not_started";
        return json({ id, status: { video_status: v.publicado ? "ready" : "upload_complete", uploading_phase: { status: up }, processing_phase: { status: v.recebido ? "complete" : "not_started" }, publishing_phase: { status: v.publicado ? "complete" : "not_started" } } });
      }
      const pub = estado.publicacoes.find((p) => p.id === id);
      if (pub) return json({ id, permalink: `https://www.instagram.com/p/${id}/` });
      return erro(100, "Unsupported get request", 33);
    }

    const campos = Object.fromEntries(new URLSearchParams(await req.text()));
    const [dono, aresta] = partes;
    if (legendaDe(campos).includes("ERRO-PERMISSAO")) return erro(10, "(#10) Application does not have permission for this action");

    if (dono === IG && aresta === "media") {
      if (!doRobo) return erro(190, "Invalid token for IG", 0, 401);
      if (legendaDe(campos).includes("ERRO-PNG")) return erro(9004, "Only photo or video can be accepted as media type.", 2207005);
      if (campos.cover_url && campos.thumb_offset !== undefined) return erro(100, "teste: cover_url e thumb_offset juntos");
      for (const k of ["image_url", "cover_url"]) {
        if (!campos[k]) continue;
        const r = o.baixar ? await o.baixar(campos[k]) : null;
        const b = r ? new Uint8Array(await r.arrayBuffer()) : null;
        if (b && !(b[0] === 0xff && b[1] === 0xd8)) return erro(9004, "JPEG is the only image format supported", 2207005);
      }
      const id = novoId();
      if (campos.media_type === "CAROUSEL") {
        const filhos = (campos.children ?? "").split(",");
        if (filhos.some((f) => estado.conteineres.get(f)?.status !== "FINISHED")) return erro(9007, "Children not ready", 2207027);
      }
      const video = campos.upload_type === "resumable";
      estado.conteineres.set(id, { campos, status: video ? "ESPERANDO_ENVIO" : "FINISHED", faltam: estado.conferenciasAteFinished, recebido: 0, publicado: false });
      return json(video ? { id, uri: `${RUPLOAD}/ig-api-upload/v26.0/${id}` } : { id });
    }
    if (dono === IG && aresta === "media_publish") {
      const c = estado.conteineres.get(campos.creation_id);
      if (!c) return erro(100, "Invalid creation_id", 33);
      if (c.publicado) return erro(9007, "The media has already been published", 2207008);
      if (c.status !== "FINISHED") return erro(9007, "Media ID is not available", 2207027);
      c.publicado = true;
      const id = novoId();
      estado.publicacoes.push({ rede: "instagram", tipo: c.campos.media_type ?? "IMAGE", id, legenda: c.campos.caption ?? "", conteiner: campos.creation_id });
      if (legendaDe(c.campos).includes("TIMEOUT-PUBLISH") && !estado.perdeuResposta.has(campos.creation_id)) {
        estado.perdeuResposta.add(campos.creation_id);
        throw new TypeError("fetch failed"); // publicou, mas a resposta se perdeu no caminho
      }
      return json({ id });
    }

    if (dono === PAGINA) {
      if (!daPagina) return erro(190, "Page access token required", 0, 401);
      if (estado.recusarFacebook) return erro(368, "The action attempted has been deemed abusive or is otherwise disallowed", 1390008);
      if (aresta === "photos") {
        const id = novoId();
        estado.fotosFb.set(id, { url: campos.url, publicado: campos.published !== "false" });
        return json({ id });
      }
      if (aresta === "feed") {
        if (legendaDe(campos).includes("ERRO-PNG")) return erro(324, "Missing or invalid image file", 0);
        const fotos = JSON.parse(campos.attached_media ?? "[]").map((m) => m.media_fbid);
        if (!fotos.length || fotos.some((f) => !estado.fotosFb.has(f))) return erro(100, "Invalid attached_media");
        const id = `${PAGINA}_${novoId()}`;
        estado.publicacoes.push({ rede: "facebook", tipo: "feed", id, legenda: campos.message ?? "", fotos });
        if (estado.feedPublicaE500) return erro(1, "An unknown error has occurred.", 0, 500);
        return json({ id });
      }
      if (aresta === "photo_stories") {
        const post_id = novoId();
        estado.publicacoes.push({ rede: "facebook", tipo: "photo_story", id: post_id, legenda: "" });
        return json({ success: true, post_id });
      }
      if (aresta === "video_reels" || aresta === "video_stories") {
        if (campos.upload_phase === "start") {
          const video_id = novoId();
          estado.videosFb.set(video_id, { tipo: aresta, recebido: 0, publicado: false });
          return json({ video_id, upload_url: `${RUPLOAD}/video-upload/v26.0/${video_id}` });
        }
        const v = estado.videosFb.get(campos.video_id);
        if (!v || !v.recebido) return erro(100, "Video not uploaded");
        if (!v.publicado) estado.publicacoes.push({ rede: "facebook", tipo: aresta, id: campos.video_id, legenda: campos.description ?? "" });
        v.publicado = true; // o mesmo vídeo vira um post só
        return json(aresta === "video_stories" ? { success: true, post_id: campos.video_id } : { success: true });
      }
    }
    return erro(100, `Unknown path ${u.pathname}`, 0, 404);
  }
  return { fetch: tratar, estado };
}

// ---- servidor solto (node scripts/meta-falsa.mjs [porta]) ----
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const porta = Number(process.argv[2] ?? 8787);
  const { fetch: tratar } = criarMetaFalsa({ token: process.env.META_PUBLISHER_TOKEN ?? "chave-meta-falsa" });
  createServer(async (req, res) => {
    const host = req.url.startsWith("/rupload/") ? RUPLOAD : new URL(BASE).origin;
    const caminho = req.url.replace(/^\/(rupload|graph)/, "");
    try {
      const r = await tratar(`${host}${caminho}`, { method: req.method, headers: req.headers, body: req.method === "GET" ? undefined : req, duplex: "half" });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch {
      res.destroy(); // queda simulada
    }
  }).listen(porta, () => {
    console.log(`Meta falsa em http://localhost:${porta}`);
    console.log(`META_BASE=http://localhost:${porta}/graph/v26.0  RUPLOAD_BASE=http://localhost:${porta}/rupload`);
  });
}
