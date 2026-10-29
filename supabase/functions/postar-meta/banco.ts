// O que a postar-meta lê e grava no banco, sempre com a chave de serviço (a tela só lê `postagens`).
import { criarRest, semFuncao } from "../drive/rest.ts";

type Busca = typeof fetch;
export type Rede = "instagram" | "facebook";
export type Linha = { id: string; tarefa_id: string; rede: Rede; status: string; conteiner_id: string | null; tentativas: number; rodadas: number; link?: string | null };
export type Card = { id: string; titulo: string; legenda: string | null; formato: string | null; postar_redes: Rede[]; capa_quadro_ms: number | null };
export type Arq = { id: string; nome: string; tipo: string; drive_id: string | null; caminho: string | null; tamanho: number; ordem: number; papel: string };

export type Banco = ReturnType<typeof criarBanco>;

/** N2 (pente fino r3): impressão digital do que vai para a Meta (legenda, formato, quadro da capa, mídias e capa, na ordem). Guardada junto do rascunho:
    rascunho que ainda não foi pedido para publicar e cujo conteúdo mudou no card é descartado e refeito. FNV-1a de 32 bits: só para comparar, não é segredo. */
export function assinaturaDe(card: Pick<Card, "legenda" | "formato" | "capa_quadro_ms">, arqs: Arq[]): string {
  const texto = JSON.stringify([card.legenda ?? "", card.formato ?? "", card.capa_quadro_ms ?? null,
    arqs.filter((a) => a.papel === "anexo" || a.papel === "capa").map((a) => [a.id, a.drive_id, a.caminho, a.ordem, a.papel])]);
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0");
}

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
  const lerArquivos = async (tarefa: string) =>
    (await rest.ler<Arq>("arquivos", { tarefa_id: tarefa }, "id,nome,tipo,drive_id,caminho,tamanho,ordem,papel")).sort((a, b) => a.ordem - b.ordem);

  return {
    /** A catraca (019): devolve só as linhas que ESTA execução pegou. */
    pegar: async (tarefa: string) => (await rpc<Linha[] | null>("pegar_postagens", { p_tarefa: tarefa })) ?? [],
    card: async (tarefa: string) =>
      (await rest.ler<Card>("tarefas", { id: tarefa }, "id,titulo,legenda,formato,postar_redes,capa_quadro_ms"))[0],
    arquivos: lerArquivos,
    arquivo: async (id: string) => (await rest.ler<Arq>("arquivos", { id }, "id,nome,tipo,drive_id,caminho,tamanho,ordem,papel"))[0],
    gravar: (id: string, campos: Record<string, unknown>) => rest.atualizar("postagens", { id }, campos),
    /** A5: postagem cancelada antes de publicar (nada saiu): a linha sai, e a próxima programação começa do zero. */
    apagarLinha: (id: string) => rest.apagar("postagens", { id }),
    /** A5: o card ainda deve sair AGORA? As mesmas condições da catraca (019/027), lidas na hora de publicar.
        N1 (r3): `rede` ainda escolhida no card. N2 (r3): `assinatura` = o conteúdo do card ainda é o do rascunho (legenda, mídias e capa não mudaram). */
    async aindaVale(tarefa: string, agora: number, rede?: Rede, assinatura?: string): Promise<boolean> {
      const [t] = await rest.ler<{ etapa: string | null; tipo: string; empresa_id: string | null; postar_em: string | null; video_pendente_desde: string | null } & Pick<Card, "postar_redes" | "legenda" | "formato" | "capa_quadro_ms">>(
        "tarefas", { id: tarefa }, "etapa,tipo,empresa_id,postar_em,video_pendente_desde,postar_redes,legenda,formato,capa_quadro_ms");
      const brasilia = new Date(agora - 3 * 3600_000).toISOString().slice(0, 16); // shortcut: UTC-3 fixo (sem horário de verão desde 2019); se voltar, usar Intl
      if (!t || t.etapa !== "aprovado" || t.tipo !== "postagem" || t.empresa_id !== "you" || t.video_pendente_desde || !t.postar_em || t.postar_em > brasilia) return false;
      if (rede && !(t.postar_redes ?? []).includes(rede)) return false;
      return !assinatura || assinaturaDe(t, await lerArquivos(tarefa)) === assinatura;
    },
    redes: (tarefa: string) => rest.ler<{ rede: Rede; status: string; link: string | null }>("postagens", { tarefa_id: tarefa }, "rede,status,link"),
    /** Só move se ainda está em Aprovado; o banco arma a limpeza de 7 dias e desarma o alarme de postar. */
    moverParaPostado: (tarefa: string) => rest.atualizar("tarefas", { id: tarefa, etapa: "aprovado" }, { etapa: "postado" }),
    /** Novo 1 (r4, SQL 039): move para Postado só se TODA rede escolhida AGORA já saiu, numa gravação só. `undefined` = banco sem o 039. */
    concluir: (tarefa: string) => rpc<"postado" | "falta" | "espera">("concluir_postagem", { p_tarefa: tarefa }).catch(semFuncao),
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
