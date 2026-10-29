// Google FALSO para provar tudo sem tocar no Google real (D2 ainda não existe): um `fetch` que responde como o OAuth e o Drive v3.
// Uso: criarGoogleFalso() -> { fetch, estado }; aponte GOOGLE_API_BASE/TOKEN_BASE/AUTH_BASE para BASE_FALSA e passe `fetch` às fábricas.
// NÃO prova: CORS do navegador (S1) nem uso real de memória/CPU (S2) nem Range real do Google (S5): esses ficam PENDENTE-GOOGLE.

export const BASE_FALSA = "https://google.falso";

/** Bytes de mentira com a assinatura de um vídeo (WebM): a função drive confere os primeiros bytes (B3). Mínimo 4. */
export const videoFalso = (n = 8) => { const b = new Uint8Array(Math.max(n, 4)); b.set([0x1a, 0x45, 0xdf, 0xa3]); return b; };
/** Bytes de mentira com a assinatura de uma foto (JPEG). Mínimo 3. */
export const fotoFalsa = (n = 8) => { const b = new Uint8Array(Math.max(n, 3)); b.set([0xff, 0xd8, 0xff]); return b; };
export type ArquivoFalso = { id: string; name: string; mimeType: string; parents: string[]; bytes: Uint8Array; trashed: boolean; folder: boolean; appProperties?: Record<string, string>; duracaoMs?: number };
export type Sessao = { id: string; arquivo: ArquivoFalso; recebido: number; total: number; origem?: string };

export function criarGoogleFalso(opcoes: { clientId?: string; clientSecret?: string } = {}) {
  let n = 0;
  const novoId = (p: string) => `${p}${++n}`;
  const arquivos = new Map<string, ArquivoFalso>();
  const sessoes = new Map<string, Sessao>();
  const estado = {
    arquivos, sessoes,
    /** Põe um arquivo pronto no Drive falso (para testes de baixar/Range). */
    semear(name: string, bytes: Uint8Array, mimeType = "video/mp4", parents: string[] = []): ArquivoFalso {
      const a: ArquivoFalso = { id: novoId("arq"), name, mimeType, parents, bytes, trashed: false, folder: false };
      arquivos.set(a.id, a);
      return a;
    },
    tokensEmitidos: 0,
    chamadas: [] as { metodo: string; caminho: string; range?: string }[],
    permissoes: [] as { id: string; email: string; role: string }[],
    falharProximasPartes: 0, // quantas partes de envio devolvem 503 (prova de retomada)
    refreshToken: "refresh-falso",
    code: "code-falso",
  };
  const json = (c: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(c), { status, headers: { "content-type": "application/json", ...h } });

  async function tratar(entrada: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const req = new Request(entrada, init);
    const u = new URL(req.url);
    const caminho = u.pathname;
    estado.chamadas.push({ metodo: req.method, caminho, range: req.headers.get("range") ?? undefined });

    if (u.origin !== BASE_FALSA) return json({ erro: "fora do Google falso" }, 599);
    if (caminho === "/token" && req.method === "POST") {
      const f = new URLSearchParams(await req.text());
      if (opcoes.clientId && (f.get("client_id") !== opcoes.clientId || f.get("client_secret") !== opcoes.clientSecret)) return json({ error: "invalid_client" }, 401);
      estado.tokensEmitidos++;
      if (f.get("grant_type") === "refresh_token") return f.get("refresh_token") === estado.refreshToken ? json({ access_token: `tok-${estado.tokensEmitidos}`, expires_in: 3600 }) : json({ error: "invalid_grant" }, 400);
      if (f.get("grant_type") === "authorization_code") return f.get("code") === estado.code ? json({ access_token: `tok-${estado.tokensEmitidos}`, expires_in: 3600, refresh_token: estado.refreshToken }) : json({ error: "invalid_grant" }, 400);
      return json({ error: "unsupported_grant_type" }, 400);
    }

    // envio retomável: a sessão é o próprio endereço, sem Authorization (como no Google)
    const mSessao = /^\/upload\/sessao\/(\w+)$/.exec(caminho);
    if (mSessao && req.method === "PUT") {
      const s = sessoes.get(mSessao[1]);
      if (!s) return json({}, 404);
      const cr = /^bytes (?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(req.headers.get("content-range") ?? "");
      if (!cr) return json({}, 400);
      if (!cr[1]) return s.recebido >= s.total ? json({ id: s.arquivo.id }) : new Response(null, { status: 308, headers: s.recebido ? { range: `bytes=0-${s.recebido - 1}` } : {} });
      if (estado.falharProximasPartes > 0) { estado.falharProximasPartes--; return json({}, 503); }
      const ini = Number(cr[1]), fim = Number(cr[2]);
      if (ini !== s.recebido) return json({}, 400); // parte fora de ordem
      const corpo = new Uint8Array(await req.arrayBuffer());
      if (corpo.length !== fim - ini + 1) return json({}, 400);
      const novo = new Uint8Array(s.recebido + corpo.length);
      novo.set(s.arquivo.bytes.subarray(0, s.recebido));
      novo.set(corpo, s.recebido);
      s.arquivo.bytes = novo;
      s.recebido += corpo.length;
      return s.recebido >= s.total ? json({ id: s.arquivo.id }) : new Response(null, { status: 308, headers: { range: `bytes=0-${s.recebido - 1}` } });
    }

    if (!/^Bearer tok-\d+$/.test(req.headers.get("authorization") ?? "")) return json({ error: "sem acesso" }, 401);

    if (caminho === "/upload/drive/v3/files" && req.method === "POST") {
      const corpo = (await req.json()) as { name: string; parents?: string[]; appProperties?: Record<string, string> };
      const total = Number(req.headers.get("x-upload-content-length"));
      const a: ArquivoFalso = { id: novoId("arq"), name: corpo.name, mimeType: req.headers.get("x-upload-content-type") ?? "", parents: corpo.parents ?? [], bytes: new Uint8Array(0), trashed: false, folder: false, appProperties: corpo.appProperties };
      arquivos.set(a.id, a);
      const id = novoId("s");
      sessoes.set(id, { id, arquivo: a, recebido: 0, total, origem: req.headers.get("origin") ?? undefined });
      return new Response(null, { status: 200, headers: { location: `${BASE_FALSA}/upload/sessao/${id}` } });
    }
    if (caminho === "/drive/v3/about") return json({ user: { emailAddress: "nathamsud@gmail.com" } });
    if (caminho === "/drive/v3/files" && req.method === "POST") {
      const c = (await req.json()) as { name: string; mimeType: string; parents?: string[] };
      const a: ArquivoFalso = { id: novoId("pasta"), name: c.name, mimeType: c.mimeType, parents: c.parents ?? [], bytes: new Uint8Array(0), trashed: false, folder: true };
      arquivos.set(a.id, a);
      return json({ id: a.id });
    }
    const mArq = /^\/drive\/v3\/files\/([^/]+)(\/permissions)?$/.exec(caminho);
    if (mArq) {
      const a = arquivos.get(decodeURIComponent(mArq[1]));
      if (!a) return json({ error: "nao existe" }, 404);
      if (mArq[2]) {
        const c = (await req.json()) as { role: string; emailAddress: string };
        estado.permissoes.push({ id: a.id, email: c.emailAddress, role: c.role });
        return json({ id: "perm" });
      }
      if (req.method === "PATCH") {
        const c = (await req.json()) as { name?: string; trashed?: boolean };
        const novos = u.searchParams.get("addParents"), velhos = u.searchParams.get("removeParents")?.split(",") ?? [];
        if (novos || velhos.length) a.parents = [...a.parents.filter((p) => !velhos.includes(p)), ...(novos ? [novos] : [])];
        if (c.name !== undefined) a.name = c.name;
        if (c.trashed !== undefined) a.trashed = c.trashed;
        return json({ id: a.id });
      }
      if (u.searchParams.get("alt") === "media") {
        if (a.trashed) return json({ error: "na lixeira" }, 404);
        const tam = a.bytes.length;
        const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
        if (!m) return new Response(a.bytes as BodyInit, { status: 200, headers: { "content-type": a.mimeType, "content-length": String(tam) } });
        const ini = m[1] === "" ? Math.max(0, tam - Number(m[2])) : Number(m[1]);
        const fim = m[1] === "" || m[2] === "" ? tam - 1 : Math.min(Number(m[2]), tam - 1);
        if (ini >= tam) return new Response(null, { status: 416, headers: { "content-range": `bytes */${tam}` } });
        return new Response(a.bytes.slice(ini, fim + 1), { status: 206, headers: { "content-type": a.mimeType, "content-length": String(fim - ini + 1), "content-range": `bytes ${ini}-${fim}/${tam}` } });
      }
      return json({ id: a.id, name: a.name, parents: a.parents, size: String(a.bytes.length), mimeType: a.mimeType, trashed: a.trashed, appProperties: a.appProperties,
        ...(a.duracaoMs ? { videoMediaMetadata: { durationMillis: String(a.duracaoMs) } } : {}) });
    }
    return json({ error: "rota desconhecida" }, 404);
  }
  return { fetch: tratar as typeof fetch, estado };
}
