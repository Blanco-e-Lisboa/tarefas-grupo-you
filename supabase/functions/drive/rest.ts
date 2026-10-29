// Cliente mínimo do banco por `fetch` (PostgREST). Dois sabores: com a chave do usuário (as travas do banco valem) e com a de serviço.
type Busca = typeof fetch;
export type Linha = Record<string, unknown>;

export class ErroRest extends Error {
  constructor(public status: number, public codigo?: string) {
    super(`banco ${status}${codigo ? ` ${codigo}` : ""}`);
  }
}
/** Para `.catch` de rpc: função que o banco ainda não tem (SQL novo não colado, PGRST202) vira `undefined`; o resto sobe. */
export const semFuncao = (e: unknown): undefined => {
  if (e instanceof ErroRest && e.codigo === "PGRST202") return undefined;
  throw e;
};

export type Rest = ReturnType<typeof criarRest>;

export function criarRest(base: string, apikey: string, bearer: string, buscar: Busca = (...a) => fetch(...a)) {
  const cab = (extra: Record<string, string> = {}) => ({ apikey, authorization: `Bearer ${bearer}`, "content-type": "application/json", ...extra });
  const filtros = (f: Record<string, string>) => Object.entries(f).map(([k, v]) => `${encodeURIComponent(k)}=eq.${encodeURIComponent(v)}`);
  async function pedir<T>(url: string, init: RequestInit): Promise<T> {
    const r = await buscar(`${base}/rest/v1/${url}`, init);
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { code?: string };
      throw new ErroRest(r.status, j.code);
    }
    const t = await r.text();
    return (t ? JSON.parse(t) : null) as T;
  }
  return {
    ler: <T = Linha>(tabela: string, f: Record<string, string>, colunas = "*") => pedir<T[]>(`${tabela}?${["select=" + colunas, ...filtros(f)].join("&")}`, { headers: cab() }),
    /** ignorarDuplicata: devolve [] em vez de erro quando a chave única já existe (quem perdeu a corrida). */
    inserir: <T = Linha>(tabela: string, linha: Linha, ignorarDuplicata?: string) =>
      pedir<T[]>(`${tabela}${ignorarDuplicata ? `?on_conflict=${ignorarDuplicata}` : ""}`, {
        method: "POST", headers: cab({ prefer: `return=representation${ignorarDuplicata ? ",resolution=ignore-duplicates" : ""}` }), body: JSON.stringify(linha),
      }),
    atualizar: <T = Linha>(tabela: string, f: Record<string, string>, campos: Linha) =>
      pedir<T[]>(`${tabela}?${filtros(f).join("&")}`, { method: "PATCH", headers: cab({ prefer: "return=representation" }), body: JSON.stringify(campos) }),
    apagar: <T = Linha>(tabela: string, f: Record<string, string>) =>
      pedir<T[]>(`${tabela}?${filtros(f).join("&")}`, { method: "DELETE", headers: cab({ prefer: "return=representation" }) }),
    rpc: <T = unknown>(nome: string, args: Linha = {}) => pedir<T>(`rpc/${nome}`, { method: "POST", headers: cab(), body: JSON.stringify(args) }),
    /** Tira objetos do balde de arquivos do Storage. */
    async removerObjetos(balde: string, caminhos: string[]) {
      if (!caminhos.length) return;
      const r = await buscar(`${base}/storage/v1/object/${balde}`, { method: "DELETE", headers: cab(), body: JSON.stringify({ prefixes: caminhos }) });
      if (!r.ok) throw new ErroRest(r.status);
    },
  };
}
