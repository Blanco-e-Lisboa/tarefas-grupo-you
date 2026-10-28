import { supabase } from "@/lib/supabase/cliente";
import { falhou, motivoDoBanco, recarregarTarefas } from "./repositorio";

/** 031 · Tarefa enviada: quem recebeu só marca e desmarca "feita" (o resto segue só leitura). O banco troca só a coluna concluida.
    Fora do repositorio.ts porque ele está no limite de linhas; por isso não é otimista: a tela muda quando o banco confirma. */
export async function marcarFeita(id: string, feita: boolean) {
  const { error } = await supabase().rpc("marcar_feita", { p_tarefa: id, p_feita: feita });
  if (error) falhou(motivoDoBanco(error, "Não consegui marcar a tarefa. Tente de novo."));
  else await recarregarTarefas();
}
