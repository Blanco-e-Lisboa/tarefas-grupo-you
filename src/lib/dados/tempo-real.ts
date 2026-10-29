// Tempo real (item 274): quando alguém muda algo, `aoMudar` roda e a tela relê o dado, sem recarregar a página.
// Analogia: um sino na porta do banco. Ele não carrega conteúdo nenhum, só diz "algo daquele assunto mudou"; a tela vai olhar de novo
// pela porta de sempre, onde as travas (RLS) decidem o que cada um vê.
// Escuta SÓ a tabela de avisos `aviso_mudanca` (028), e só inclusão e alteração. Nunca as tabelas de verdade: o Realtime não aplica a trava
// de leitura nas EXCLUSÕES, então publicar caderno, agenda ou cards privados deixaria vazar que alguém apagou algo (achado 1 da Lupa).
// Antes do SQL 028 colado, a tabela não existe e nada acontece: o resto da tela segue igual (volta à aba, intervalo etc.).
import { supabase } from "@/lib/supabase/cliente";

/** Chaves de aviso que cada tela quer ouvir (a chave é o começo do texto: "cartao:" pega "cartao:<pessoa>"). */
export const AVISOS = {
  esteira: ["esteira", "cartao:"], agenda: ["agenda:", "acesso:"], feitos: ["feitos:"], ideias: ["ideias"], pastas: ["pastas"], caderno: ["caderno:"],
} as const;

let ligacoes = 0;
/** Liga um canal nos avisos de `chaves`; vários avisos seguidos viram uma só chamada de `aoMudar`. Devolve a função que desliga (chame ao sair da tela). */
export function ligarTempoReal(nome: string, chaves: readonly string[], aoMudar: () => void, espera = 300): () => void {
  if (typeof window === "undefined") return () => {};
  let atraso: ReturnType<typeof setTimeout> | undefined;
  const ouvir = (p: { new?: { chave?: string } }) => {
    if (!chaves.some((c) => p.new?.chave?.startsWith(c))) return;
    clearTimeout(atraso);
    atraso = setTimeout(() => { if (!document.hidden) aoMudar(); }, espera);
  };
  try {
    const sb = supabase();
    const filtro = { schema: "public", table: "aviso_mudanca" } as const;
    // M5: nome único por ligação. Com o mesmo nome, o cliente devolve o canal anterior que ainda está saindo (removeChannel é assíncrono) e a tela nova fica surda.
    const canal = sb.channel(`tempo-real:${nome}:${++ligacoes}`).on("postgres_changes", { event: "INSERT", ...filtro }, ouvir).on("postgres_changes", { event: "UPDATE", ...filtro }, ouvir);
    canal.subscribe(); // falha de conexão ou tabela ainda não criada: sem aviso, a tela só não recebe eventos
    return () => { clearTimeout(atraso); void sb.removeChannel(canal); };
  } catch {
    return () => {};
  }
}
