// Só para teste: liga a postar-meta ao banco falso (Vitral), ao Google falso (Vitral) e à Meta falsa (scripts/meta-falsa.mjs).
// O balde `postagens` e o convite assinado são simulados aqui. A catraca imita o 019: atômica (síncrona), redes do card, 'enviando' parado há 10 min volta.
import { criarMetaFalsa } from "../../../scripts/meta-falsa.mjs";
import { BASE_FALSA, criarGoogleFalso } from "../_shared/google-falso.ts";
import { criarGoogle } from "../_shared/google.ts";
import { criarBancoFalso, URL_FALSA } from "../drive/supabase-falso.ts";
import { criarManipulador, criarTrabalho, type Deps } from "./estado.ts";

export const TOKEN = "chave-meta-falsa-NUNCA-NO-LOG-7f3a";
export const TAREFA = "0b7e2c1a-1111-4222-8333-944455556666";
export const AVISO = "https://aviso.falso";
export const JPG = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1, 2, 3);
export const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 4, 5, 6);
type Linha = Record<string, unknown>;

export function mundo(o: { verdade?: boolean; conferencias?: number; env?: Record<string, string> } = {}) {
  let t = Date.parse("2026-10-25T21:00:00Z");
  const b = criarBancoFalso();
  const g = criarGoogleFalso();
  const balde = new Map<string, Uint8Array>();
  const removidos: string[] = [];
  const avisos: Linha[] = [];
  const alarmes: string[] = [];
  const logs: string[] = [];
  const corposRupload: unknown[] = [];
  let conversoes = 0;
  b.estado.tabelas.postagens = [];
  const json = (c: unknown, status = 200) => new Response(JSON.stringify(c), { status, headers: { "content-type": "application/json" } });

  async function storage(req: Request): Promise<Response> {
    const p = new URL(req.url).pathname.replace("/storage/v1/object/", "");
    if (req.method === "DELETE") {
      const { prefixes } = (await req.json()) as { prefixes: string[] };
      prefixes.forEach((x) => balde.delete(x));
      removidos.push(...prefixes);
      return json([]);
    }
    if (p.startsWith("sign/postagens/")) {
      if (req.method === "POST") return json({ signedURL: `/object/sign/postagens/${p.slice(15)}?token=convite` });
      const bytes = balde.get(p.slice(15));
      return bytes ? new Response(bytes as BodyInit) : json({}, 404);
    }
    if (p.startsWith("postagens/") && req.method === "POST") {
      balde.set(p.slice(10), new Uint8Array(await req.arrayBuffer()));
      return json({ Key: p });
    }
    return json({}, 404);
  }

  const rotear = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(entrada instanceof Request ? entrada.url : String(entrada));
    if (u.origin === URL_FALSA && u.pathname === "/functions/v1/postar-meta") return manipulador(new Request(entrada, init)); // o link do vídeo (file_url)
    if (u.origin === URL_FALSA && u.pathname.startsWith("/storage/")) return storage(new Request(entrada, init));
    if (u.origin === URL_FALSA) return b.fetch(entrada, init);
    if (u.origin === BASE_FALSA) return g.fetch(entrada, init);
    if (u.origin === AVISO) {
      avisos.push({ ...(JSON.parse(String(init?.body)) as Linha), segredo: new Headers(init?.headers).get("x-tarefas-segredo") });
      return new Response(null, { status: 200 });
    }
    if (u.hostname === "rupload.falsa") corposRupload.push(init?.body);
    return meta.fetch(entrada, init);
  }) as typeof fetch;
  const meta = criarMetaFalsa({ token: TOKEN, baixar: (url: string) => rotear(url), conferenciasAteFinished: o.conferencias ?? 1 });

  const segredos: Record<string, string> = {
    tarefas_funcoes_segredo: "campainha-falsa", google_drive_refresh_token: g.estado.refreshToken,
    tarefas_aviso_url: AVISO, tarefas_aviso_segredo: "segredo-aviso-falso",
  };
  b.estado.rpcs.ler_segredo_servico = (a) => segredos[String(a.p_nome)] ?? null;
  b.estado.rpcs.armar_alarme_servico = (a) => void alarmes.push(`armar ${a.p_minutos}`);
  b.estado.rpcs.desarmar_alarme_servico = () => void alarmes.push("desarmar");
  b.estado.rpcs.pegar_postagens = (a) => {
    const card = b.estado.tabelas.tarefas.find((x) => x.id === a.p_tarefa);
    if (!card || card.etapa !== "aprovado") return [];
    const redes = card.postar_redes as string[];
    const ps = b.estado.tabelas.postagens;
    for (const rede of redes) {
      if (!ps.some((p) => p.tarefa_id === card.id && p.rede === rede)) {
        ps.push({ id: `p-${rede}`, tarefa_id: card.id, rede, status: "fila", conteiner_id: null, tentativas: 0, rodadas: 0, pego_em: 0 });
      }
    }
    const pegas = ps.filter((p) => p.tarefa_id === card.id && redes.includes(String(p.rede))
      && (p.status === "fila" || p.status === "processando" || (p.status === "enviando" && Number(p.pego_em) < t - 600_000)));
    for (const p of pegas) {
      const daFila = p.status === "fila";
      Object.assign(p, { status: "enviando", pego_em: t, tentativas: Number(p.tentativas) + (daFila ? 1 : 0), rodadas: daFila ? 1 : Number(p.rodadas) + 1 });
    }
    return pegas.map((p) => ({ ...p }));
  };

  const ENV: Record<string, string> = {
    SUPABASE_URL: URL_FALSA, SUPABASE_ANON_KEY: "chave-anon-falsa", SUPABASE_SERVICE_ROLE_KEY: b.estado.servico, META_PUBLISHER_TOKEN: TOKEN,
    META_BASE: "https://meta.falsa/v26.0", RUPLOAD_BASE: "https://rupload.falsa",
    GOOGLE_API_BASE: BASE_FALSA, GOOGLE_TOKEN_BASE: BASE_FALSA, POSTAR_DE_VERDADE: o.verdade === false ? "nao" : "sim", ...o.env,
  };
  const env = (n: string) => ENV[n];
  const google = criarGoogle({ env, fetch: rotear, agora: () => t });
  const deps: Deps = {
    env, fetch: rotear, baixarDrive: (id, range) => google.baixarDoDrive(id, range), duracaoDrive: (id) => google.duracaoVideo(id),
    paraJpg: async (png) => { conversoes++; return Uint8Array.of(...JPG, ...png.slice(4)); },
    waitUntil: () => {}, agora: () => t, dormir: async (ms) => { t += ms; }, log: (l) => void logs.push(l),
  };

  const manipulador = criarManipulador(deps);

  /** Card de Postagem da You em Aprovado com os anexos dados (vão para o Drive falso). */
  function card(c: Linha, anexos: { tipo: string; bytes: Uint8Array; papel?: string; nome?: string; duracaoMs?: number }[]) {
    b.estado.tabelas.tarefas.push({ id: TAREFA, titulo: "Card de teste", tipo: "postagem", empresa_id: "you", etapa: "aprovado", postar_em: "2026-10-25T17:00", legenda: "Legenda do post", postar_redes: ["instagram", "facebook"], capa_quadro_ms: null, ...c });
    anexos.forEach((a, i) => {
      const f = g.estado.semear(a.nome ?? `arq${i}`, a.bytes, a.tipo === "video" ? "video/mp4" : "image/jpeg");
      f.duracaoMs = a.duracaoMs ?? (a.tipo === "video" ? 60_000 : undefined); // vídeo do teste: 1 min medido pelo Drive (0 = o Drive não mediu)
      b.estado.tabelas.arquivos.push({ id: `a${i}`, tarefa_id: TAREFA, nome: a.nome ?? `arq${i}`, tipo: a.tipo, drive_id: f.id, caminho: null, tamanho: a.bytes.length, ordem: i, papel: a.papel ?? "anexo" });
    });
  }
  const linha = (rede: string) => b.estado.tabelas.postagens.find((p) => p.rede === rede);
  return {
    b, g, meta, balde, removidos, avisos, alarmes, logs, corposRupload, card, linha, env: ENV,
    trabalhar: criarTrabalho(deps), manipulador, deps,
    conversoes: () => conversoes, avancar: (ms: number) => { t += ms; },
    etapa: () => b.estado.tabelas.tarefas[0]?.etapa,
  };
}
