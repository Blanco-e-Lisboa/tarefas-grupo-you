// Prova da função `drive`, de `_shared/google.ts` e do envio em partes, SÓ com Google falso e banco falso. Nada real.
import { describe, expect, it } from "vitest";
import { enviarEmPartes } from "../../../src/lib/dados/drive";
import { BASE_FALSA, criarGoogleFalso, videoFalso, fotoFalsa } from "../_shared/google-falso.ts";
import { assinar, criarGoogle } from "../_shared/google.ts";
import { criarManipulador, limitarRange, PEDACO_VIDEO } from "./acoes.ts";
import { tipoDosBytes } from "./comum.ts";
import { criarDriveApi } from "./drive-api.ts";
import { criarBancoFalso, URL_FALSA } from "./supabase-falso.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: URL_FALSA, SUPABASE_ANON_KEY: "chave-anon-falsa", SUPABASE_SERVICE_ROLE_KEY: "chave-servico-falsa",
  GOOGLE_API_BASE: BASE_FALSA, GOOGLE_TOKEN_BASE: BASE_FALSA, GOOGLE_AUTH_BASE: BASE_FALSA, GOOGLE_CLIENT_ID: "id-falso", GOOGLE_CLIENT_SECRET: "segredo-google-falso",
  DRIVE_COMPARTILHAR_COM: "matheus@exemplo.com",
};
const SEGREDO = "segredo-campainha-falso";
const env = (n: string) => ENV[n];

function montar() {
  const g = criarGoogleFalso({ clientId: "id-falso", clientSecret: "segredo-google-falso" });
  const b = criarBancoFalso();
  const roteado = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? g.fetch(e, i) : b.fetch(e, i))) as typeof fetch;
  b.estado.tabelas.pessoas.push({ id: "p-natham", slug: "natham", user_id: "u-natham" }, { id: "p-matheus", slug: "matheus", user_id: "u-matheus" });
  b.estado.tabelas.empresas.push({ id: "you", nome: "You" });
  b.estado.usuarios.set("tok-natham", "u-natham");
  b.estado.usuarios.set("tok-matheus", "u-matheus");
  b.estado.rpcs.ler_segredo_servico = ({ p_nome }) => (p_nome === "tarefas_funcoes_segredo" ? SEGREDO : p_nome === "google_drive_refresh_token" ? "refresh-falso" : null);
  b.estado.rpcs.pode_mexer_anexos = () => true;
  b.estado.rpcs.pode_apagar_tarefa = () => true;
  b.estado.rpcs.pode_mexer_pastas = () => true;
  b.estado.rpcs.armar_alarme_servico = () => null;
  b.estado.rpcs.guardar_google_token = ({ p }) => { ENV.__token_guardado = String(p); return null; };
  b.estado.tabelas.tarefas.push({ id: "t1", titulo: "Dia das Mães", empresa_id: "you", ocasiao_id: null, etapa: "edicao" });
  const google = criarGoogle({ env, fetch: roteado });
  const api = criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: roteado });
  const tratar = criarManipulador({ env, fetch: roteado, api, baixar: google.baixarDoDrive });
  const chamar = (corpo: object, token = "tok-natham", extra: Record<string, string> = {}) =>
    tratar(new Request("https://f/functions/v1/drive", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: "https://app.exemplo", "content-type": "application/json", ...extra }, body: JSON.stringify(corpo) }));
  return { g, b, roteado, tratar, chamar, google };
}
const lerJson = async (r: Response) => (await r.json()) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function anexar(m: ReturnType<typeof montar>, bytes: Uint8Array, nome = "reels.mp4", tipo = "video", mime = "video/mp4", papel = "anexo") {
  const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome, tipo, mime, tamanho: bytes.length, papel }));
  const driveId = await enviarEmPartes(s.sessao_url, new Blob([bytes as BlobPart]), undefined, m.g.fetch, 4);
  return m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome, tipo, tamanho: bytes.length, papel, ordem: 0 });
}

describe("google.ts", () => {
  it("troca o refresh token por um token de acesso e guarda em memória", async () => {
    const m = montar();
    expect(await m.google.tokenGoogle()).toMatch(/^tok-/);
    await m.google.tokenGoogle();
    expect(m.g.estado.tokensEmitidos).toBe(1);
  });
  it("renova 5 minutos antes de vencer", async () => {
    const g = criarGoogleFalso(); const b = criarBancoFalso(); let t = 0;
    b.estado.rpcs.ler_segredo_servico = () => "refresh-falso";
    const f = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? g.fetch(e, i) : b.fetch(e, i))) as typeof fetch;
    const x = criarGoogle({ env, fetch: f, agora: () => t });
    await x.tokenGoogle();
    t = 54 * 60_000; await x.tokenGoogle();
    expect(g.estado.tokensEmitidos).toBe(1);
    t = 56 * 60_000; await x.tokenGoogle();
    expect(g.estado.tokensEmitidos).toBe(2);
  });
  it("sem Google ligado, avisa claramente", async () => {
    const m = montar(); m.b.estado.rpcs.ler_segredo_servico = () => null;
    await expect(criarGoogle({ env, fetch: m.roteado }).tokenGoogle()).rejects.toThrow("não está ligado");
  });
  it("baixarDoDrive devolve o corpo em fluxo, sem ler (S2 com Google falso)", async () => {
    const m = montar();
    const a = m.g.estado.semear("grande.mp4", videoFalso(1000));
    const r = await m.google.baixarDoDrive(a.id);
    expect(r.bodyUsed).toBe(false);
    expect(r.body).toBeInstanceOf(ReadableStream);
    // repassa o fluxo direto a outro fetch, sem arrayBuffer() no meio
    const destino = await m.roteado(`${BASE_FALSA}/upload/sessao/x`, { method: "PUT", body: r.body, duplex: "half" } as RequestInit);
    expect(destino.status).toBe(404);
  });
});

describe("drive: envio e confirmação", () => {
  it("cria raiz, empresa, formato, tema e pasta do conteúdo; compartilha a raiz; o navegador sobe em partes; confirma e grava a linha", async () => {
    const m = montar();
    const bytes = videoFalso(10).map((v, i) => (i < 4 ? v : i + 1)); // os 4 primeiros são a assinatura do vídeo (B3)
    const r = await anexar(m, bytes);
    expect(r.status).toBe(200);
    const linha = m.b.estado.tabelas.arquivos[0];
    expect(linha).toMatchObject({ tarefa_id: "t1", tipo: "video", tamanho: 10, papel: "anexo", criado_por: "p-natham", drive_id: expect.any(String) });
    expect(linha.caminho).toBeUndefined();
    const no = m.g.estado.arquivos.get(String(linha.drive_id))!;
    expect([...no.bytes]).toEqual([...bytes]); // vai o original, byte a byte
    const nomes = [...m.g.estado.arquivos.values()].filter((a) => a.folder).map((a) => a.name);
    expect(nomes).toEqual(["Tarefas · Conteúdos", "You", "Sem formato", "Sem tema", "Dia das Mães"]);
    expect(m.g.estado.permissoes).toEqual([{ id: expect.any(String), email: "matheus@exemplo.com", role: "writer" }]);
    expect(m.b.estado.tabelas.ocasioes).toHaveLength(0); // card sem tema NÃO inventa tema com o título dele (229)
    expect([...m.g.estado.sessoes.values()][0].origem).toBe("https://app.exemplo"); // S1: Origin enviado na abertura da sessão
  });
  it("segundo anexo reaproveita as pastas (não cria de novo)", async () => {
    const m = montar();
    await anexar(m, videoFalso(5));
    await anexar(m, fotoFalsa(6), "foto.png", "imagem", "image/png");
    expect([...m.g.estado.arquivos.values()].filter((a) => a.folder)).toHaveLength(5);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(2);
  });
  it("repetir a confirmação não duplica a linha", async () => {
    const m = montar();
    await anexar(m, videoFalso(5));
    const id = String(m.b.estado.tabelas.arquivos[0].drive_id);
    const r = await lerJson(await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: id, nome: "reels.mp4", tipo: "video", tamanho: 5, papel: "anexo", ordem: 0 }));
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
    expect(r.arquivo_id).toBe(m.b.estado.tabelas.arquivos[0].id);
  });
  it("recusa quando a trava do banco diz que não pode mexer (nada é criado no Drive)", async () => {
    const m = montar(); m.b.estado.rpcs.pode_mexer_anexos = () => false;
    const r = await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 5, papel: "anexo" }, "tok-matheus");
    expect(r.status).toBe(403);
    expect(m.g.estado.arquivos.size).toBe(0);
  });
  it("recusa card sem empresa", async () => {
    const m = montar(); m.b.estado.tabelas.tarefas[0].empresa_id = null;
    const r = await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 5, papel: "anexo" });
    expect(r.status).toBe(400);
    expect((await lerJson(r)).erro).toMatch(/empresa/i);
  });
  it("recusa capa que não é imagem, tipo falso e sem login", async () => {
    const m = montar();
    const base = { acao: "sessao_envio", tarefa_id: "t1", nome: "a", tamanho: 5 };
    expect((await m.chamar({ ...base, tipo: "video", mime: "video/mp4", papel: "capa" })).status).toBe(400);
    expect((await m.chamar({ ...base, tipo: "imagem", mime: "video/mp4", papel: "anexo" })).status).toBe(400);
    expect((await m.chamar({ ...base, tipo: "video", mime: "video/mp4" }, "tok-invalido")).status).toBe(401);
  });
  it("arquivo que não chegou inteiro ao Drive é recusado e vai para a lixeira", async () => {
    const m = montar();
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 8, papel: "anexo" }));
    const id = await enviarEmPartes(s.sessao_url, new Blob([videoFalso(8)]), undefined, m.g.fetch, 8);
    const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: id, nome: "a.mp4", tipo: "video", tamanho: 999, papel: "anexo", ordem: 0 });
    expect(r.status).toBe(422);
    expect(m.g.estado.arquivos.get(id)!.trashed).toBe(true);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
  });
  it("arquivo em outra pasta do Drive não é aceito", async () => {
    const m = montar();
    await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 3, papel: "anexo" }));
    const intruso = m.g.estado.semear("outro.mp4", videoFalso(3), "video/mp4", ["pasta-de-outro"]);
    const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: intruso.id, nome: "outro.mp4", tipo: "video", tamanho: 3, papel: "anexo", ordem: 0 });
    expect(r.status).toBe(422);
  });
  it("segunda capa no mesmo card é recusada com mensagem clara", async () => {
    const m = montar();
    expect((await anexar(m, fotoFalsa(4), "c1.jpg", "imagem", "image/jpeg", "capa")).status).toBe(200);
    const r = await anexar(m, fotoFalsa(4), "c2.jpg", "imagem", "image/jpeg", "capa");
    expect(r.status).toBe(409);
  });
});

describe("enviarEmPartes (S1 sem CORS real)", () => {
  it("retoma a parte que falhou e entrega o arquivo inteiro", async () => {
    const m = montar();
    const bytes = videoFalso(23).map((_, i) => i);
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 23, papel: "anexo" }));
    m.g.estado.falharProximasPartes = 2;
    const progresso: number[] = [];
    const id = await enviarEmPartes(s.sessao_url, new Blob([bytes]), (f) => progresso.push(f), m.g.fetch, 8);
    expect([...m.g.estado.arquivos.get(id)!.bytes]).toEqual([...bytes]);
    expect(progresso.at(-1)).toBe(1);
  });
  it("desiste depois de 3 falhas seguidas", async () => {
    const m = montar();
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 8, papel: "anexo" }));
    m.g.estado.falharProximasPartes = 99;
    await expect(enviarEmPartes(s.sessao_url, new Blob([videoFalso(8)]), undefined, m.g.fetch, 8)).rejects.toThrow("falhou");
  });
});

describe("drive: ocasiões", () => {
  it("cria só a linha (sem pasta), recusa nome repetido e renomeia as pastas do tema e do conteúdo pelo id", async () => {
    const m = montar();
    const a = await lerJson(await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: "Natal" }));
    expect(a.ocasiao).toMatchObject({ nome: "Natal", permanente: false });
    const pastas = () => [...m.g.estado.arquivos.values()].filter((x) => x.folder).length;
    expect(pastas()).toBe(0); // as pastas nascem no 1º arquivo
    expect((await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: " natal " })).status).toBe(409);
    Object.assign(m.b.estado.tabelas.tarefas[0], { ocasiao_id: a.ocasiao.id, formato: "reels" });
    await anexar(m, videoFalso(4));
    const nomes = () => [...m.g.estado.arquivos.values()].filter((x) => x.folder).map((x) => x.name);
    expect(nomes()).toEqual(["Tarefas · Conteúdos", "You", "Reels", "Natal", "Reels Natal - Dia das Mães"]);
    expect((await lerJson(await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: a.ocasiao.id, nome: "Natal 2026" }))).restantes).toBe(0);
    expect(nomes()).toEqual(["Tarefas · Conteúdos", "You", "Reels", "Natal 2026", "Reels Natal 2026 - Dia das Mães"]);
    expect(m.b.estado.tabelas.ocasioes[0].nome).toBe("Natal 2026");
  });
  it("renomear para nome que outra ocasião já tem é recusado", async () => {
    const m = montar();
    await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: "A" });
    const b = await lerJson(await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: "B" }));
    expect((await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: b.ocasiao.id, nome: "a" })).status).toBe(409);
  });
});

describe("drive: apagar", () => {
  it("apagar_anexo: lixeira do Google e some a linha", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    const l = m.b.estado.tabelas.arquivos[0];
    expect((await m.chamar({ acao: "apagar_anexo", arquivo_id: l.id })).status).toBe(200);
    expect(m.g.estado.arquivos.get(String(l.drive_id))!.trashed).toBe(true);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
  });
  it("apagar_anexo respeita a trava (depois de Aprovado, só quem aprova)", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.rpcs.pode_mexer_anexos = () => false;
    expect((await m.chamar({ acao: "apagar_anexo", arquivo_id: m.b.estado.tabelas.arquivos[0].id }, "tok-matheus")).status).toBe(403);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("apagar_tarefa: arquivos (Drive e Supabase) e linhas saem ANTES do card; o card sai com a chave do usuário", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.arquivos.push({ id: "a-sup", tarefa_id: "t1", caminho: "tarefas/t1/foto.png", drive_id: null, tipo: "imagem" });
    const r = await m.chamar({ acao: "apagar_tarefa", tarefa_id: "t1" });
    expect(r.status).toBe(200);
    expect([...m.g.estado.arquivos.values()].filter((a) => !a.folder).every((a) => a.trashed)).toBe(true);
    expect(m.b.estado.objetosRemovidos).toEqual(["tarefas/t1/foto.png"]);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
    expect(m.b.estado.tabelas.tarefas).toHaveLength(0);
  });
  it("apagar_tarefa: se o Drive falha, nada some pela metade", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    const erroDrive = ((e: RequestInfo | URL, i?: RequestInit) => (i?.method === "PATCH" ? Promise.resolve(new Response("{}", { status: 500 })) : m.roteado(e, i))) as typeof fetch;
    const g2 = criarGoogle({ env, fetch: erroDrive });
    const t = criarManipulador({ env, fetch: erroDrive, api: criarDriveApi({ api: BASE_FALSA, token: g2.tokenGoogle, fetch: erroDrive }), baixar: g2.baixarDoDrive });
    const r = await t(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-natham" }, body: JSON.stringify({ acao: "apagar_tarefa", tarefa_id: "t1" }) }));
    expect(r.status).toBe(502);
    expect((await lerJson(r)).erro).toBe("Não consegui apagar no Drive, tente de novo.");
    expect(m.b.estado.tabelas.tarefas).toHaveLength(1);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("apagar_tarefa: sem permissão não toca em nada", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.rpcs.pode_apagar_tarefa = () => false;
    expect((await m.chamar({ acao: "apagar_tarefa", tarefa_id: "t1" }, "tok-matheus")).status).toBe(403);
    expect([...m.g.estado.arquivos.values()].some((a) => a.trashed)).toBe(false);
  });
  it("o banco recusando o delete final do card devolve 403 (a trava do 019 vale)", async () => {
    const m = montar(); m.b.estado.podeApagarTarefa = () => false;
    expect((await m.chamar({ acao: "apagar_tarefa", tarefa_id: "t1" })).status).toBe(403);
    expect(m.b.estado.tabelas.tarefas).toHaveLength(1);
  });
});

describe("drive: limpar (alarme de 7 dias)", () => {
  const limpar = (m: ReturnType<typeof montar>, segredo = SEGREDO) =>
    m.tratar(new Request("https://f", { method: "POST", headers: { "x-tarefas-segredo": segredo }, body: JSON.stringify({ acao: "limpar", tarefa_id: "t1" }) }));
  it("só com o segredo; card Postado perde os arquivos e mantém o card", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    expect((await limpar(m, "errado")).status).toBe(401);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
    expect((await limpar(m)).status).toBe(200);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
    expect(m.b.estado.tabelas.tarefas).toHaveLength(1);
    expect([...m.g.estado.arquivos.values()].find((a) => !a.folder)!.trashed).toBe(true);
  });
  it("A6: o card volta para Edição no meio da limpeza: o resto dos arquivos fica", async () => {
    const m = montar(); await anexar(m, videoFalso(5)); await anexar(m, videoFalso(6), "b.mp4");
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    const voltaNoMeio = ((e: RequestInfo | URL, i?: RequestInit) => {
      if (i?.method === "PATCH" && new Request(e).url.startsWith(BASE_FALSA)) m.b.estado.tabelas.tarefas[0].etapa = "edicao"; // alguém arrasta para Edição
      return m.roteado(e, i);
    }) as typeof fetch;
    const g2 = criarGoogle({ env, fetch: voltaNoMeio });
    const t = criarManipulador({ env, fetch: voltaNoMeio, api: criarDriveApi({ api: BASE_FALSA, token: g2.tokenGoogle, fetch: voltaNoMeio }), baixar: g2.baixarDoDrive });
    const r = await t(new Request("https://f", { method: "POST", headers: { "x-tarefas-segredo": SEGREDO }, body: JSON.stringify({ acao: "limpar", tarefa_id: "t1" }) }));
    expect(await lerJson(r)).toMatchObject({ ok: true, parou: true });
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("B3/F10: vídeo anexado dizendo ser documento entra como VÍDEO (corrigido, não recusado depois de subir)", async () => {
    const m = montar();
    const r = await anexar(m, videoFalso(5), "reels.mp4", "documento", "video/mp4");
    expect(r.status).toBe(200);
    expect(m.b.estado.tabelas.arquivos[0]).toMatchObject({ tipo: "video" });
  });
  it("B3/F10: vídeo de verdade mandado sem tipo (genérico) entra como vídeo pelos bytes", async () => {
    const m = montar();
    const mp4 = Uint8Array.of(0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), 0, 0, 0, 0);
    const r = await anexar(m, mp4, "video.bin", "documento", "application/octet-stream");
    expect(r.status).toBe(200);
    expect(m.b.estado.tabelas.arquivos[0]).toMatchObject({ tipo: "video" });
  });
  it("F10: capa que não é imagem é recusada e vai para a lixeira", async () => {
    const m = montar();
    const mp4 = Uint8Array.of(0, 0, 0, 0x18, ...new TextEncoder().encode("ftypisom"), 0, 0, 0, 0);
    const r = await anexar(m, mp4, "capa.jpg", "imagem", "image/jpeg", "capa");
    expect(r.status).toBe(422);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
  });
  it("B3 (r3): bytes que não são foto nem vídeo, declarados como foto, são recusados (um PDF com nome .jpg não vira capa)", async () => {
    const m = montar();
    const pdf = new TextEncoder().encode("%PDF-1.7 xx");
    expect((await anexar(m, pdf, "capa.jpg", "imagem", "image/jpeg", "capa")).status).toBe(422);
    expect((await anexar(m, pdf, "foto.jpg", "imagem", "image/jpeg")).status).toBe(422);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
    expect((await anexar(m, pdf, "roteiro.pdf", "documento", "application/pdf")).status).toBe(200); // documento de verdade continua entrando
  });
  it("A7 (r3): a confirmação tira o envio da lista de vídeos pendentes (envio_id)", async () => {
    const m = montar();
    const chegou: unknown[] = [];
    m.b.estado.rpcs.video_chegando = (x) => void chegou.push(x);
    const bytes = videoFalso(5);
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "v.mp4", tipo: "video", mime: "video/mp4", tamanho: 5, papel: "anexo" }));
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([bytes as BlobPart]), undefined, m.g.fetch, 4);
    const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome: "v.mp4", tipo: "video", tamanho: 5, papel: "anexo", ordem: 0, envio_id: "e1" });
    expect(r.status).toBe(200);
    expect(chegou).toEqual([{ p_tarefa: "t1", p_envio: "e1" }]);
  });
  it("A7 (r4): com o 039, registro e saída da lista numa gravação só (registrar_video)", async () => {
    const m = montar();
    const pedidos: Record<string, unknown>[] = [];
    m.b.estado.rpcs.registrar_video = (x) => { pedidos.push(x); m.b.estado.tabelas.arquivos.push({ id: "a-reg", tarefa_id: "t1", drive_id: (x.p_linha as { drive_id: string }).drive_id }); return "a-reg"; };
    m.b.estado.rpcs.video_chegando = () => { throw new Error("não devia tirar da lista antes do registro"); };
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "v.mp4", tipo: "video", mime: "video/mp4", tamanho: 5, papel: "anexo" }));
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([videoFalso(5) as BlobPart]), undefined, m.g.fetch, 4);
    const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome: "v.mp4", tipo: "video", tamanho: 5, papel: "anexo", ordem: 0, envio_id: "e1" });
    expect(r.status).toBe(200);
    expect((await lerJson(r)).arquivo_id).toBe("a-reg");
    expect(pedidos).toMatchObject([{ p_tarefa: "t1", p_envio: "e1", p_linha: { drive_id: driveId, tipo: "video", papel: "anexo" } }]);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("novo 3 (r4): confirmar de novo um vídeo já registrado também tira o envio da lista (video_chegou)", async () => {
    const m = montar();
    const chegou: unknown[] = [];
    m.b.estado.rpcs.video_chegou = (x) => void chegou.push(x);
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "v.mp4", tipo: "video", mime: "video/mp4", tamanho: 5, papel: "anexo" }));
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([videoFalso(5) as BlobPart]), undefined, m.g.fetch, 4);
    const pedido = { acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome: "v.mp4", tipo: "video", tamanho: 5, papel: "anexo", ordem: 0 };
    expect((await m.chamar(pedido)).status).toBe(200);
    expect((await m.chamar({ ...pedido, envio_id: "e2" })).status).toBe(200); // retomada: outro envio, o mesmo arquivo
    expect(chegou).toEqual([{ p_tarefa: "t1", p_envio: "e2" }]);
  });
  it("tipoDosBytes reconhece foto e vídeo e não chuta o resto", () => {
    const b = (s: string, pre: number[] = []) => Uint8Array.from([...pre, ...new TextEncoder().encode(s)]);
    expect(tipoDosBytes(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe("imagem");
    expect(tipoDosBytes(b("ftypheic", [0, 0, 0, 0x18]))).toBe("imagem");
    expect(tipoDosBytes(b("ftypqt  ", [0, 0, 0, 0x14]))).toBe("video");
    expect(tipoDosBytes(Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3))).toBe("video");
    expect(tipoDosBytes(b("%PDF-1.7"))).toBeUndefined();
  });
  it("M14 (pós-Codex): trocar a única capa: a velha sai só depois da nova conferida, e a pasta fica", async () => {
    const m = montar();
    const jpg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1);
    const velha = await lerJson(await anexar(m, jpg, "capa1.jpg", "imagem", "image/jpeg", "capa"));
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "capa2.jpg", tipo: "imagem", mime: "image/jpeg", tamanho: 5, papel: "capa" }));
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([jpg as BlobPart]), undefined, m.g.fetch, 4);
    const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome: "capa2.jpg", tipo: "imagem", tamanho: 5, papel: "capa", substitui_arquivo_id: velha.arquivo_id });
    expect(r.status).toBe(200);
    expect((await lerJson(r)).arquivo_id).toBe(velha.arquivo_id); // F4: a mesma linha, agora com o arquivo novo
    expect(m.b.estado.tabelas.arquivos.map((a) => a.drive_id)).toEqual([driveId]);
    const arqs = [...m.g.estado.arquivos.values()];
    expect(arqs.filter((a) => a.folder && a.trashed)).toHaveLength(0);
    expect(arqs.find((a) => a.id === driveId)!.trashed).toBe(false);
  });
  it("F4 (pente fino r2): o banco falha ao gravar a troca: a capa velha continua no card e no Drive", async () => {
    const m = montar();
    const jpg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1);
    const velha = await lerJson(await anexar(m, jpg, "capa1.jpg", "imagem", "image/jpeg", "capa"));
    const driveVelho = m.b.estado.tabelas.arquivos[0].drive_id;
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "capa2.jpg", tipo: "imagem", mime: "image/jpeg", tamanho: 5, papel: "capa" }));
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([jpg as BlobPart]), undefined, m.g.fetch, 4);
    const bancoCai = ((e: RequestInfo | URL, i?: RequestInit) => {
      const u = new Request(e).url;
      return (i?.method === "PATCH" || i?.method === "POST") && u.includes("/rest/v1/arquivos") ? Promise.resolve(new Response("{}", { status: 500 })) : m.roteado(e, i);
    }) as typeof fetch;
    const g2 = criarGoogle({ env, fetch: bancoCai });
    const t = criarManipulador({ env, fetch: bancoCai, api: criarDriveApi({ api: BASE_FALSA, token: g2.tokenGoogle, fetch: bancoCai }), baixar: g2.baixarDoDrive });
    const r = await t(new Request("https://f/functions/v1/drive", { method: "POST", headers: { authorization: "Bearer tok-natham", "content-type": "application/json" },
      body: JSON.stringify({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome: "capa2.jpg", tipo: "imagem", tamanho: 5, papel: "capa", substitui_arquivo_id: velha.arquivo_id }) }));
    expect(r.status).toBeGreaterThanOrEqual(500);
    expect(m.b.estado.tabelas.arquivos.map((a) => a.drive_id)).toEqual([driveVelho]);
    expect(m.g.estado.arquivos.get(String(driveVelho))!.trashed).toBe(false);
  });
  it("M14: substitui_arquivo_id de outro card (ou outro papel) é recusado e nada muda", async () => {
    const m = montar();
    const jpg = Uint8Array.of(0xff, 0xd8, 0xff, 0xe0, 1);
    const anexo = await lerJson(await anexar(m, jpg, "foto.jpg", "imagem", "image/jpeg", "anexo"));
    const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "capa.jpg", tipo: "imagem", mime: "image/jpeg", tamanho: 5, papel: "capa" }));
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([jpg as BlobPart]), undefined, m.g.fetch, 4);
    const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: driveId, nome: "capa.jpg", tipo: "imagem", tamanho: 5, papel: "capa", substitui_arquivo_id: anexo.arquivo_id });
    expect(r.status).toBe(409);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("A6 (pós-Codex): o card sai de Postado logo depois do último arquivo: a pasta do conteúdo NÃO vai para a lixeira", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    const voltaNoMeio = ((e: RequestInfo | URL, i?: RequestInit) => {
      if (i?.method === "PATCH" && new Request(e).url.startsWith(BASE_FALSA)) m.b.estado.tabelas.tarefas[0].etapa = "edicao";
      return m.roteado(e, i);
    }) as typeof fetch;
    const g2 = criarGoogle({ env, fetch: voltaNoMeio });
    const t = criarManipulador({ env, fetch: voltaNoMeio, api: criarDriveApi({ api: BASE_FALSA, token: g2.tokenGoogle, fetch: voltaNoMeio }), baixar: g2.baixarDoDrive });
    const r = await t(new Request("https://f", { method: "POST", headers: { "x-tarefas-segredo": SEGREDO }, body: JSON.stringify({ acao: "limpar", tarefa_id: "t1" }) }));
    expect(await lerJson(r)).toMatchObject({ parou: true });
    expect([...m.g.estado.arquivos.values()].filter((a) => a.folder && a.trashed)).toHaveLength(0);
  });
  it("A6 (r3): com a trava do banco, a limpeza pede para começar, apaga e solta a trava", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    m.b.estado.rpcs.iniciar_limpeza_card = () => true;
    m.b.estado.rpcs.terminar_limpeza_card = () => null;
    expect((await limpar(m)).status).toBe(200);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
    const nomes = m.b.estado.chamadasRpc.map((c) => c.nome).filter((n) => n.includes("limpeza_card"));
    expect(nomes).toEqual(["iniciar_limpeza_card", "terminar_limpeza_card"]);
  });
  it("A6 (r3): o banco não deixa começar (o card saiu de Postado agora): nada é apagado", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    m.b.estado.rpcs.iniciar_limpeza_card = () => false;
    expect((await limpar(m)).status).toBe(409);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("A6 (r4): a limpeza solta a trava com o próprio crachá; sem crachá (outra limpeza rodando) não apaga nada", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    const soltou: unknown[] = [];
    m.b.estado.rpcs.iniciar_limpeza_card = () => null;
    m.b.estado.rpcs.terminar_limpeza_card = (x) => void soltou.push(x);
    expect((await limpar(m)).status).toBe(409);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
    expect(soltou).toEqual([]);
    m.b.estado.rpcs.iniciar_limpeza_card = () => "2026-10-29T17:00:00.123+00:00";
    expect((await limpar(m)).status).toBe(200);
    expect(soltou).toEqual([{ p_tarefa: "t1", p_desde: "2026-10-29T17:00:00.123+00:00" }]);
  });
  it("card que não está em Postado não é limpo", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    expect((await limpar(m)).status).toBe(409);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });
  it("o segredo não abre as outras ações", async () => {
    const m = montar();
    const r = await m.tratar(new Request("https://f", { method: "POST", headers: { "x-tarefas-segredo": SEGREDO }, body: JSON.stringify({ acao: "apagar_tarefa", tarefa_id: "t1" }) }));
    expect(r.status).toBe(401);
  });
  it("falha no Drive: rearma o alarme para daqui a 60 min", async () => {
    const m = montar(); await anexar(m, videoFalso(5));
    m.b.estado.tabelas.tarefas[0].etapa = "postado";
    const erroDrive = ((e: RequestInfo | URL, i?: RequestInit) => (i?.method === "PATCH" ? Promise.resolve(new Response("{}", { status: 500 })) : m.roteado(e, i))) as typeof fetch;
    const g2 = criarGoogle({ env, fetch: erroDrive });
    const t = criarManipulador({ env, fetch: erroDrive, api: criarDriveApi({ api: BASE_FALSA, token: g2.tokenGoogle, fetch: erroDrive }), baixar: g2.baixarDoDrive });
    const r = await t(new Request("https://f", { method: "POST", headers: { "x-tarefas-segredo": SEGREDO }, body: JSON.stringify({ acao: "limpar", tarefa_id: "t1" }) }));
    expect(r.status).toBe(502);
    expect(m.b.estado.chamadasRpc.at(-1)).toMatchObject({ nome: "armar_alarme_servico", args: { p_tipo: "limpar", p_minutos: 60 } });
  });
});

describe("drive: vídeo por pedaços (S5 com Google falso)", () => {
  it("link_video assina por 10 min e o GET serve com Range, sem baixar o arquivo inteiro", async () => {
    const m = montar();
    const bytes = videoFalso(1000).map((v, i) => (i < 4 ? v : i % 256));
    await anexar(m, bytes);
    const id = String(m.b.estado.tabelas.arquivos[0].id);
    const { url } = await lerJson(await m.chamar({ acao: "link_video", arquivo_id: id }));
    expect(url).toMatch(/\?ver=.+&ate=\d+&sig=[0-9a-f]{64}$/);
    const r = await m.tratar(new Request(url, { headers: { range: "bytes=100-199" } }));
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe("bytes 100-199/1000");
    expect(r.headers.get("accept-ranges")).toBe("bytes");
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([...bytes.slice(100, 200)]);
    expect(m.g.estado.chamadas.filter((c) => c.range).map((c) => c.range)).toEqual(["bytes=0-15", "bytes=100-199"]); // 0-15: a confirmação confere os primeiros bytes (B3)
    const fim = await m.tratar(new Request(url, { headers: { range: "bytes=900-" } }));
    expect(fim.status).toBe(206);
    expect((await fim.arrayBuffer()).byteLength).toBe(100);
    expect((await m.tratar(new Request(url, { headers: { range: "bytes=5000-" } }))).status).toBe(416);
  });
  it("289: Range aberto ou sem Range nunca pede ao Drive mais que 4 MB (o vídeo inteiro estourava o Egress)", () => {
    const MB4 = PEDACO_VIDEO - 1;
    expect(limitarRange("bytes=0-")).toBe(`bytes=0-${MB4}`);
    expect(limitarRange(null)).toBe(`bytes=0-${MB4}`);
    expect(limitarRange("bytes=1000-")).toBe(`bytes=1000-${1000 + MB4}`);
    expect(limitarRange("bytes=0-999999999")).toBe(`bytes=0-${MB4}`);
    expect(limitarRange("bytes=100-199")).toBe("bytes=100-199");
    expect(limitarRange("bytes=-1073741824")).toBe(`bytes=-${MB4 + 1}`); // M16: sufixo também tem teto
    expect(limitarRange("bytes=-500")).toBe("bytes=-500");
    expect(limitarRange("bytes=0-10,20-30")).toBe(`bytes=0-${MB4}`); // fora do formato: o primeiro pedaço
  });
  it("link adulterado, vencido ou de outro arquivo é recusado", async () => {
    const m = montar(); await anexar(m, videoFalso(10));
    const id = String(m.b.estado.tabelas.arquivos[0].id);
    const { url } = await lerJson(await m.chamar({ acao: "link_video", arquivo_id: id }));
    expect((await m.tratar(new Request(url.replace(/sig=./, "sig=0")))).status).toBe(403);
    expect((await m.tratar(new Request(url.replace(/ver=[^&]+/, "ver=outro")))).status).toBe(403);
    const vencido = Date.now() - 1000;
    const sig = await assinar(SEGREDO, `${id}.${vencido}`);
    expect((await m.tratar(new Request(`${URL_FALSA}/functions/v1/drive?ver=${id}&ate=${vencido}&sig=${sig}`))).status).toBe(403);
  });
  it("quem não vê o card não ganha link (a trava de leitura do banco decide)", async () => {
    const m = montar(); await anexar(m, videoFalso(10));
    m.b.estado.le = (t) => t !== "arquivos";
    expect((await m.chamar({ acao: "link_video", arquivo_id: String(m.b.estado.tabelas.arquivos[0].id) }, "tok-matheus")).status).toBe(404);
  });
  it("não vaza chave nem token nos corpos de erro", async () => {
    const m = montar();
    const r = await m.chamar({ acao: "sessao_envio", tarefa_id: "nao-existe", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 5, papel: "anexo" });
    const txt = await r.text();
    for (const s of ["chave-servico-falsa", "segredo-google-falso", SEGREDO, "refresh-falso"]) expect(txt).not.toContain(s);
  });
});

describe("drive: ordem do carrossel", () => {
  it("grava a ordem só em arquivos do próprio card e respeita a trava", async () => {
    const m = montar(); await anexar(m, videoFalso(5)); await anexar(m, fotoFalsa(5), "b.png", "imagem", "image/png");
    m.b.estado.tabelas.arquivos.push({ id: "alheio", tarefa_id: "outro", drive_id: "x", ordem: 7 });
    const [a, b] = m.b.estado.tabelas.arquivos;
    const r = await m.chamar({ acao: "ordenar_anexos", tarefa_id: "t1", ordem: [{ id: a.id, ordem: 1 }, { id: b.id, ordem: 0 }, { id: "alheio", ordem: 0 }] });
    expect(r.status).toBe(200);
    expect([a.ordem, b.ordem, m.b.estado.tabelas.arquivos[2].ordem]).toEqual([1, 0, 7]);
    m.b.estado.rpcs.pode_mexer_anexos = () => false;
    expect((await m.chamar({ acao: "ordenar_anexos", tarefa_id: "t1", ordem: [{ id: a.id, ordem: 5 }] }, "tok-matheus")).status).toBe(403);
  });
});
