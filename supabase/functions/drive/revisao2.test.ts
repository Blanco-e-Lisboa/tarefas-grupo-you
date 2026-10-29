// Revisão final da Lupa #2 (achados 3 e 4): cada teste FALHA no código antigo.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BASE_FALSA, criarGoogleFalso, videoFalso } from "../_shared/google-falso.ts";
import { criarGoogle } from "../_shared/google.ts";
import { criarManipulador } from "./acoes.ts";
import { criarDriveApi } from "./drive-api.ts";
import { criarBancoFalso, URL_FALSA } from "./supabase-falso.ts";

vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "tok-n" } } }) } }) }));
import { enviarParaDrive } from "../../../src/lib/dados/drive";

const ENV: Record<string, string> = { SUPABASE_URL: URL_FALSA, SUPABASE_ANON_KEY: "chave-anon-falsa", SUPABASE_SERVICE_ROLE_KEY: "chave-servico-falsa", GOOGLE_API_BASE: BASE_FALSA, GOOGLE_TOKEN_BASE: BASE_FALSA, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "seg" };
const env = (n: string) => ENV[n];

function montar() {
  const g = criarGoogleFalso();
  const b = criarBancoFalso();
  const base = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? g.fetch(e, i) : b.fetch(e, i))) as typeof fetch;
  b.estado.tabelas.pessoas.push({ id: "p-n", slug: "natham", user_id: "u-n" });
  b.estado.tabelas.empresas.push({ id: "you", nome: "You" });
  b.estado.usuarios.set("tok-n", "u-n");
  b.estado.rpcs.ler_segredo_servico = ({ p_nome }) => (p_nome === "tarefas_funcoes_segredo" ? "campainha" : "refresh-falso");
  b.estado.rpcs.pode_mexer_anexos = () => true;
  b.estado.rpcs.pode_mexer_pastas = () => true; // B2: criar e renomear Tema perguntam ao banco
  b.estado.tabelas.tarefas.push({ id: "t1", titulo: "Card", empresa_id: "you", ocasiao_id: null, etapa: "edicao" });
  const google = criarGoogle({ env, fetch: base });
  const tratar = criarManipulador({ env, fetch: base, api: criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: base }), baixar: google.baixarDoDrive });
  return { g, b, base, tratar };
}

describe("achado 4: confirmações simultâneas do mesmo arquivo", () => {
  it("a que perde a corrida não manda o MESMO arquivo para a lixeira e devolve o mesmo anexo", async () => {
    const m = montar();
    const chamar = (corpo: object) => m.tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify(corpo) }));
    const s = (await (await chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 4, papel: "anexo" })).json()) as { sessao_url: string };
    const put = await m.g.fetch(s.sessao_url, { method: "PUT", headers: { "content-range": "bytes 0-3/4" }, body: videoFalso(4) });
    const id = ((await put.json()) as { id: string }).id;
    const pedido = { acao: "confirmar_envio", tarefa_id: "t1", drive_id: id, nome: "a.mp4", tipo: "video", tamanho: 4, papel: "anexo", ordem: 0 };
    const [r1, r2] = await Promise.all([chamar(pedido), chamar(pedido)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(((await r1.json()) as { arquivo_id: string }).arquivo_id).toBe(((await r2.json()) as { arquivo_id: string }).arquivo_id);
    expect(m.g.estado.arquivos.get(id)!.trashed).toBe(false);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
});

describe("achado 3: a conexão cai depois de o arquivo subir e antes de confirmar_envio", () => {
  beforeEach(() => {
    const memoria = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v), removeItem: (k: string) => void memoria.delete(k) });
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_FALSA;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "chave-anon-falsa";
  });

  it("a nova tentativa confirma o MESMO arquivo: um só arquivo no Drive e uma só linha", async () => {
    const m = montar();
    let derrubou = false;
    vi.stubGlobal("fetch", (async (e: RequestInfo | URL, i?: RequestInit) => {
      const url = new Request(e).url;
      if (url === `${URL_FALSA}/functions/v1/drive`) {
        if (!derrubou && String(i?.body).includes("confirmar_envio")) { derrubou = true; throw new TypeError("rede caiu"); }
        return m.tratar(new Request(url, { method: "POST", headers: i?.headers as HeadersInit, body: i?.body as string }));
      }
      return m.base(e, i);
    }) as typeof fetch);
    const arquivo = new File([videoFalso(10)], "reels.mp4", { type: "video/mp4", lastModified: 1 });
    await expect(enviarParaDrive("t1", arquivo, "anexo", 0)).rejects.toThrow();
    const feito = await enviarParaDrive("t1", arquivo, "anexo", 0);
    const noDrive = [...m.g.estado.arquivos.values()].filter((a) => !a.folder);
    expect(noDrive).toHaveLength(1);
    expect(noDrive[0].trashed).toBe(false);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
    expect(feito.driveId).toBe(noDrive[0].id);
  });

  it("se a sessão guardada venceu, abre uma nova em vez de travar", async () => {
    const m = montar();
    vi.stubGlobal("fetch", (async (e: RequestInfo | URL, i?: RequestInit) => {
      const url = new Request(e).url;
      if (url === `${URL_FALSA}/functions/v1/drive`) return m.tratar(new Request(url, { method: "POST", headers: i?.headers as HeadersInit, body: i?.body as string }));
      return m.base(e, i);
    }) as typeof fetch);
    const arquivo = new File([videoFalso(6)], "a.mp4", { type: "video/mp4", lastModified: 7 });
    localStorage.setItem(`grade:envio:t1:anexo:a.mp4:6:7`, JSON.stringify({ sessao: `${BASE_FALSA}/upload/sessao/inexistente` }));
    const feito = await enviarParaDrive("t1", arquivo, "anexo", 0);
    expect([...m.g.estado.arquivos.values()].filter((a) => !a.folder)).toHaveLength(1);
    expect(feito.id).toBeTruthy();
  });

  it("depois de confirmar, a anotação do envio é apagada (o mesmo arquivo escolhido de novo vira um anexo novo)", async () => {
    const m = montar();
    vi.stubGlobal("fetch", (async (e: RequestInfo | URL, i?: RequestInit) => {
      const url = new Request(e).url;
      return url === `${URL_FALSA}/functions/v1/drive` ? m.tratar(new Request(url, { method: "POST", headers: i?.headers as HeadersInit, body: i?.body as string })) : m.base(e, i);
    }) as typeof fetch);
    const arquivo = new File([videoFalso(6)], "a.mp4", { type: "video/mp4", lastModified: 7 });
    await enviarParaDrive("t1", arquivo, "anexo", 0);
    expect(localStorage.getItem("grade:envio:t1:anexo:a.mp4:6:7")).toBeNull();
  });
});

describe("2a volta da Lupa: nunca apagar nem abandonar um arquivo que existe", () => {
  it("achado 4: se a consulta de desempate FALHA, devolve erro e NÃO apaga o arquivo", async () => {
    const m = montar();
    const s = (await (await m.tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 4, papel: "anexo" }) }))).json()) as { sessao_url: string };
    const id = ((await (await m.g.fetch(s.sessao_url, { method: "PUT", headers: { "content-range": "bytes 0-3/4" }, body: videoFalso(4) })).json()) as { id: string }).id;
    m.b.estado.tabelas.arquivos.push({ id: "ja", tarefa_id: "t1", drive_id: id }); // outra confirmação já registrou
    let leituras = 0;
    const f = (async (e: RequestInfo | URL, i?: RequestInit) => {
      const url = String(new Request(e).url);
      if (url.includes("/rest/v1/arquivos?") && url.includes("drive_id=eq.") && (i?.method ?? "GET") === "GET" && ++leituras === 1) return new Response("[]", { status: 200 }); // a 1a leitura não a vê (corrida)
      if (url.includes("/rest/v1/arquivos?") && url.includes("drive_id=eq.") && (i?.method ?? "GET") === "GET") return new Response("{}", { status: 500 }); // o desempate falha
      return m.base(e, i);
    }) as typeof fetch;
    const google = criarGoogle({ env, fetch: f });
    const tratar = criarManipulador({ env, fetch: f, api: criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: f }), baixar: google.baixarDoDrive });
    const r = await tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: id, nome: "a.mp4", tipo: "video", tamanho: 4, papel: "anexo", ordem: 0 }) }));
    expect(r.status).toBe(500);
    expect(m.g.estado.arquivos.get(id)!.trashed).toBe(false);
  });

  const armar = (m: ReturnType<typeof montar>, regra: (corpo: string) => Response | undefined) =>
    vi.stubGlobal("fetch", (async (e: RequestInfo | URL, i?: RequestInit) => {
      const url = new Request(e).url;
      if (url === `${URL_FALSA}/functions/v1/drive`) return regra(String(i?.body)) ?? m.tratar(new Request(url, { method: "POST", headers: i?.headers as HeadersInit, body: i?.body as string }));
      return m.base(e, i);
    }) as typeof fetch);
  const preparar = () => {
    const memoria = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v), removeItem: (k: string) => void memoria.delete(k) });
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_FALSA;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "chave-anon-falsa";
  };

  it("achado 3: a confirmação falha duas vezes e a terceira ainda confirma o MESMO arquivo (um só no Drive)", async () => {
    preparar();
    const m = montar();
    let n = 0;
    armar(m, (corpo) => { if (corpo.includes("confirmar_envio") && ++n <= 2) { if (n === 1) throw new TypeError("rede caiu"); return new Response(JSON.stringify({ erro: "x" }), { status: 503 }); } });
    const arquivo = new File([videoFalso(10)], "reels.mp4", { type: "video/mp4", lastModified: 3 });
    await expect(enviarParaDrive("t1", arquivo, "anexo", 0)).rejects.toThrow();
    await expect(enviarParaDrive("t1", arquivo, "anexo", 0)).rejects.toThrow("Não deu para confirmar o envio, tente de novo.");
    const feito = await enviarParaDrive("t1", arquivo, "anexo", 0);
    const noDrive = [...m.g.estado.arquivos.values()].filter((a) => !a.folder);
    expect(noDrive).toHaveLength(1);
    expect(feito.driveId).toBe(noDrive[0].id);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });

  it("achado 3: quando o servidor diz que o arquivo anotado não existe mais (lixeira), a anotação é descartada e o envio seguinte é novo", async () => {
    preparar();
    const m = montar();
    let n = 0;
    armar(m, (corpo) => { if (corpo.includes("confirmar_envio") && ++n === 1) throw new TypeError("rede caiu"); return undefined; });
    const arquivo = new File([videoFalso(10)], "reels.mp4", { type: "video/mp4", lastModified: 4 });
    await expect(enviarParaDrive("t1", arquivo, "anexo", 0)).rejects.toThrow();
    const antigo = [...m.g.estado.arquivos.values()].find((a) => !a.folder)!;
    antigo.trashed = true; // alguém apagou o arquivo no Drive
    await expect(enviarParaDrive("t1", arquivo, "anexo", 0)).rejects.toThrow("lixeira");
    const feito = await enviarParaDrive("t1", arquivo, "anexo", 0);
    expect(feito.driveId).not.toBe(antigo.id);
    expect([...m.g.estado.arquivos.values()].filter((a) => !a.folder && !a.trashed)).toHaveLength(1);
  });
});

describe("3a volta da Lupa: a ocasião do card muda durante o envio", () => {
  const trocarOcasiao = async (m: ReturnType<typeof montar>) => {
    const r = await m.tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify({ acao: "criar_ocasiao", empresa_id: "you", nome: "Outra ocasião" }) }));
    const nova = ((await r.json()) as { ocasiao: { id: string } }).ocasiao.id;
    m.b.estado.tabelas.tarefas[0].ocasiao_id = nova;
    return nova;
  };
  /** A pasta do conteúdo (card:t1) e onde ela está agora: o arquivo fica DENTRO dela; é ela que muda de tema. */
  const pastaDoCard = (m: ReturnType<typeof montar>) => String(m.b.estado.tabelas.drive_pastas.find((x) => x.chave === "card:t1")!.drive_id);

  it("o servidor MOVE o arquivo para a pasta atual do card e registra (não recusa nem deixa na pasta antiga)", async () => {
    const m = montar();
    const chamar = (corpo: object) => m.tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify(corpo) }));
    const s = (await (await chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 4, papel: "anexo" })).json()) as { sessao_url: string };
    const id = ((await (await m.g.fetch(s.sessao_url, { method: "PUT", headers: { "content-range": "bytes 0-3/4" }, body: videoFalso(4) })).json()) as { id: string }).id;
    const nova = await trocarOcasiao(m);
    const r = await chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: id, nome: "a.mp4", tipo: "video", tamanho: 4, papel: "anexo", ordem: 0 });
    expect(r.status).toBe(200);
    expect(m.g.estado.arquivos.get(id)!.parents).toEqual([pastaDoCard(m)]);
    expect(m.g.estado.arquivos.get(pastaDoCard(m))!.parents).toEqual([String(m.b.estado.tabelas.drive_pastas.find((x) => x.chave === `tema:${nova}:you:sem`)!.drive_id)]);
    expect(m.g.estado.arquivos.get(id)!.trashed).toBe(false);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });

  it("no navegador: cai a rede, a ocasião muda, a nova tentativa confirma o MESMO arquivo (1 no Drive, na pasta nova, 1 linha)", async () => {
    const memoria = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => memoria.get(k) ?? null, setItem: (k: string, v: string) => void memoria.set(k, v), removeItem: (k: string) => void memoria.delete(k) });
    process.env.NEXT_PUBLIC_SUPABASE_URL = URL_FALSA;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "chave-anon-falsa";
    const m = montar();
    let n = 0, nova = "";
    vi.stubGlobal("fetch", (async (e: RequestInfo | URL, i?: RequestInit) => {
      const url = new Request(e).url;
      if (url === `${URL_FALSA}/functions/v1/drive`) {
        if (String(i?.body).includes("confirmar_envio") && ++n === 1) throw new TypeError("rede caiu");
        return m.tratar(new Request(url, { method: "POST", headers: i?.headers as HeadersInit, body: i?.body as string }));
      }
      return m.base(e, i);
    }) as typeof fetch);
    const arquivo = new File([videoFalso(10)], "reels.mp4", { type: "video/mp4", lastModified: 9 });
    await expect(enviarParaDrive("t1", arquivo, "anexo", 0)).rejects.toThrow();
    nova = await trocarOcasiao(m);
    const feito = await enviarParaDrive("t1", arquivo, "anexo", 0);
    const noDrive = [...m.g.estado.arquivos.values()].filter((a) => !a.folder);
    expect(noDrive).toHaveLength(1);
    expect(noDrive[0].parents).toEqual([pastaDoCard(m)]);
    expect(m.g.estado.arquivos.get(pastaDoCard(m))!.parents).toEqual([String(m.b.estado.tabelas.drive_pastas.find((x) => x.chave === `tema:${nova}:you:sem`)!.drive_id)]);
    expect(feito.driveId).toBe(noDrive[0].id);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });

  it("arquivo incompleto vai para a lixeira (não fica órfão) e a anotação pode cair; arquivo fora das pastas do sistema só é recusado", async () => {
    const m = montar();
    const chamar = (corpo: object) => m.tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify(corpo) }));
    const s = (await (await chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 8, papel: "anexo" })).json()) as { sessao_url: string };
    const parcial = ((await (await m.g.fetch(s.sessao_url, { method: "PUT", headers: { "content-range": "bytes 0-7/8" }, body: videoFalso(8) })).json()) as { id: string }).id;
    const r1 = await chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: parcial, nome: "a.mp4", tipo: "video", tamanho: 999, papel: "anexo", ordem: 0 });
    expect(r1.status).toBe(422);
    expect(m.g.estado.arquivos.get(parcial)!.trashed).toBe(true);
    const alheio = m.g.estado.semear("alheio.mp4", videoFalso(4), "video/mp4", ["pasta-que-nao-e-nossa"]);
    expect((await chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: alheio.id, nome: "a.mp4", tipo: "video", tamanho: 4, papel: "anexo", ordem: 0 })).status).toBe(422);
    expect(m.g.estado.arquivos.get(alheio.id)!.trashed).toBe(false);
  });
});
