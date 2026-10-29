// Marca no BANCO de "vídeo novo pendente" (Lupa re-revisão 1 e 2, achado 5; SQL 027, passo 8). Enquanto vale, o banco não deixa
// "Postar agora", "Tentar de novo" nem o alarme da hora marcada postarem o vídeo antigo (qualquer aba, qualquer pessoa).
// Falha do envio NÃO tira a marca; só o vídeo novo chegando ou "Postar com o vídeo atual" tiram. Antes de colar o 027 as funções não existem:
// isso conta como "sem marca" e o app segue como antes (a trava só da aba da ficha continua valendo).
import { supabase } from "@/lib/supabase/cliente";
import { funcaoAusente } from "./repositorio";

/** Devolve o texto do erro (para a tela mostrar) ou null se deu certo / a função ainda não existe. */
async function chamar(funcao: "marcar_video_pendente" | "liberar_video_pendente", tarefaId: string, envio?: string): Promise<string | null> {
  try {
    let { error } = await supabase().rpc(funcao, { p_tarefa: tarefaId, ...(envio && { p_envio: envio }) });
    // r3 A7: sem o 038, a função não tem p_envio e a API não a acha com ele: marca do jeito de antes (sem a lista de envios do card)
    if (envio && funcaoAusente(error)) ({ error } = await supabase().rpc(funcao, { p_tarefa: tarefaId }));
    if (!error || funcaoAusente(error)) return null;
    return error.code === "42501" ? "Você não pode mexer neste card." : "O banco não confirmou. Tente de novo.";
  } catch { return "Sem conexão com o banco. Tente de novo."; }
}

/** Marca o card como "vídeo novo pendente" e só devolve null quando o banco confirmou: o envio só começa depois disso.
    r3 A7 (038): `envio` = id do envio na fila; o banco guarda a lista dos envios do card e só tira a marca quando o ÚLTIMO chega. */
export const marcarPendente = (tarefaId: string, envio?: string) => chamar("marcar_video_pendente", tarefaId, envio);
/** "Postar com o vídeo atual": quem aprova desiste do vídeo novo e libera a postagem. */
export const liberarPendente = (tarefaId: string) => chamar("liberar_video_pendente", tarefaId);

/** O banco diz que este card espera um vídeo novo? Erro (função ainda não colada) conta como "não". */
export const videoPendente = async (tarefaId: string): Promise<boolean> => {
  try { const { data } = await supabase().rpc("video_pendente", { p_tarefa: tarefaId }); return data === true; } catch { return false; }
};
