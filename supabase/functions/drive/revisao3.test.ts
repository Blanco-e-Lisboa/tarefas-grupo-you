// Item 214 (achado 3 do Drive): o envio é do card para o qual a sessão foi aberta. Cada teste FALHA no código antigo.
import { describe, expect, it } from "vitest";
import { BASE_FALSA, criarGoogleFalso, videoFalso } from "../_shared/google-falso.ts";
import { criarGoogle } from "../_shared/google.ts";
import { criarManipulador } from "./acoes.ts";
import { criarDriveApi } from "./drive-api.ts";
import { criarBancoFalso, URL_FALSA } from "./supabase-falso.ts";

const ENV: Record<string, string> = { SUPABASE_URL: URL_FALSA, SUPABASE_ANON_KEY: "chave-anon-falsa", SUPABASE_SERVICE_ROLE_KEY: "chave-servico-falsa", GOOGLE_API_BASE: BASE_FALSA, GOOGLE_TOKEN_BASE: BASE_FALSA, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "seg" };
const env = (n: string) => ENV[n];

function montar() {
  const g = criarGoogleFalso();
  const b = criarBancoFalso();
  const base = ((e: RequestInfo | URL, i?: RequestInit) => (new Request(e).url.startsWith(BASE_FALSA) ? g.fetch(e, i) : b.fetch(e, i))) as typeof fetch;
  b.estado.tabelas.pessoas.push({ id: "p-n", slug: "natham", user_id: "u-n" });
  b.estado.tabelas.empresas.push({ id: "you", nome: "You" }, { id: "beec", nome: "Beec" });
  b.estado.usuarios.set("tok-n", "u-n");
  b.estado.rpcs.ler_segredo_servico = ({ p_nome }) => (p_nome === "tarefas_funcoes_segredo" ? "campainha" : "refresh-falso");
  b.estado.rpcs.pode_mexer_anexos = () => true;
  b.estado.rpcs.pode_mexer_pastas = () => true; // B2: criar e renomear Tema perguntam ao banco
  b.estado.tabelas.tarefas.push(
    { id: "A", titulo: "Card A", empresa_id: "you", ocasiao_id: null, etapa: "edicao" },
    { id: "B", titulo: "Card B", empresa_id: "you", ocasiao_id: null, etapa: "edicao" },
    { id: "C", titulo: "Card C", empresa_id: "beec", ocasiao_id: null, etapa: "edicao" },
  );
  const google = criarGoogle({ env, fetch: base });
  const tratar = criarManipulador({ env, fetch: base, api: criarDriveApi({ api: BASE_FALSA, token: google.tokenGoogle, fetch: base }), baixar: google.baixarDoDrive });
  const chamar = (corpo: object) => tratar(new Request("https://f", { method: "POST", headers: { authorization: "Bearer tok-n", origin: "https://app" }, body: JSON.stringify(corpo) }));
  /** Abre a sessão para o card `para`, sobe 4 bytes e devolve o id do arquivo no Drive. */
  const enviar = async (para: string) => {
    const s = (await (await chamar({ acao: "sessao_envio", tarefa_id: para, nome: "a.mp4", tipo: "video", mime: "video/mp4", tamanho: 4, papel: "anexo" })).json()) as { sessao_url: string };
    return ((await (await g.fetch(s.sessao_url, { method: "PUT", headers: { "content-range": "bytes 0-3/4" }, body: videoFalso(4) })).json()) as { id: string }).id;
  };
  const confirmar = (card: string, driveId: string) => chamar({ acao: "confirmar_envio", tarefa_id: card, drive_id: driveId, nome: "a.mp4", tipo: "video", tamanho: 4, papel: "anexo", ordem: 0 });
  return { g, b, enviar, confirmar };
}

describe("214: confirmar_envio só aceita o card para o qual a sessão foi aberta", () => {
  it("envio do card A confirmado no card A: aceito", async () => {
    const m = montar();
    const id = await m.enviar("A");
    expect((await m.confirmar("A", id)).status).toBe(200);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(1);
  });

  it("envio do card A confirmado no card B (mesma empresa): recusado, nada movido nem registrado", async () => {
    const m = montar();
    const id = await m.enviar("A");
    const antes = [...m.g.estado.arquivos.get(id)!.parents];
    const r = await m.confirmar("B", id);
    expect(r.status).toBe(422);
    expect(m.g.estado.arquivos.get(id)!.parents).toEqual(antes);
    expect(m.g.estado.arquivos.get(id)!.trashed).toBe(false);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
  });

  it("recusa no card B não cria ocasião, pasta no Drive nem vínculo: card B intacto", async () => {
    const m = montar();
    const id = await m.enviar("A");
    const pastas = () => [...m.g.estado.arquivos.values()].filter((a) => a.folder).length;
    const [ocasioes, drivePastas, nPastas] = [m.b.estado.tabelas.ocasioes.length, JSON.stringify(m.b.estado.tabelas.drive_pastas), pastas()];
    const cardB = JSON.stringify(m.b.estado.tabelas.tarefas.find((t) => t.id === "B"));
    expect((await m.confirmar("B", id)).status).toBe(422);
    expect(m.b.estado.tabelas.ocasioes).toHaveLength(ocasioes);
    expect(JSON.stringify(m.b.estado.tabelas.drive_pastas)).toBe(drivePastas);
    expect(pastas()).toBe(nPastas);
    expect(JSON.stringify(m.b.estado.tabelas.tarefas.find((t) => t.id === "B"))).toBe(cardB);
  });

  it("envio do card A confirmado no card C (outra empresa): recusado, nada movido nem registrado", async () => {
    const m = montar();
    const id = await m.enviar("A");
    const antes = [...m.g.estado.arquivos.get(id)!.parents];
    const r = await m.confirmar("C", id);
    expect(r.status).toBe(422);
    expect(m.g.estado.arquivos.get(id)!.parents).toEqual(antes);
    expect(m.b.estado.tabelas.arquivos).toHaveLength(0);
  });
});
