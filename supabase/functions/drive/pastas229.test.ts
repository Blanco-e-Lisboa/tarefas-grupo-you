// Item 229: árvore Empresa → Formato → Tema → conteúdo, Permanente e documento solto na pasta. SÓ Google falso e banco falso. Nada real.
// A regra "o Matheus liga mas não desliga" é do BANCO (definir_permanente, 019 v2): aqui o banco falso a repete para provar que a função obedece à recusa dele.
import { describe, expect, it } from "vitest";
import { enviarEmPartes } from "../../../src/lib/dados/drive";
import { BASE_FALSA, criarGoogleFalso, videoFalso } from "../_shared/google-falso.ts";
import { criarGoogle } from "../_shared/google.ts";
import { criarManipulador } from "./acoes.ts";
import { criarDriveApi } from "./drive-api.ts";
import { criarBancoFalso, URL_FALSA } from "./supabase-falso.ts";

const ENV: Record<string, string> = {
  SUPABASE_URL: URL_FALSA, SUPABASE_ANON_KEY: "chave-anon-falsa", SUPABASE_SERVICE_ROLE_KEY: "chave-servico-falsa",
  GOOGLE_API_BASE: BASE_FALSA, GOOGLE_TOKEN_BASE: BASE_FALSA, GOOGLE_AUTH_BASE: BASE_FALSA, GOOGLE_CLIENT_ID: "id-falso", GOOGLE_CLIENT_SECRET: "segredo-google-falso",
};
const SEGREDO = "segredo-campainha-falso";
const env = (n: string) => ENV[n];
type L = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const lerJson = async (r: Response) => (await r.json()) as L;

function montar() {
  const g = criarGoogleFalso({ clientId: "id-falso", clientSecret: "segredo-google-falso" });
  const b = criarBancoFalso();
  const roteado = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? g.fetch(e, i) : b.fetch(e, i))) as typeof fetch;
  const t = b.estado.tabelas;
  t.pessoas.push({ id: "p-natham", slug: "natham", user_id: "u-natham" }, { id: "p-matheus", slug: "matheus", user_id: "u-matheus" }, { id: "p-adrian", slug: "adrian", user_id: "u-adrian" });
  t.empresas.push({ id: "you", nome: "You" }, { id: "beec", nome: "Beec" });
  b.estado.usuarios.set("tok-natham", "u-natham");
  b.estado.usuarios.set("tok-matheus", "u-matheus");
  b.estado.usuarios.set("tok-adrian", "u-adrian"); // tem login, mas NÃO é Natham nem Matheus
  const alarmes: { tipo: "armar" | "desarmar"; tarefa: string; minutos?: number }[] = [];
  b.estado.rpcs.ler_segredo_servico = ({ p_nome }) => (p_nome === "tarefas_funcoes_segredo" ? SEGREDO : p_nome === "google_drive_refresh_token" ? "refresh-falso" : null);
  b.estado.rpcs.pode_mexer_anexos = () => true;
  b.estado.rpcs.pode_apagar_tarefa = () => true;
  // 019 v2: só Natham e Matheus mexem nas pastas e LIGAM o Permanente (public.pode_mexer_pastas / pode_ligar_permanente)
  const natMat = (_a: unknown, token: string) => token === "tok-natham" || token === "tok-matheus";
  b.estado.rpcs.pode_mexer_pastas = natMat;
  b.estado.rpcs.pode_ligar_permanente = natMat;
  b.estado.rpcs.armar_alarme_servico = (a) => void alarmes.push({ tipo: "armar", tarefa: String(a.p_tarefa), minutos: Number(a.p_minutos) });
  b.estado.rpcs.desarmar_alarme_servico = (a) => void alarmes.push({ tipo: "desarmar", tarefa: String(a.p_tarefa) });
  // Regra do 019 v2 (private.definir_permanente): só Natham e Matheus; ligado só o Natham desliga.
  // 019 v2 (238): a limpeza dos 7 dias COMEÇA no banco (tema permanente = não; tema comum = sim e marca "limpando"; ligar o Permanente espera: 55006)
  b.estado.rpcs.iniciar_limpeza_tema = (a) => {
    const card = t.tarefas.find((x) => x.id === a.p_tarefa);
    const o = t.ocasioes.find((x) => x.id === card?.ocasiao_id);
    if (!o) return true;
    if (o.permanente) return false;
    o.limpando = true;
    return true;
  };
  b.estado.rpcs.definir_permanente = (a, token) => {
    const slug = token === "tok-natham" ? "natham" : token === "tok-matheus" ? "matheus" : undefined;
    const o = t.ocasioes.find((x) => x.id === a.p_ocasiao);
    if (!slug || !o) throw { status: 403, codigo: "42501" };
    if (o.permanente && !a.p_ligado && slug !== "natham") throw { status: 403, codigo: "42501" };
    if (a.p_ligado && !o.permanente && o.limpando) throw { status: 500, codigo: "55006" };
    o.permanente = a.p_ligado;
    return null;
  };
  t.tarefas.push({ id: "t1", titulo: "Bastidores da You", empresa_id: "you", ocasiao_id: null, etapa: "edicao", formato: "reels" });
  const google = criarGoogle({ env, fetch: roteado });
  const api = criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: roteado });
  const tratar = criarManipulador({ env, fetch: roteado, api, baixar: google.baixarDoDrive });
  const chamar = (corpo: object, token = "tok-natham", extra: Record<string, string> = {}) =>
    tratar(new Request("https://f/functions/v1/drive", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: "https://app.exemplo", "content-type": "application/json", ...extra }, body: JSON.stringify(corpo) }));
  const campainha = (corpo: object) => chamar(corpo, "", { authorization: "", "x-tarefas-segredo": SEGREDO });
  /** Nome e pais de cada pasta do Drive falso, do jeito que a tela Pastas vai enxergar. */
  const arvore = () => {
    const pastas = [...g.estado.arquivos.values()].filter((a) => a.folder && !a.trashed);
    const nome = (id: string): string => { const a = g.estado.arquivos.get(id); return a ? (a.parents[0] && g.estado.arquivos.get(a.parents[0]) ? `${nome(a.parents[0])}/${a.name}` : a.name) : "?"; };
    return pastas.map((p) => nome(p.id)).sort();
  };
  return { g, b, t, chamar, campainha, alarmes, arvore, roteado };
}
type M = ReturnType<typeof montar>;

async function anexar(m: M, bytes = videoFalso(6), tarefa = "t1", nome = "reels.mp4") {
  const s = await lerJson(await m.chamar({ acao: "sessao_envio", tarefa_id: tarefa, nome, tipo: "video", mime: "video/mp4", tamanho: bytes.length, papel: "anexo" }));
  const driveId = await enviarEmPartes(s.sessao_url, new Blob([bytes as BlobPart]), undefined, m.g.fetch, 4);
  const r = await m.chamar({ acao: "confirmar_envio", tarefa_id: tarefa, drive_id: driveId, nome, tipo: "video", tamanho: bytes.length, papel: "anexo", ordem: 0 });
  expect(r.status).toBe(200);
  return driveId;
}
const criarTema = async (m: M, nome: string, extra: object = {}, token = "tok-natham", empresa = "you") =>
  (await lerJson(await m.chamar({ acao: "criar_ocasiao", empresa_id: empresa, nome, ...extra }, token))).ocasiao as L;

describe("229: árvore Empresa → Formato → Tema → conteúdo", () => {
  it("o 1º arquivo cria Empresa/Formato/Tema/'<Formato> <tema> - <título>' (card sem tema vai para 'Sem tema')", async () => {
    const m = montar();
    await anexar(m);
    expect(m.arvore()).toEqual([
      "Tarefas · Conteúdos", "Tarefas · Conteúdos/You", "Tarefas · Conteúdos/You/Reels",
      "Tarefas · Conteúdos/You/Reels/Sem tema", "Tarefas · Conteúdos/You/Reels/Sem tema/Reels - Bastidores da You",
    ]);
  });
  it("com tema: o nome da pasta leva formato e tema; o segundo arquivo reaproveita tudo", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião de outubro");
    Object.assign(m.t.tarefas[0], { ocasiao_id: tema.id });
    await anexar(m);
    await anexar(m, videoFalso(3), "t1", "outro.mp4");
    expect(m.arvore()).toContain("Tarefas · Conteúdos/You/Reels/Reunião de outubro/Reels Reunião de outubro - Bastidores da You");
    expect(m.arvore()).toHaveLength(5);
  });
  it("organizar_card: título, formato e tema mudam depois do upload → a pasta MOVE e RENOMEIA (o arquivo continua o mesmo, pelo id)", async () => {
    const m = montar();
    const driveId = await anexar(m);
    const tema = await criarTema(m, "Natal");
    Object.assign(m.t.tarefas[0], { titulo: "Contagem", formato: "carrossel", ocasiao_id: tema.id });
    const r = await lerJson(await m.chamar({ acao: "organizar_card", tarefa_id: "t1" }));
    expect(r.movida).toBe(true);
    expect(m.arvore()).toContain("Tarefas · Conteúdos/You/Carrossel/Natal/Carrossel Natal - Contagem");
    expect(m.arvore().some((p) => p.endsWith("/Reels - Bastidores da You"))).toBe(false); // a pasta velha não ficou para trás
    expect(m.g.estado.arquivos.get(driveId)!.trashed).toBe(false);
    expect(m.t.arquivos[0].drive_id).toBe(driveId);
  });
  it("organizar_card só muda o nome quando o lugar é o mesmo; sem arquivo ainda não cria pasta", async () => {
    const m = montar();
    expect((await lerJson(await m.chamar({ acao: "organizar_card", tarefa_id: "t1" }))).movida).toBe(false);
    expect(m.arvore()).toEqual([]);
    await anexar(m);
    m.t.tarefas[0].titulo = "Outro título";
    expect((await lerJson(await m.chamar({ acao: "organizar_card", tarefa_id: "t1" }))).movida).toBe(false);
    expect(m.arvore()).toContain("Tarefas · Conteúdos/You/Reels/Sem tema/Reels - Outro título");
  });
  it("pasta do conteúdo tirada do Drive à mão é refeita no próximo envio", async () => {
    const m = montar();
    await anexar(m);
    const velha = String(m.t.drive_pastas.find((x) => x.chave === "card:t1")!.drive_id);
    m.g.estado.arquivos.get(velha)!.trashed = true;
    await anexar(m, videoFalso(2), "t1", "novo.mp4");
    expect(m.t.drive_pastas.find((x) => x.chave === "card:t1")!.drive_id).not.toBe(velha);
  });
  it("renomear o tema renomeia a pasta do tema em cada formato e as pastas dos conteúdos", async () => {
    const m = montar();
    const tema = await criarTema(m, "Natal");
    Object.assign(m.t.tarefas[0], { ocasiao_id: tema.id });
    m.t.tarefas.push({ id: "t2", titulo: "Dica", empresa_id: "you", ocasiao_id: tema.id, etapa: "edicao", formato: "post" });
    await anexar(m); await anexar(m, videoFalso(3), "t2", "d.mp4");
    await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: tema.id, nome: "Natal 2026" });
    expect(m.arvore()).toEqual(expect.arrayContaining([
      "Tarefas · Conteúdos/You/Reels/Natal 2026/Reels Natal 2026 - Bastidores da You",
      "Tarefas · Conteúdos/You/Post/Natal 2026/Post Natal 2026 - Dica",
    ]));
  });
  it("tema de outra empresa continua recusado", async () => {
    const m = montar();
    const tema = await criarTema(m, "Da Beec", {}, "tok-natham", "beec");
    m.t.tarefas[0].ocasiao_id = tema.id;
    const r = await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 4, papel: "anexo" });
    expect(r.status).toBe(409);
  });
});

describe("229: os 7 dias e o Permanente", () => {
  const postado = async (m: M, tema?: L) => {
    Object.assign(m.t.tarefas[0], { etapa: "postado", ocasiao_id: tema?.id ?? null });
    await anexar(m);
  };
  it("limpar (alarme dos 7 dias) em tema comum: arquivos E pasta do conteúdo vão para a lixeira; o card fica", async () => {
    const m = montar();
    await postado(m, await criarTema(m, "Natal"));
    const r = await m.campainha({ acao: "limpar", tarefa_id: "t1" });
    expect(r.status).toBe(200);
    expect(m.t.arquivos).toHaveLength(0);
    expect(m.t.drive_pastas.some((x) => x.chave === "card:t1")).toBe(false);
    expect(m.arvore().some((p) => p.includes("Bastidores da You"))).toBe(false);
    expect(m.arvore()).toContain("Tarefas · Conteúdos/You/Reels/Natal"); // pasta do tema fica (vazia): só a do conteúdo sai
    expect(m.t.tarefas[0].id).toBe("t1");
  });
  it("limpar em card Sem tema também apaga (Sem tema nunca é permanente)", async () => {
    const m = montar();
    await postado(m);
    expect((await m.campainha({ acao: "limpar", tarefa_id: "t1" })).status).toBe(200);
    expect(m.t.arquivos).toHaveLength(0);
  });
  it("limpar em tema PERMANENTE: não apaga nada e DESARMA o alarme (senão o sentinela tocaria de novo)", async () => {
    const m = montar();
    await postado(m, await criarTema(m, "Reunião", { permanente: true }));
    const r = await lerJson(await m.campainha({ acao: "limpar", tarefa_id: "t1" }));
    expect(r.permanente).toBe(true);
    expect(m.t.arquivos).toHaveLength(1);
    expect(m.arvore().some((p) => p.includes("Bastidores da You"))).toBe(true);
    expect(m.alarmes).toEqual([{ tipo: "desarmar", tarefa: "t1" }]);
  });
  it("apagar o card DE PROPÓSITO leva arquivos e pasta, mesmo em tema permanente", async () => {
    const m = montar();
    await postado(m, await criarTema(m, "Reunião", { permanente: true }));
    expect((await m.chamar({ acao: "apagar_tarefa", tarefa_id: "t1" })).status).toBe(200);
    expect(m.t.arquivos).toHaveLength(0);
    expect(m.t.tarefas).toHaveLength(0);
    expect(m.arvore().some((p) => p.includes("Bastidores da You"))).toBe(false);
  });
  it("apagar o último anexo tira também a pasta vazia do conteúdo", async () => {
    const m = montar();
    await anexar(m);
    const id = String(m.t.arquivos[0].id);
    expect((await m.chamar({ acao: "apagar_anexo", arquivo_id: id })).status).toBe(200);
    expect(m.arvore().some((p) => p.includes("Bastidores da You"))).toBe(false);
  });
  it("criar tema já Permanente (padrão desligado); Natham e Matheus podem ligar na criação", async () => {
    const m = montar();
    expect((await criarTema(m, "A")).permanente).toBe(false);
    expect((await criarTema(m, "B", { permanente: true }, "tok-matheus")).permanente).toBe(true);
    expect(m.t.ocasioes.map((o) => o.permanente)).toEqual([false, true]);
  });
  it("quem liga e desliga: o Matheus LIGA, mas o BANCO recusa quando ele tenta desligar; o Natham desliga", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião");
    expect((await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: true }, "tok-matheus")).status).toBe(200);
    expect(m.t.ocasioes[0].permanente).toBe(true);
    const nao = await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: false }, "tok-matheus");
    expect(nao.status).toBe(403);
    expect((await lerJson(nao)).erro).toBe("Só o Natham desliga o Permanente.");
    expect(m.t.ocasioes[0].permanente).toBe(true);
    expect(m.alarmes).toEqual([]); // recusado: nada foi rearmado
    expect((await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: false }, "tok-natham")).status).toBe(200);
    expect(m.t.ocasioes[0].permanente).toBe(false);
  });
  it("desligar recomeça os 7 dias: rearma só os Postados do tema que ainda têm arquivo (10080 min)", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião", { permanente: true });
    m.t.tarefas.push({ id: "t2", titulo: "Já limpo", empresa_id: "you", ocasiao_id: tema.id, etapa: "postado", formato: "reels" }); // postado sem arquivo
    m.t.tarefas.push({ id: "t3", titulo: "Em edição", empresa_id: "you", ocasiao_id: tema.id, etapa: "edicao", formato: "reels" });
    await postado(m, tema);
    await anexar(m, videoFalso(2), "t3", "x.mp4");
    const r = await lerJson(await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: false }));
    expect(r.rearmados).toBe(1);
    expect(m.alarmes).toEqual([{ tipo: "armar", tarefa: "t1", minutos: 10080 }]);
  });
  it("ligar o Permanente não mexe em alarme (eles se desfazem no próximo toque)", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião");
    await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: true });
    expect(m.alarmes).toEqual([]);
  });
  it("mudar o tema de um card Postado: para tema comum rearma 7 dias; para permanente desarma", async () => {
    const m = montar();
    const comum = await criarTema(m, "Comum"), perm = await criarTema(m, "Perm", { permanente: true });
    await postado(m);
    m.t.tarefas[0].ocasiao_id = comum.id;
    await m.chamar({ acao: "organizar_card", tarefa_id: "t1" });
    m.t.tarefas[0].ocasiao_id = perm.id;
    await m.chamar({ acao: "organizar_card", tarefa_id: "t1" });
    expect(m.alarmes).toEqual([{ tipo: "armar", tarefa: "t1", minutos: 10080 }, { tipo: "desarmar", tarefa: "t1" }]);
    await m.chamar({ acao: "organizar_card", tarefa_id: "t1" }); // nada mudou: não mexe de novo
    expect(m.alarmes).toHaveLength(2);
  });
  it("o segredo da campainha só abre o limpar", async () => {
    const m = montar();
    expect((await m.campainha({ acao: "permanente_ocasiao", ocasiao_id: "x", ligado: false })).status).toBe(401);
  });
});

describe("229: documento direto na pasta de um Tema (sem card)", () => {
  const enviarSolto = async (m: M, destino: object, bytes = new Uint8Array(5), nome = "roteiro.pdf", token = "tok-matheus") => {
    const s = await lerJson(await m.chamar({ acao: "sessao_envio_pasta", ...destino, nome, tipo: "documento", mime: "application/pdf", tamanho: bytes.length }, token));
    if (!s.sessao_url) return { s };
    const driveId = await enviarEmPartes(s.sessao_url, new Blob([bytes as BlobPart]), undefined, m.g.fetch, 4);
    const r = await m.chamar({ acao: "confirmar_envio_pasta", ...destino, drive_id: driveId, nome, tipo: "documento", tamanho: bytes.length }, token);
    return { s, r, driveId };
  };
  it("o arquivo cai direto em Empresa/Formato/Tema (sem pasta de conteúdo) e vira uma linha de arquivos sem card", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião");
    const { r, driveId } = await enviarSolto(m, { empresa_id: "you", formato: "reels", ocasiao_id: tema.id });
    expect(r!.status).toBe(200);
    expect(m.t.arquivos[0]).toMatchObject({ drive_id: driveId, empresa_id: "you", formato: "reels", ocasiao_id: tema.id, criado_por: "p-matheus", tipo: "documento" });
    expect(m.t.arquivos[0].tarefa_id).toBeUndefined();
    expect(m.g.estado.arquivos.get(driveId!)!.parents).toEqual([String(m.t.drive_pastas.find((x) => x.chave === `tema:${tema.id}:you:reels`)!.drive_id)]);
    expect(m.arvore()).toContain("Tarefas · Conteúdos/You/Reels/Reunião");
  });
  it("em 'Sem tema' e 'Sem formato' também", async () => {
    const m = montar();
    const { r } = await enviarSolto(m, { empresa_id: "you" }, undefined, "a.pdf", "tok-natham");
    expect(r!.status).toBe(200);
    expect(m.arvore()).toContain("Tarefas · Conteúdos/You/Sem formato/Sem tema");
    expect(m.t.arquivos[0]).toMatchObject({ formato: null, ocasiao_id: null });
  });
  it("repetir a confirmação não duplica; confirmar para OUTRA pasta é recusado e o arquivo fica intocado", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião");
    const destino = { empresa_id: "you", formato: "reels", ocasiao_id: tema.id };
    const { driveId } = await enviarSolto(m, destino);
    const de = { acao: "confirmar_envio_pasta", ...destino, drive_id: driveId, nome: "roteiro.pdf", tipo: "documento", tamanho: 5 };
    expect((await m.chamar(de)).status).toBe(200);
    expect(m.t.arquivos).toHaveLength(1);
    const s = await lerJson(await m.chamar({ acao: "sessao_envio_pasta", ...destino, nome: "b.pdf", tipo: "documento", mime: "application/pdf", tamanho: 2 }));
    const id2 = await enviarEmPartes(s.sessao_url, new Blob([new Uint8Array(2)]), undefined, m.g.fetch, 4);
    const outra = await m.chamar({ acao: "confirmar_envio_pasta", empresa_id: "you", formato: "post", ocasiao_id: tema.id, drive_id: id2, nome: "b.pdf", tipo: "documento", tamanho: 2 });
    expect(outra.status).toBe(422);
    expect(m.t.arquivos).toHaveLength(1);
  });
  it("recusa: tema de outra empresa, formato inventado, sem login e tamanho que não bate (vai para a lixeira)", async () => {
    const m = montar();
    const daBeec = await criarTema(m, "Da Beec", {}, "tok-natham", "beec");
    expect((await m.chamar({ acao: "sessao_envio_pasta", empresa_id: "you", ocasiao_id: daBeec.id, nome: "a.pdf", tipo: "documento", tamanho: 1 })).status).toBe(409);
    expect((await m.chamar({ acao: "sessao_envio_pasta", empresa_id: "you", formato: "tv", nome: "a.pdf", tipo: "documento", tamanho: 1 })).status).toBe(400);
    expect((await m.chamar({ acao: "sessao_envio_pasta", empresa_id: "you", nome: "a.pdf", tipo: "documento", tamanho: 1 }, "tok-ninguem")).status).toBe(401);
    const destino = { empresa_id: "you" };
    const s = await lerJson(await m.chamar({ acao: "sessao_envio_pasta", ...destino, nome: "a.pdf", tipo: "documento", mime: "application/pdf", tamanho: 8 }));
    const id = await enviarEmPartes(s.sessao_url, new Blob([videoFalso(8)]), undefined, m.g.fetch, 4);
    const r = await m.chamar({ acao: "confirmar_envio_pasta", ...destino, drive_id: id, nome: "a.pdf", tipo: "documento", tamanho: 9 });
    expect(r.status).toBe(422);
    expect(m.g.estado.arquivos.get(id)!.trashed).toBe(true);
    expect(m.t.arquivos).toHaveLength(0);
  });
  it("arquivo enviado para um card não vira documento solto de pasta (etiqueta diferente)", async () => {
    const m = montar();
    const idCard = await anexar(m);
    m.t.arquivos.length = 0; // finge que a linha ainda não existe
    const r = await m.chamar({ acao: "confirmar_envio_pasta", empresa_id: "you", formato: "reels", drive_id: idCard, nome: "reels.mp4", tipo: "video", tamanho: 6 });
    expect(r.status).toBe(422);
  });
  it("documento solto: Natham e Matheus apagam (vai para a lixeira); documento solto NÃO some em 7 dias (não há alarme)", async () => {
    const m = montar();
    const { driveId } = await enviarSolto(m, { empresa_id: "you", formato: "post" });
    expect(m.alarmes).toEqual([]);
    const id = String(m.t.arquivos[0].id);
    expect((await m.chamar({ acao: "apagar_anexo", arquivo_id: id }, "tok-matheus")).status).toBe(200);
    expect(m.g.estado.arquivos.get(driveId!)!.trashed).toBe(true);
    expect(m.t.arquivos).toHaveLength(0);
  });
});

describe("236: achados da Lupa no 229", () => {
  const velho = (m: M, tarefa = "t1", nome = "antigo.png") => {
    m.t.arquivos.push({ id: `antigo-${nome}`, tarefa_id: tarefa, caminho: `tarefas/${tarefa}/_${nome}`, nome, tipo: "imagem", tamanho: 3, papel: "anexo" });
  };
  it("3 alto: a limpeza dos 7 dias NUNCA toca anexo antigo do Supabase (sem drive_id); só o do Drive e a pasta do conteúdo", async () => {
    const m = montar();
    Object.assign(m.t.tarefas[0], { etapa: "postado" });
    velho(m);
    await anexar(m);
    expect((await m.campainha({ acao: "limpar", tarefa_id: "t1" })).status).toBe(200);
    expect(m.t.arquivos.map((a) => a.id)).toEqual(["antigo-antigo.png"]); // o antigo ficou
    expect(m.b.estado.objetosRemovidos).toEqual([]); // nada saiu do balde do Storage
    expect(m.t.arquivos.some((a) => a.drive_id)).toBe(false);
  });
  it("3 alto: card Postado só com anexo antigo: a limpeza não apaga nada (nem se alguém a chamar)", async () => {
    const m = montar();
    Object.assign(m.t.tarefas[0], { etapa: "postado" });
    velho(m);
    expect((await m.campainha({ acao: "limpar", tarefa_id: "t1" })).status).toBe(200);
    expect(m.t.arquivos).toHaveLength(1);
    expect(m.b.estado.objetosRemovidos).toEqual([]);
  });
  it("3 alto: apagar o card DE PROPÓSITO continua levando os anexos antigos também (nada órfão)", async () => {
    const m = montar();
    velho(m);
    await anexar(m);
    expect((await m.chamar({ acao: "apagar_tarefa", tarefa_id: "t1" })).status).toBe(200);
    expect(m.t.arquivos).toHaveLength(0);
    expect(m.b.estado.objetosRemovidos).toEqual(["tarefas/t1/_antigo.png"]);
  });
  it("5 médio: renomear tema com mais de 40 pastas TERMINA (cursor): 1ª leva 40, a 2ª continua de onde parou", async () => {
    const m = montar();
    const tema = await criarTema(m, "Natal");
    for (let i = 1; i <= 45; i++) {
      const id = `c${String(i).padStart(2, "0")}`;
      m.t.tarefas.push({ id, titulo: `Card ${i}`, empresa_id: "you", ocasiao_id: tema.id, etapa: "edicao", formato: "post" });
      await anexar(m, videoFalso(2), id, `a${i}.mp4`);
    }
    m.t.tarefas.push({ id: "sem-pasta", titulo: "Sem arquivo", empresa_id: "you", ocasiao_id: tema.id, etapa: "edicao", formato: "post" }); // não tem pasta: não conta
    const velhos = () => m.arvore().filter((p) => p.includes("Post Natal - ")).length;
    expect(velhos()).toBe(45);
    const um = await lerJson(await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: tema.id, nome: "Natal 2026" }));
    expect(um.restantes).toBe(5);
    expect(um.cursor).toBe("c40");
    expect(velhos()).toBe(5); // 40 já com o nome novo
    const dois = await lerJson(await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: tema.id, nome: "Natal 2026", cursor: um.cursor }));
    expect(dois.restantes).toBe(0);
    expect(dois.cursor).toBeUndefined();
    expect(velhos()).toBe(0);
    expect(m.arvore().filter((p) => p.includes("Post Natal 2026 - "))).toHaveLength(45);
  });
  it("5 médio: com 42 pastas bastam 2 chamadas seguindo o cursor (é o que a camada de dados repete)", async () => {
    const m = montar();
    const tema = await criarTema(m, "Natal");
    for (let i = 1; i <= 42; i++) {
      const id = `d${String(i).padStart(2, "0")}`;
      m.t.tarefas.push({ id, titulo: `Card ${i}`, empresa_id: "you", ocasiao_id: tema.id, etapa: "edicao", formato: "post" });
      await anexar(m, videoFalso(2), id, `a${i}.mp4`);
    }
    let cursor: string | undefined, voltas = 0;
    do {
      const r = await lerJson(await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: tema.id, nome: "Novo", ...(cursor ? { cursor } : {}) }));
      cursor = r.cursor; voltas++;
    } while (cursor && voltas < 5);
    expect(voltas).toBe(2);
    expect(m.arvore().filter((p) => p.includes("Post Novo - "))).toHaveLength(42);
  });
  it("B2 (pente fino r1, decisão do Natham): só Natham e Matheus criam e renomeiam Tema; Adrian é recusado e nada muda", async () => {
    const m = montar();
    const r = await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: "Escondido", permanente: true }, "tok-adrian");
    expect(r.status).toBe(403);
    expect((await lerJson(r)).erro).toBe("Só o Natham ou o Matheus criam e renomeiam temas.");
    expect((await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: "Comum" }, "tok-adrian")).status).toBe(403);
    expect(m.t.ocasioes).toHaveLength(0);
    const tema = await criarTema(m, "Do Matheus", { permanente: true }, "tok-matheus");
    expect(tema.permanente).toBe(true);
    expect((await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: tema.id, nome: "Outro" }, "tok-adrian")).status).toBe(403);
    expect(m.t.ocasioes[0].nome).toBe("Do Matheus");
  });
  it("6 médio: documento solto só para Natham e Matheus (Adrian com login é recusado)", async () => {
    const m = montar();
    const r = await m.chamar({ acao: "sessao_envio_pasta", empresa_id: "you", nome: "a.pdf", tipo: "documento", mime: "application/pdf", tamanho: 4 }, "tok-adrian");
    expect(r.status).toBe(403);
  });
});

describe("238: limpeza dos 7 dias e ligar o Permanente não correm um contra o outro", () => {
  it("6 alto: Permanente ligado ANTES: a limpeza não começa, não apaga nada e desarma o alarme", async () => {
    const m = montar();
    const tema = await criarTema(m, "Reunião");
    Object.assign(m.t.tarefas[0], { etapa: "postado", ocasiao_id: tema.id });
    await anexar(m);
    expect((await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: true })).status).toBe(200);
    const r = await lerJson(await m.campainha({ acao: "limpar", tarefa_id: "t1" }));
    expect(r.permanente).toBe(true);
    expect(m.t.arquivos).toHaveLength(1);
    expect(m.alarmes).toEqual([{ tipo: "desarmar", tarefa: "t1" }]);
  });
  it("6 alto: limpeza COMEÇOU antes: ligar o Permanente espera (409 em português) e a limpeza termina; depois liga", async () => {
    const m = montar();
    const tema = await criarTema(m, "Comum");
    Object.assign(m.t.tarefas[0], { etapa: "postado", ocasiao_id: tema.id });
    await anexar(m);
    expect((await m.campainha({ acao: "limpar", tarefa_id: "t1" })).status).toBe(200); // o banco marcou "limpando" ao começar
    const r = await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: true });
    expect(r.status).toBe(409);
    expect((await lerJson(r)).erro).toBe("Este tema está sendo limpo agora. Tente de novo em alguns minutos.");
    expect(m.t.ocasioes[0].permanente).toBe(false);
    expect(m.t.arquivos).toHaveLength(0);
    m.t.ocasioes[0].limpando = false; // passados os 10 minutos
    expect((await m.chamar({ acao: "permanente_ocasiao", ocasiao_id: tema.id, ligado: true })).status).toBe(200);
  });
  it("card sem tema: a limpeza não pergunta nada ao banco sobre tema (sempre pode)", async () => {
    const m = montar();
    Object.assign(m.t.tarefas[0], { etapa: "postado" });
    await anexar(m);
    expect((await m.campainha({ acao: "limpar", tarefa_id: "t1" })).status).toBe(200);
    expect(m.b.estado.chamadasRpc.some((c) => c.nome === "iniciar_limpeza_tema")).toBe(false);
  });
});
