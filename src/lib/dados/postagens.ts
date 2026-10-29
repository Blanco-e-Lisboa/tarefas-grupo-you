// Leitura da postagem automática (196): o que a função postar-meta gravou por card e por rede (tabela postagens, 019). Só leitura.
import type { supabase } from "@/lib/supabase/cliente";
import type { Postagem, Tarefa } from "./tipos";
import { horaDeBrasilia } from "./agenda";

/** O que se grava em postar_redes: carrossel com vídeo só vai para o Instagram (o Facebook não mistura foto e vídeo num post;
    gravado com o Facebook, ele vira erro definitivo e o card fica preso em Aprovado: achado 3 da Lupa no Correio). Conta também o
    vídeo que está subindo neste salvar. Nunca troca a rede sozinho (decisão do Maestro, re-revisão da Lupa): com Instagram + Facebook
    tira só o Facebook (o card avisa); só Facebook fica como está, e o card mostra "Precisa de ajuste" e não posta. */
export const redesQueValem = (t: Pick<Tarefa, "formato" | "arquivos" | "postarRedes">): Tarefa["postarRedes"] =>
  carrosselComVideoGuardado(t) && (t.postarRedes ?? ["instagram", "facebook"]).includes("instagram") ? ["instagram"] : t.postarRedes;
/** Carrossel com vídeo marcado só para o Facebook (já depois de redesQueValem): não pode ficar programado. O salvar tira o postar_em
    (o banco desarma o alarme) e a ficha mostra "Programação cancelada" com as redes e a data para programar de novo (achado 6, 3ª volta da Lupa). */
export const soFacebookComVideo = (t: Pick<Tarefa, "formato" | "arquivos" | "postarRedes">) =>
  carrosselComVideoGuardado(t) && !(t.postarRedes ?? ["instagram", "facebook"]).includes("instagram");
/** postar_em que o salvar grava: só em Aprovado/Postado, e nunca num Aprovado que ficou só Facebook com vídeo. */
export const postarEmQueVale = (t: Pick<Tarefa, "etapa" | "postarEm" | "formato" | "arquivos" | "postarRedes">) =>
  t.etapa === "postado" || (t.etapa === "aprovado" && !soFacebookComVideo(t)) ? t.postarEm : undefined;
/** Carrossel com vídeo (o que já subiu e o que está subindo; capa e arquivo já limpo não contam). */
export const carrosselComVideoGuardado = (t: Pick<Tarefa, "formato" | "arquivos">) =>
  t.formato === "carrossel" && t.arquivos.some((a) => a.papel !== "capa" && a.papel !== "original" && !a.removido && a.tipo === "video");

/** Rede ESCOLHIDA na fila, enviando ou processando, com o card ainda em Aprovado. Linha de rede tirada do card não conta (achado b da Lupa):
    sem isso uma linha velha em "fila" fazia a tela recarregar a cada 15 s para sempre. Status desconhecido também não conta. */
export const postando = (t: Tarefa, agora = new Date()) => t.etapa === "aprovado" && !!t.postagens?.some((p) =>
  (t.postarRedes ?? ["instagram", "facebook"]).includes(p.rede) && (p.status === "enviando" || p.status === "processando"
    // r2 B1 (037): "fila" com a data do post ainda por vir espera a hora marcada (tentar de novo com data futura): não é postando, e a tela não fica relendo
    || (p.status === "fila" && !(t.postarEm && t.postarEm > horaDeBrasilia(agora.toISOString())))));

type LinhaPostagem = { tarefa_id: string; rede: Postagem["rede"]; status: Postagem["status"]; link: string | null; erro: string | null; postado_em: string | null };
/** Resultado da postagem automática por card. Antes do 019 a tabela não existe: segue sem nada (não derruba a carga). */
export async function carregarPostagens(sb: ReturnType<typeof supabase>): Promise<Map<string, Postagem[]>> {
  const porTarefa = new Map<string, Postagem[]>();
  const { data, error } = await sb.from("postagens").select("tarefa_id, rede, status, link, erro, postado_em");
  if (error || !data) return porTarefa;
  for (const l of data as LinhaPostagem[]) {
    porTarefa.set(l.tarefa_id, [...(porTarefa.get(l.tarefa_id) ?? []), { rede: l.rede, status: l.status, link: l.link ?? undefined, erro: l.erro ?? undefined, postadoEm: l.postado_em ?? undefined }]);
  }
  return porTarefa;
}
