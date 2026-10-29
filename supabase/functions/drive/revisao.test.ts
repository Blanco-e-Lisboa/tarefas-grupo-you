// Achados da Lupa #2 sobre a função drive e o envio em partes, cada um com a sua prova (Google falso, banco falso).
import { describe, expect, it } from "vitest";
import { enviarEmPartes } from "../../../src/lib/dados/drive";
import { BASE_FALSA, criarGoogleFalso, videoFalso, fotoFalsa } from "../_shared/google-falso.ts";
import { criarGoogle } from "../_shared/google.ts";
import { criarManipulador } from "./acoes.ts";
import { criarDriveApi } from "./drive-api.ts";
import { criarBancoFalso, URL_FALSA } from "./supabase-falso.ts";

const ENV: Record<string, string> = { SUPABASE_URL: URL_FALSA, SUPABASE_ANON_KEY: "chave-anon-falsa", SUPABASE_SERVICE_ROLE_KEY: "chave-servico-falsa", GOOGLE_API_BASE: BASE_FALSA, GOOGLE_TOKEN_BASE: BASE_FALSA, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "seg" };
const env = (n: string) => ENV[n];
function montar() {
  const g = criarGoogleFalso();
  const b = criarBancoFalso();
  const f = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? g.fetch(e, i) : b.fetch(e, i))) as typeof fetch;
  b.estado.tabelas.pessoas.push({ id: "p-n", slug: "natham", user_id: "u-n" });
  b.estado.tabelas.empresas.push({ id: "you", nome: "You" }, { id: "beec", nome: "Beec" });
  b.estado.usuarios.set("tok-n", "u-n");
  b.estado.rpcs.ler_segredo_servico = ({ p_nome }) => (p_nome === "tarefas_funcoes_segredo" ? "campainha" : "refresh-falso");
  b.estado.rpcs.pode_mexer_anexos = () => true;
  b.estado.rpcs.pode_mexer_pastas = () => true; // B2: criar e renomear Tema perguntam ao banco
  b.estado.tabelas.tarefas.push({ id: "t1", titulo: "Card", empresa_id: "you", ocasiao_id: null, etapa: "edicao" }, { id: "t2", titulo: "Outro", empresa_id: "you", ocasiao_id: null, etapa: "edicao" });
  const google = criarGoogle({ env, fetch: f });
  const tratar = criarManipulador({ env, fetch: f, api: criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: f }), baixar: google.baixarDoDrive });
  const chamar = (corpo: object) => tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify(corpo) }));
  return { g, b, chamar };
}
const sessao = (m: ReturnType<typeof montar>, tarefa = "t1", tamanho = 4) => m.chamar({ acao: "sessao_envio", tarefa_id: tarefa, nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho, papel: "anexo" });
const confirmar = (m: ReturnType<typeof montar>, driveId: string, tamanho = 4, tarefa = "t1") => m.chamar({ acao: "confirmar_envio", tarefa_id: tarefa, drive_id: driveId, nome: "a.mp4", tipo: "video", tamanho, papel: "anexo", ordem: 0 });

describe("achados da Lupa #2", () => {
  it("1: confirmar_envio com ID de pasta/arquivo de outro lugar só recusa; NÃO manda nada para a lixeira", async () => {
    const m = montar();
    await sessao(m);
    const pastaAlheia = [...m.g.estado.arquivos.values()].find((a) => a.folder)!; // a raiz: existe, mas não é arquivo da pasta do card
    const estranho = m.g.estado.semear("alheio.mp4", videoFalso(4), "video/mp4", ["outra-pasta"]);
    expect((await confirmar(m, pastaAlheia.id)).status).toBe(422);
    expect((await confirmar(m, estranho.id)).status).toBe(422);
    expect([...m.g.estado.arquivos.values()].some((a) => a.trashed)).toBe(false);
  });
  it("13: drive_id já registrado em OUTRO card não devolve sucesso", async () => {
    const m = montar();
    const s = (await (await sessao(m)).json()) as { sessao_url: string };
    const id = await enviarEmPartes(s.sessao_url, new Blob([videoFalso(4)]), undefined, m.g.fetch, 4);
    expect((await confirmar(m, id)).status).toBe(200);
    expect((await confirmar(m, id, 4, "t2")).status).toBe(409);
  });
  it("6: falha ao gravar a linha tira o arquivo do Drive (capa repetida não deixa imagem solta)", async () => {
    const m = montar();
    const enviar = async () => {
      const r = await m.chamar({ acao: "sessao_envio", tarefa_id: "t1", nome: "c.png", tipo: "imagem", mime: "image/png", tamanho: 3, papel: "capa" });
      const id = await enviarEmPartes(((await r.json()) as { sessao_url: string }).sessao_url, new Blob([fotoFalsa(3)]), undefined, m.g.fetch, 3);
      return { id, r: await m.chamar({ acao: "confirmar_envio", tarefa_id: "t1", drive_id: id, nome: "c.png", tipo: "imagem", tamanho: 3, papel: "capa", ordem: 0 }) };
    };
    expect((await enviar()).r.status).toBe(200);
    const segunda = await enviar();
    expect(segunda.r.status).toBe(409);
    expect(m.g.estado.arquivos.get(segunda.id)!.trashed).toBe(true);
  });
  it("10: ocasião de outra empresa não recebe anexo do card", async () => {
    const m = montar();
    m.b.estado.tabelas.ocasioes.push({ id: "o-b", empresa_id: "beec", nome: "Da Beec", drive_pasta_id: "pasta-beec" });
    m.b.estado.tabelas.tarefas[0].ocasiao_id = "o-b";
    expect((await sessao(m)).status).toBe(409);
    expect(m.g.estado.sessoes.size).toBe(0);
  });
  it("5: renomear ocasião exige que a trava de leitura do banco enxergue a ocasião", async () => {
    const m = montar();
    const o = (await (await m.chamar({ acao: "criar_ocasiao", empresa_id: "you", nome: "A" })).json()) as { ocasiao: { id: string } };
    m.b.estado.le = (t) => t !== "ocasioes";
    expect((await m.chamar({ acao: "renomear_ocasiao", ocasiao_id: o.ocasiao.id, nome: "B" })).status).toBe(404);
    expect(m.b.estado.tabelas.ocasioes[0].nome).toBe("A");
  });
  it("2: apagar_tarefa com falha no segundo arquivo: o primeiro já saiu do banco e o segundo continua lá (dá para repetir)", async () => {
    const m = montar();
    const a = m.g.estado.semear("a.mp4", videoFalso(2));
    m.g.estado.semear("b.mp4", videoFalso(2));
    m.b.estado.rpcs.pode_apagar_tarefa = () => true;
    m.b.estado.tabelas.arquivos.push({ id: "la", tarefa_id: "t1", drive_id: a.id }, { id: "lb", tarefa_id: "t1", drive_id: "inexistente-erro" });
    // "inexistente-erro" dá 404 no Drive = já apagado: conta como feito; para forçar falha trocamos a rota por 500
    const f500 = ((e: RequestInfo | URL, i?: RequestInit) => (String(e).includes("inexistente-erro") ? Promise.resolve(new Response("{}", { status: 500 })) : m.g.fetch(e, i))) as typeof fetch;
    const f = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? f500(e, i) : m.b.fetch(e, i))) as typeof fetch;
    const google = criarGoogle({ env, fetch: f });
    const tratar = criarManipulador({ env, fetch: f, api: criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: f }), baixar: google.baixarDoDrive });
    const r = await tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n" }, body: JSON.stringify({ acao: "apagar_tarefa", tarefa_id: "t1" }) }));
    expect(r.status).toBe(502);
    expect(m.b.estado.tabelas.arquivos.map((x) => x.id)).toEqual(["lb"]);
    expect(m.g.estado.arquivos.get(a.id)!.trashed).toBe(true);
    expect(m.b.estado.tabelas.tarefas.some((t) => t.id === "t1")).toBe(true);
  });
});

describe("envio em partes: achados 3 e 9", () => {
  it("3: se a última parte chegou mas a resposta se perdeu, a consulta devolve 200 e o id NÃO é jogado fora", async () => {
    const g = criarGoogleFalso();
    const sessaoUrl = (await g.fetch(`${BASE_FALSA}/upload/drive/v3/files?uploadType=resumable`, { method: "POST", headers: { authorization: "Bearer tok-1", "x-upload-content-length": "6", "x-upload-content-type": "video/mp4" }, body: JSON.stringify({ name: "a", parents: [] }) })).headers.get("location")!;
    let perdeu = false;
    const buscar = (async (e: RequestInfo | URL, i?: RequestInit) => {
      const r = await g.fetch(e, i);
      if (!perdeu && i?.method === "PUT" && String((i.headers as Record<string, string>)["content-range"]).startsWith("bytes 3-5")) { perdeu = true; throw new Error("rede caiu"); } // o Drive recebeu, a resposta sumiu
      return r;
    }) as typeof fetch;
    const id = await enviarEmPartes(sessaoUrl, new Blob([videoFalso(6)]), undefined, buscar, 3);
    expect(perdeu).toBe(true);
    expect(g.estado.arquivos.get(id)!.bytes.length).toBe(6);
  });
  it("9: segue o Range devolvido pelo Drive, não o que achou que mandou", async () => {
    const mandou: string[] = [];
    let n = 0;
    const buscar = (async (_e: RequestInfo | URL, i?: RequestInit) => {
      mandou.push(String((i?.headers as Record<string, string>)["content-range"]));
      n++;
      if (n === 1) return new Response(null, { status: 308, headers: { range: "bytes=0-1" } }); // recebeu só 2 dos 4 bytes mandados
      return new Response(JSON.stringify({ id: "pronto" }), { status: 200 });
    }) as typeof fetch;
    expect(await enviarEmPartes("https://sessao", new Blob([new Uint8Array(8)]), undefined, buscar, 4)).toBe("pronto");
    expect(mandou).toEqual(["bytes 0-3/8", "bytes 2-5/8"]);
  });
});
