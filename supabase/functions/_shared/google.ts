// Google Drive para as funções do servidor (Deno) e para os testes (Node): só `fetch` e WebCrypto, nenhuma biblioteca.
// As bases do Google são configuráveis por ambiente para apontar para o Google FALSO (google-falso.ts) nos testes.
// Segredos (GOOGLE_CLIENT_ID/SECRET, refresh token) nunca vão para log nem para endereço.

type Env = (nome: string) => string | undefined;
type Busca = typeof fetch;

const denoEnv = (globalThis as { Deno?: { env: { get(n: string): string | undefined } } }).Deno?.env;
export const env: Env = (nome) => (denoEnv ? denoEnv.get(nome) : (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env[nome]);

export const bases = (e: Env = env) => ({
  api: e("GOOGLE_API_BASE") ?? "https://www.googleapis.com",
  token: e("GOOGLE_TOKEN_BASE") ?? "https://oauth2.googleapis.com",
  auth: e("GOOGLE_AUTH_BASE") ?? "https://accounts.google.com",
});

type Deps = { env?: Env; fetch?: Busca; agora?: () => number };

/** Fábrica testável; as exportações no fim do arquivo usam o ambiente real. */
export function criarGoogle(deps: Deps = {}) {
  const e = deps.env ?? env;
  const buscar: Busca = deps.fetch ?? ((...a) => fetch(...a));
  const agora = deps.agora ?? Date.now;
  let cache: { token: string; expira: number } | undefined;

  /** Lê um segredo do Vault pela chave de serviço (rota ler_segredo_servico, sem biblioteca). */
  async function lerSegredo(nome: string): Promise<string | null> {
    const chave = e("SUPABASE_SERVICE_ROLE_KEY");
    const r = await buscar(`${e("SUPABASE_URL")}/rest/v1/rpc/ler_segredo_servico`, {
      method: "POST",
      headers: { apikey: chave ?? "", authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({ p_nome: nome }),
    });
    if (!r.ok) throw new Error(`Não consegui ler o segredo (${r.status})`);
    return ((await r.json()) as string | null) ?? null;
  }

  /** Token de acesso de 1 h; fica em memória até 5 min antes de vencer. */
  async function tokenGoogle(): Promise<string> {
    if (cache && cache.expira - 5 * 60_000 > agora()) return cache.token;
    const refresh = await lerSegredo("google_drive_refresh_token");
    if (!refresh) throw new Error("Google Drive não está ligado");
    const r = await buscar(`${bases(e).token}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: e("GOOGLE_CLIENT_ID") ?? "", client_secret: e("GOOGLE_CLIENT_SECRET") ?? "", refresh_token: refresh, grant_type: "refresh_token" }),
    });
    if (!r.ok) throw new Error(`O Google recusou renovar o acesso (${r.status})`);
    const j = (await r.json()) as { access_token: string; expires_in: number };
    cache = { token: j.access_token, expira: agora() + j.expires_in * 1000 };
    return cache.token;
  }

  /** Corpo em fluxo, sem carregar na memória. 416 (Range fora do arquivo) volta como veio; outros erros viram exceção. */
  async function baixarDoDrive(driveId: string, range?: string | null): Promise<Response> {
    const r = await buscar(`${bases(e).api}/drive/v3/files/${encodeURIComponent(driveId)}?alt=media`, {
      headers: { authorization: `Bearer ${await tokenGoogle()}`, ...(range ? { range } : {}) },
    });
    if (!r.ok && r.status !== 416) throw new Error(`O Drive não entregou o arquivo (${r.status})`);
    return r;
  }

  /** Duração do vídeo medida pelo Drive, em ms. undefined = o Drive ainda não mediu (ou não respondeu): quem chama não barra. */
  async function duracaoVideo(driveId: string): Promise<number | undefined> {
    const r = await buscar(`${bases(e).api}/drive/v3/files/${encodeURIComponent(driveId)}?fields=videoMediaMetadata(durationMillis)`, {
      headers: { authorization: `Bearer ${await tokenGoogle()}` },
    });
    if (!r.ok) return undefined;
    const ms = Number(((await r.json()) as { videoMediaMetadata?: { durationMillis?: string } }).videoMediaMetadata?.durationMillis);
    return ms > 0 ? ms : undefined;
  }

  return { tokenGoogle, baixarDoDrive, duracaoVideo, lerSegredo, esquecerToken: () => { cache = undefined; } };
}

const padrao = criarGoogle();
export const tokenGoogle = padrao.tokenGoogle;
export const baixarDoDrive = padrao.baixarDoDrive;
export const duracaoVideo = padrao.duracaoVideo;
export const lerSegredo = padrao.lerSegredo;

// ---- assinatura HMAC (link do vídeo de 10 min, estado do OAuth) ----
const enc = new TextEncoder();
const chaveHmac = (segredo: string, uso: "sign" | "verify") => crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, [uso]);
const paraHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));

export async function assinar(segredo: string, texto: string): Promise<string> {
  return paraHex(await crypto.subtle.sign("HMAC", await chaveHmac(segredo, "sign"), enc.encode(texto)));
}
/** Confere em tempo constante (crypto.subtle.verify). */
export async function conferir(segredo: string, texto: string, sig: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(sig)) return false;
  return crypto.subtle.verify("HMAC", await chaveHmac(segredo, "verify"), deHex(sig), enc.encode(texto));
}
/** Comparação de segredos em tempo constante (x-tarefas-segredo). */
export async function iguais(a: string, b: string): Promise<boolean> {
  const sigA = await crypto.subtle.sign("HMAC", await chaveHmac("comparar", "sign"), enc.encode(a));
  return crypto.subtle.verify("HMAC", await chaveHmac("comparar", "verify"), sigA, enc.encode(b));
}
