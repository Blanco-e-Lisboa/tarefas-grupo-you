// O que a postar-meta lê e grava no banco, sempre com a chave de serviço (a tela só lê `postagens`).
import { criarRest } from "../drive/rest.ts";

type Busca = typeof fetch;
export type Rede = "instagram" | "facebook";
export type Linha = { id: string; tarefa_id: string; rede: Rede; status: string; conteiner_id: string | null; tentativas: number; rodadas: number; link?: string | null };
export type Card = { id: string; titulo: string; legenda: string | null; formato: string | null; postar_redes: Rede[]; capa_quadro_ms: number | null };
export type Arq = { id: string; nome: string; tipo: string; drive_id: string | null; caminho: string | null; tamanho: number; ordem: number; papel: string };

export type Banco = ReturnType<typeof criarBanco>;

export function criarBanco(env: (n: string) => string | undefined, buscar: Busca) {
  const url = env("SUPABASE_URL")!;
  const chave = env("SUPABASE_SERVICE_ROLE_KEY")!;
  const rest = criarRest(url, chave, chave, buscar);
  async function storage(caminho: string, init: RequestInit = {}) {
    const r = await buscar(`${url}/storage/v1/${caminho}`, { ...init, headers: { apikey: chave, authorization: `Bearer ${chave}`, ...init.headers } });
    if (!r.ok) throw new Error(`Storage recusou (${r.status})`);
    return r;
  }
  const rpc = <T = unknown>(nome: string, args: Record<string, unknown>) => rest.rpc<T>(nome, args);

  return {
    /** A catraca (019): devolve só as linhas que ESTA execução pegou. */
    pegar: async (tarefa: string) => (await rpc<Linha[] | null>("pegar_postagens", { p_tarefa: tarefa })) ?? [],
    card: async (tarefa: string) =>
      (await rest.ler<Card>("tarefas", { id: tarefa }, "id,titulo,legenda,formato,postar_redes,capa_quadro_ms"))[0],
    arquivos: async (tarefa: string) =>
      (await rest.ler<Arq>("arquivos", { tarefa_id: tarefa }, "id,nome,tipo,drive_id,caminho,tamanho,ordem,papel")).sort((a, b) => a.ordem - b.ordem),
    arquivo: async (id: string) => (await rest.ler<Arq>("arquivos", { id }, "id,nome,tipo,drive_id,caminho,tamanho,ordem,papel"))[0],
    gravar: (id: string, campos: Record<string, unknown>) => rest.atualizar("postagens", { id }, campos),
    redes: (tarefa: string) => rest.ler<{ rede: Rede; status: string; link: string | null }>("postagens", { tarefa_id: tarefa }, "rede,status,link"),
    /** Só move se ainda está em Aprovado; o banco arma a limpeza de 7 dias e desarma o alarme de postar. */
    moverParaPostado: (tarefa: string) => rest.atualizar("tarefas", { id: tarefa, etapa: "aprovado" }, { etapa: "postado" }),
    armar: (tarefa: string, minutos: number) => rpc("armar_alarme_servico", { p_tipo: "postar", p_tarefa: tarefa, p_minutos: minutos }),
    desarmar: (tarefa: string) => rpc("desarmar_alarme_servico", { p_tipo: "postar", p_tarefa: tarefa }),
    segredo: (nome: string) => rpc<string | null>("ler_segredo_servico", { p_nome: nome }),
    /** Imagem do card que está no Supabase (card antigo, antes do Drive). */
    baixarDoSupabase: async (caminho: string) => new Uint8Array(await (await storage(`object/arquivos/${caminho}`)).arrayBuffer()),
    /** Cópia de minutos no balde privado `postagens` + convite de 1 h para a Meta baixar. */
    async guardarParaMeta(caminho: string, bytes: Uint8Array, tipo: string): Promise<string> {
      await storage(`object/postagens/${caminho}`, { method: "POST", headers: { "content-type": tipo, "x-upsert": "true" }, body: bytes as BodyInit });
      const r = await storage(`object/sign/postagens/${caminho}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
      return `${url}/storage/v1${((await r.json()) as { signedURL: string }).signedURL}`;
    },
    apagarCopias: (caminhos: string[]) => rest.removerObjetos("postagens", caminhos),
  };
}
