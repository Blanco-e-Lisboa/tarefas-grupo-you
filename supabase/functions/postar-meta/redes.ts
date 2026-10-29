// O caminho de cada rede, do arquivo no Drive até o post. Regra de ouro: o rascunho (contêiner) é gravado em `postagens`
// ANTES de publicar, e quem retoma confere na Meta antes de publicar de novo. Nunca dois posts do mesmo card na mesma rede.
// Marcas em `conteiner_id`: "<id>" contêiner do Instagram; "filhos:<a>,<b>" itens do carrossel ainda processando;
// "fotos:<a>,<b>" fotos do Facebook subidas sem publicar; "video:<id>" vídeo no Facebook sem publicar; "video-pub:<id>" já pedimos para publicar.
import type { Arq, Banco, Card, Linha } from "./banco.ts";
import { ErroCancelado, ErroDescartado, ErroIncerto, ErroLocal, ErroMeta, type Meta } from "./meta.ts";

export const ESPERA = 15_000;

export type Ctx = {
  meta: Meta; banco: Banco; card: Card; arqs: Arq[]; linha: Linha;
  verdade: boolean; igId: string; pageId: string; prazo: number;
  agora: () => number; dormir: (ms: number) => Promise<void>;
  baixarDrive: (driveId: string, range?: string) => Promise<Response>;
  duracaoDrive: (driveId: string) => Promise<number | undefined>;
  aindaVale: () => Promise<boolean>;
  /** N2 (r4): rascunho do Instagram gravado antes do r3 (sem assinatura): confere na Meta; publicado = recupera, senão refaz. */
  conferirVelho?: boolean;
  paraJpg: (png: Uint8Array) => Promise<Uint8Array>;
  tokenPagina: () => Promise<string>;
  linkVideo: (a: Arq) => Promise<string>;
  salvar: (conteiner: string) => Promise<void>;
  copias: string[];
  log: (etapa: string, codigo?: string | number) => void;
};
export type Resultado =
  | { fim: "postado"; post_id: string | null; link: string | null }
  | { fim: "processando"; conteiner_id: string }
  | { fim: "teste" };

const processando = (conteiner_id: string): Resultado => ({ fim: "processando", conteiner_id });
/** A5: confere no banco, logo antes de publicar, que o card ainda deve sair agora. */
async function aindaVale(c: Ctx) { if (!(await c.aindaVale())) throw new ErroCancelado("Cancelado antes de publicar: o card saiu de Aprovado, perdeu a data ou espera vídeo novo."); }
/** Rascunho já PEDIDO à Meta para publicar (pode ter saído): "pub:" Instagram, "video-pub:" vídeo do Facebook, "fotos:" foto do Facebook. Nunca se apaga. */
export const pedidoNaMeta = (conteiner: string | null | undefined) => /^(pub:|video-pub:|fotos:)/.test(conteiner ?? "");
/** M20: a Meta recusa vídeo acima de 25 Mbps (caso Nicolas, 28/10). Taxa média = tamanho / duração que o Drive mediu, conferida ANTES de criar
    qualquer rascunho na Meta. Sem duração (o Drive ainda não mediu, vídeo grande ainda processando, ou não respondeu) segue como antes e a Meta decide (F3, pente fino r2). */
export const MAX_MBPS = 25;
async function conferirTaxa(c: Ctx, anexos: Arq[]) {
  for (const a of anexos) if (a.tipo === "video" && a.drive_id) {
    const ms = await c.duracaoDrive(a.drive_id).catch(() => undefined);
    if (!ms) continue;
    const mbps = (a.tamanho * 8) / (ms / 1000) / 1e6;
    if (mbps > MAX_MBPS) throw new ErroLocal(`O vídeo "${a.nome}" tem ${mbps.toFixed(1).replace(".", ",")} Mbps e a Meta aceita até ${MAX_MBPS}. Exporte de novo com taxa menor (ex.: 1080x1920, 30 fps, 20 Mbps) e anexe.`);
  }
}
const ehJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
const ehPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

/** Confere o que o formato pede (a tela já confere; aqui é a última barreira antes da Meta). */
export function midias(card: Card, arqs: Arq[]) {
  const anexos = arqs.filter((a) => a.papel === "anexo" && (a.tipo === "imagem" || a.tipo === "video"));
  const capa = arqs.find((a) => a.papel === "capa");
  const n = anexos.length;
  const ok = {
    post: n === 1 && anexos[0].tipo === "imagem",
    reels: n === 1 && anexos[0].tipo === "video",
    carrossel: n >= 2 && n <= 10,
    story: n === 1,
  }[card.formato ?? ""];
  if (ok === undefined) throw new ErroLocal("Card sem formato (Reels, Post, Carrossel ou Story).");
  if (!ok) throw new ErroLocal({ post: "Post precisa de 1 imagem.", reels: "Reels precisa de 1 vídeo.", carrossel: "Carrossel precisa de 2 a 10 arquivos.", story: "Story precisa de 1 imagem ou vídeo." }[card.formato!]!);
  return { anexos, capa };
}

/** Foto ou capa para a Meta: cópia de minutos no balde `postagens`. Instagram só aceita JPG: PNG é convertido, só para ele. */
async function urlImagem(c: Ctx, a: Arq, rede: "instagram" | "facebook"): Promise<string> {
  let bytes: Uint8Array = a.drive_id ? new Uint8Array(await (await c.baixarDrive(a.drive_id)).arrayBuffer()) : await c.banco.baixarDoSupabase(a.caminho!);
  if (!ehJpg(bytes) && !ehPng(bytes)) throw new ErroLocal(`A imagem "${a.nome}" precisa ser JPG ou PNG.`);
  if (rede === "instagram" && !ehJpg(bytes)) {
    bytes = await c.paraJpg(bytes);
    c.log("png-para-jpg");
  }
  const jpg = ehJpg(bytes);
  const caminho = `${c.card.id}/${rede}-${a.id}.${jpg ? "jpg" : "png"}`;
  c.copias.push(caminho);
  return c.banco.guardarParaMeta(caminho, bytes, jpg ? "image/jpeg" : "image/png");
}

/** Vídeo do Drive para a Meta pelo caminho oficial de arquivo hospedado: a Meta baixa pelo link assinado desta função
    (ver servirVideo em estado.ts), que entrega o arquivo inteiro do Drive com o tamanho certo. */
async function enviarVideo(c: Ctx, tipo: "ig-api-upload" | "video-upload", id: string, a: Arq, token?: string) {
  if (!a.drive_id) throw new ErroLocal(`O vídeo "${a.nome}" não está no Drive.`);
  await c.meta.enviarLink(tipo, id, await c.linkVideo(a), token);
  c.log("enviou-video");
}

// ---------------- Instagram ----------------

async function itemIg(c: Ctx, a: Arq, campos: Record<string, string | number | boolean | undefined>): Promise<string> {
  if (a.tipo === "imagem") return (await c.meta.post<{ id: string }>(`${c.igId}/media`, { ...campos, image_url: await urlImagem(c, a, "instagram") })).id;
  const { id } = await c.meta.post<{ id: string }>(`${c.igId}/media`, { media_type: "VIDEO", ...campos, upload_type: "resumable" });
  await enviarVideo(c, "ig-api-upload", id, a);
  return id;
}

/** Capa do Reels: capa própria (cover_url) OU quadro escolhido (thumb_offset) OU nada. Nunca os dois. */
async function capaIg(c: Ctx, capa: Arq | undefined) {
  if (capa) return { cover_url: await urlImagem(c, capa, "instagram") };
  if (c.card.capa_quadro_ms != null) return { thumb_offset: c.card.capa_quadro_ms };
  return {};
}

/** Espera os contêineres ficarem prontos até o prazo desta execução. ERROR/EXPIRED vira recusa da Meta. */
async function esperarIg(c: Ctx, ids: string[], umaVez = false): Promise<"pronto" | "publicado" | "pendente"> {
  for (;;) {
    const st = await Promise.all(ids.map((id) => c.meta.get<{ status_code?: string; status?: string }>(id, "status_code,status")));
    const ruim = st.find((s) => s.status_code === "ERROR" || s.status_code === "EXPIRED");
    if (ruim) {
      const sub = Number(/\b(2\d{6})\b/.exec(ruim.status ?? "")?.[1] ?? 0);
      throw new ErroDescartado(200, 0, sub, ruim.status_code === "EXPIRED" ? "o rascunho na Meta venceu (24 h)" : "a Meta não conseguiu processar o arquivo");
    }
    if (st.every((s) => s.status_code === "PUBLISHED")) return "publicado";
    if (st.every((s) => s.status_code === "FINISHED" || s.status_code === "PUBLISHED")) return "pronto";
    if (umaVez || c.agora() + ESPERA > c.prazo) return "pendente";
    await c.dormir(ESPERA);
  }
}

/** O contêiner já está publicado (a execução anterior caiu depois de publicar): acha o post, NÃO publica de novo. */
async function recuperarIg(c: Ctx): Promise<Resultado> {
  // M19 (pente fino r1): a lista da Meta não prova qual post é o nosso (legenda repetida ou mudada, lista parcial): postado SEM link, nunca o link de outro
  c.log("ja-publicado");
  return { fim: "postado", post_id: null, link: null };
}

export async function instagram(c: Ctx): Promise<Resultado> {
  const f = c.card.formato;
  let id = c.linha.conteiner_id;
  if (id?.startsWith("pub:")) id = id.slice(4); // já pedido antes: a conferência abaixo acha PUBLISHED e recupera
  else if (id && c.conferirVelho) {
    if ((await esperarIg(c, [id], true)) === "publicado") return recuperarIg(c); // a gravação de "postado" se perdeu: nunca um segundo post
    c.log("rascunho-velho");
    id = null;
  }
  if (!id) {
    const { anexos, capa } = midias(c.card, c.arqs);
    await conferirTaxa(c, anexos);
    const caption = f === "story" ? undefined : (c.card.legenda ?? "");
    if (f === "carrossel") {
      const filhos: string[] = [];
      for (const a of anexos) filhos.push(await itemIg(c, a, { is_carousel_item: true }));
      id = `filhos:${filhos.join(",")}`;
    } else {
      const media_type = f === "story" ? "STORIES" : f === "reels" ? "REELS" : undefined;
      id = await itemIg(c, anexos[0], { media_type, caption, ...(f === "reels" ? await capaIg(c, capa) : {}) });
    }
    await c.salvar(id);
    c.log("conteiner");
  }
  if (id.startsWith("filhos:")) {
    const filhos = id.slice(7).split(",");
    if ((await esperarIg(c, filhos)) !== "pronto") return processando(id);
    id = (await c.meta.post<{ id: string }>(`${c.igId}/media`, { media_type: "CAROUSEL", children: filhos.join(","), caption: c.card.legenda ?? "" })).id;
    await c.salvar(id);
  }
  const st = await esperarIg(c, [id]);
  if (st === "publicado") return recuperarIg(c);
  if (st === "pendente") return processando(id);
  if (!c.verdade) return { fim: "teste" };
  await aindaVale(c);
  await c.salvar(`pub:${id}`); // marca ANTES de pedir: daqui em diante o rascunho nunca se apaga
  let mediaId: string;
  try {
    mediaId = (await c.meta.post<{ id: string }>(`${c.igId}/media_publish`, { creation_id: id })).id;
  } catch (e) {
    // Sem resposta clara: confere o contêiner. Publicado = recupera; senão, a próxima rodada confere de novo (nunca publica às cegas).
    if ((await esperarIg(c, [id], true).catch(() => "pendente")) === "publicado") return recuperarIg(c);
    if (e instanceof ErroMeta) {
      await c.salvar(id); // recusa clara: não publicou
      throw e;
    }
    c.log("publicar-sem-resposta");
    return processando(`pub:${id}`);
  }
  c.log("publicou");
  const { permalink } = await c.meta.get<{ permalink?: string }>(mediaId, "permalink").catch(() => ({ permalink: undefined }));
  return { fim: "postado", post_id: mediaId, link: permalink ?? null };
}

// ---------------- Facebook ----------------

const INCERTO_FB = "Estado incerto: não dá para saber se saiu no Facebook (a postagem caiu no meio). Confira a página; se não saiu, use Tentar de novo.";
type FbStatus = { video_status?: string; uploading_phase?: { status?: string }; processing_phase?: { status?: string }; publishing_phase?: { status?: string } };

/** Vídeo já no Facebook: publica UMA vez (marca "video-pub" antes de pedir) e acompanha até sair. */
async function videoFb(c: Ctx, vid: string, pedido: boolean, token: string): Promise<Resultado> {
  const ponto = c.card.formato === "story" ? "video_stories" : "video_reels";
  for (;;) {
    const s = (await c.meta.get<{ status?: FbStatus }>(vid, "status", token)).status ?? {};
    const pub = s.publishing_phase?.status;
    if (pub === "complete") return { fim: "postado", post_id: vid, link: `https://www.facebook.com/${ponto === "video_reels" ? `reel/${vid}` : vid}` };
    if ([s.video_status, s.uploading_phase?.status, s.processing_phase?.status, pub].includes("error")) {
      if (pedido) throw new ErroIncerto(`${INCERTO_FB} (a Meta acusou erro no vídeo)`);
      throw new ErroDescartado(200, 0, 0, "a Meta não conseguiu processar o vídeo");
    }
    if (!pedido) {
      // file_url: a Meta baixa o vídeo do link no tempo dela; enquanto baixa, espera (como no processamento)
      if (s.uploading_phase?.status && s.uploading_phase.status !== "complete") {
        if (c.agora() + ESPERA > c.prazo) return processando(`video:${vid}`);
        await c.dormir(ESPERA);
        continue;
      }
      if (!c.verdade) return { fim: "teste" };
      await aindaVale(c);
      await c.salvar(`video-pub:${vid}`);
      pedido = true;
      try {
        await c.meta.post(`${c.pageId}/${ponto}`, { upload_phase: "finish", video_id: vid, ...(ponto === "video_reels" ? { video_state: "PUBLISHED", description: c.card.legenda ?? "" } : {}) }, token);
        c.log("publicou");
      } catch (e) {
        if (e instanceof ErroMeta) {
          await c.salvar(`video:${vid}`); // recusa clara: não publicou; a nova tentativa pede de novo o mesmo vídeo
          throw e;
        }
        c.log("publicar-sem-resposta");
      }
      continue;
    }
    if (c.agora() + ESPERA > c.prazo) return processando(`video-pub:${vid}`);
    await c.dormir(ESPERA);
  }
}

export async function facebook(c: Ctx): Promise<Resultado> {
  const id = c.linha.conteiner_id;
  if (id?.startsWith("fotos:")) throw new ErroIncerto(INCERTO_FB);
  const token = await c.tokenPagina();
  if (id?.startsWith("video:")) return videoFb(c, id.slice(6), false, token);
  if (id?.startsWith("video-pub:")) return videoFb(c, id.slice(10), true, token);
  const { anexos } = midias(c.card, c.arqs);
  await conferirTaxa(c, anexos);
  const f = c.card.formato;
  if (anexos[0].tipo === "video" || (f === "carrossel" && anexos.some((a) => a.tipo === "video"))) {
    if (f === "carrossel") throw new ErroLocal("Carrossel com vídeo só vai para o Instagram.");
    const { video_id } = await c.meta.post<{ video_id: string }>(`${c.pageId}/${f === "story" ? "video_stories" : "video_reels"}`, { upload_phase: "start" }, token);
    await enviarVideo(c, "video-upload", video_id, anexos[0], token);
    await c.salvar(`video:${video_id}`);
    return videoFb(c, video_id, false, token);
  }
  const fotos: string[] = [];
  for (const a of anexos) fotos.push((await c.meta.post<{ id: string }>(`${c.pageId}/photos`, { url: await urlImagem(c, a, "facebook"), published: false }, token)).id);
  await c.salvar(`fotos:${fotos.join(",")}`);
  if (!c.verdade) return { fim: "teste" };
  await aindaVale(c);
  try {
    if (f === "story") {
      const r = await c.meta.post<{ post_id: string }>(`${c.pageId}/photo_stories`, { photo_id: fotos[0] }, token);
      c.log("publicou");
      return { fim: "postado", post_id: r.post_id, link: `https://www.facebook.com/${r.post_id}` };
    }
    const r = await c.meta.post<{ id: string }>(`${c.pageId}/feed`, { message: c.card.legenda ?? "", attached_media: JSON.stringify(fotos.map((media_fbid) => ({ media_fbid }))) }, token);
    c.log("publicou");
    return { fim: "postado", post_id: r.id, link: `https://www.facebook.com/${r.id}` };
  } catch (e) {
    // Só recusa de validação (HTTP 4xx) prova que não saiu. 5xx, queda ou resposta sem status: pode ter publicado, nunca repostar sozinho.
    if (e instanceof ErroMeta && e.http >= 400 && e.http < 500) throw new ErroDescartado(e.http, e.codigo, e.sub, e.message);
    throw new ErroIncerto(INCERTO_FB);
  }
}
