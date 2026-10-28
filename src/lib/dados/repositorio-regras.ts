// Regras puras do repositório (sem banco, sem estado): quem pode mexer, o que vai para o banco. Separadas para o repositorio.ts caber no limite de linhas.
import type { Fazendo, Responsavel, Tarefa } from "./tipos";

/** Cada pessoa tem no máximo uma tarefa: tira a linha antiga de `quem` e, se `tarefaId`, põe a nova (começar outra troca sozinho). Se duas pessoas estão na mesma tarefa, o mapa guarda a que começou por último. */
export function trocarFazendo(mapa: Record<string, Fazendo>, quem: Responsavel, tarefaId: string | null, desde = new Date().toISOString()): Record<string, Fazendo> {
  const resto = Object.fromEntries(Object.entries(mapa).filter(([, f]) => f.quem !== quem));
  return tarefaId ? { ...resto, [tarefaId]: { quem, desde } } : resto;
}

/** 238 · O que vai em `ocasiao_id` ao salvar. Com tema: manda. SEM tema mas o card tinha um: manda null (a ficha tirou o Tema, ou mudou de empresa).
    Nunca teve tema: nem manda (a coluna só existe depois do 019). */
export const campoOcasiao = (atual: string | undefined, antes: string | undefined): { ocasiao_id?: string | null } =>
  atual ? { ocasiao_id: atual } : antes ? { ocasiao_id: null } : {};
/** 238 · Quando o card entrou em Postado, do jeito que o gatilho do banco grava: entrar agora = agora; já estava Postado = mantém; saiu = nada.
    Assim o prazo dos 7 dias mostra a data real logo depois de arrastar, sem esperar recarregar. */
export const postadoEmDe = (antes: { etapa?: string; postadoEm?: string } | undefined, etapa: string | undefined, agora = new Date()): string | undefined =>
  etapa !== "postado" ? undefined : antes?.etapa === "postado" && antes.postadoEm ? antes.postadoEm : agora.toISOString();

/** Campos que a pessoa pode mudar depois de criada (dono, criado_por e enviada_por o banco não deixa mudar). */
export const paraBanco = (t: Tarefa, responsavelId: string | undefined) => ({
  titulo: t.titulo, tipo: t.tipo, empresa_id: t.empresaId || null, rede: t.rede ?? null, etapa: t.etapa ?? null,
  responsavel_id: responsavelId, inicio: t.inicio ?? null, fim: t.fim ?? null, dia_inteiro: t.diaInteiro, cor: t.cor,
  concluida: !!t.concluida, objetivo: t.objetivo ?? null, notas: t.notas ?? null, links: t.links, aprovador: t.aprovador ?? null,
});

/** Espelha as travas do banco (009). Tarefa ENVIADA: só quem enviou altera; quem recebeu só lê. Não enviada: o dono, ou qualquer um se for conteúdo com empresa. */
export const podeAlterar = (t: Tarefa, eu: Responsavel | null) =>
  !!eu && (t.enviadaPor ? t.enviadaPor === eu : t.dono === eu || (!!t.etapa && !!t.empresaId));
/** 031 · Marcar "feita": quem pode alterar, e também quem RECEBEU a tarefa enviada (o dono). */
export const podeMarcar = (t: Tarefa, eu: Responsavel | null) => podeAlterar(t, eu) || (!!eu && t.dono === eu);
/** Quem pode APAGAR (019): enviada = quem enviou; não enviada = o dono; e conteúdo com empresa, também o Natham e o Matheus (lixeira e Concluir). */
export const podeApagar = (t: Tarefa, eu: Responsavel | null) =>
  !!eu && ((t.enviadaPor ?? t.dono) === eu || (!!t.etapa && !!t.empresaId && (eu === "natham" || eu === "matheus")));
