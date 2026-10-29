// Regras de tela da postagem automática (196). O banco (019) e a função postar-meta conferem de novo; aqui é para mostrar o que falta antes.
import { REDES_POST, horaDeBrasilia, type Formato, type Postagem, type RedePost, type Tarefa } from "@/lib/dados";

export const NOME_REDE: Record<RedePost, string> = { instagram: "Instagram", facebook: "Facebook" };
export const textoRedes = (redes: readonly RedePost[]) => redes.map((r) => NOME_REDE[r]).join(" + ");
/** Ausente no banco = as duas. */
export const redesDe = (t: Pick<Tarefa, "postarRedes">): RedePost[] => t.postarRedes ?? [...REDES_POST];

type Base = Pick<Tarefa, "arquivos" | "legenda" | "empresaId">;
/** 309: a data de postagem de um card Postado, "AAAA-MM-DDTHH:mm" em Brasília: quando entrou em Postado (postadoEm); sem ela (card antigo), a hora agendada. */
export const quandoPostou = (t: Pick<Tarefa, "postadoEm" | "postarEm">): string | undefined => (t.postadoEm ? horaDeBrasilia(t.postadoEm) : undefined) ?? t.postarEm;
/** M18: o banco lê a data do post como hora de Brasília; a ficha confere com Brasília também, seja qual for o relógio do computador. */
export const jaPassou = (quando: string, agora = new Date()) => quando < horaDeBrasilia(agora.toISOString());
export const hojeEmBrasilia = (agora = new Date()) => horaDeBrasilia(agora.toISOString()).slice(0, 10);
/** M1 (decisão do Natham, 29/10): só a You programa postagem. Tu Ecom e Beec publicam à mão e arrastam o card para Postado. */
export const SO_YOU = "Só a You programa postagem. Card da Tu Ecom ou da Beec: publique nas redes você mesmo e arraste o card para Postado.";
export const SO_YOU_CARD = "Só a You programa: publique e arraste para Postado";

/** Só o que já está guardado: arquivo que não subiu (pendente) ou que a limpeza tirou (removido) a função não acha. */
const midias = (t: Pick<Tarefa, "arquivos">) => t.arquivos.filter((a) => a.papel !== "capa" && a.papel !== "original" && !a.pendente && !a.removido && (a.tipo === "imagem" || a.tipo === "video"));

/** Carrossel com vídeo só vai para o Instagram: o Facebook não mistura foto e vídeo num post. */
export const carrosselComVideo = (t: Pick<Tarefa, "arquivos">, formato?: Formato) => formato === "carrossel" && midias(t).some((a) => a.tipo === "video");
/** Nunca troca a rede sozinho (decisão do Maestro, re-revisão da Lupa): com Instagram + Facebook tira só o Facebook (o card avisa);
    só Facebook fica só Facebook, e a checagem barra (SO_FACEBOOK). */
export const redesValidas = (t: Pick<Tarefa, "arquivos">, formato: Formato | undefined, redes: readonly RedePost[]) =>
  carrosselComVideo(t, formato) && redes.includes("instagram") ? ["instagram" as const] : [...redes];
/** 238: com a postagem automática DESLIGADA a ficha não promete post real: sem "Postar agora", "Marcar hora" no lugar de "Programar
    postagem" (a mesma ação: grava a hora), "Hora marcada" no lugar de "Programado" e o aviso de que a publicação é à mão. Ligada: como sempre. */
/** 238: os textos de estado com a postagem automática DESLIGADA: "programado" vira "hora marcada" (ficha e card da Esteira).
    Ligada: o texto como está. */
export function comoHoraMarcada(texto: string, ligada: boolean) {
  if (ligada) return texto;
  return texto
    .replace(/^Programado/, "Hora marcada").replace(/^Sem programação/, "Sem hora marcada").replace(/^Programação cancelada/, "Hora marcada cancelada")
    .replace("programe de novo", "marque a hora de novo").replace("a programação é cancelada", "a hora marcada é cancelada");
}
export const MODO_TESTE = "Modo de teste: cria um rascunho na Meta, não publica.";
/** `teste` (239): ligada MAS a função postar-meta com POSTAR_DE_VERDADE=nao; o aviso e a confirmação do Postar agora dizem que não publica. */
export function textosPublicacao(ligada: boolean, programado: boolean, teste = false) {
  return {
    teste: ligada && teste,
    confirmar: (redes: string, titulo: string) => (ligada && teste
      ? { titulo: `Mandar um rascunho para o ${redes}?`, texto: `"${titulo}": ${MODO_TESTE}`, acao: "Mandar rascunho" }
      : { titulo: `Postar agora no ${redes} da You?`, texto: `"${titulo}" vai para o ar agora. Não dá para desfazer.`, acao: "Postar" }),
    marcar: ligada ? (programado ? "Reprogramar postagem" : "Programar postagem") : programado ? "Remarcar hora" : "Marcar hora",
    postarAgora: ligada,
    situacao: (texto: string) => comoHoraMarcada(texto, ligada),
    aviso: !ligada ? "Postagem automática ainda desligada: na hora marcada o card vira Postado e você publica nas redes." : teste ? MODO_TESTE : undefined,
  };
}
/** r4 F2 (b), decisão do Natham: card com post publicado em TODAS as redes escolhidas não posta de novo (o 039 recusa com esta frase). */
export const JA_POSTADO = "Este card já foi postado. Para postar de novo, duplique o card.";
export const jaPostadoEm = (t: Pick<Tarefa, "postagens">, redes: readonly RedePost[]) =>
  redes.length > 0 && redes.every((r) => t.postagens?.some((p) => p.rede === r && p.status === "postado"));

export const SO_FACEBOOK = "Carrossel com vídeo não vai para o Facebook: acenda o Instagram ou tire o vídeo.";
/** Carrossel com vídeo marcado só para o Facebook: não posta até alguém acender o Instagram ou tirar o vídeo. */
export const carrosselSoFacebook = (t: Pick<Tarefa, "arquivos">, formato: Formato | undefined, redes: readonly RedePost[]) =>
  carrosselComVideo(t, formato) && redes.length > 0 && !redes.includes("instagram");

/** O que falta para programar ou postar agora. Vazio = pode seguir. */
export function faltaParaPostar(t: Base, formato: Formato | undefined, redes: readonly RedePost[]): string[] {
  if (t.empresaId !== "you") return [t.empresaId === "beec" ? "A Beec ainda não está ligada à postagem automática." : "Só a You está ligada à postagem automática."];
  const falta: string[] = [];
  if (!formato) falta.push("Escolha o formato.");
  if (!redes.length) falta.push("Escolha ao menos uma rede.");
  if (carrosselSoFacebook(t, formato, redes)) falta.push(SO_FACEBOOK);
  if (formato && formato !== "story" && !t.legenda?.trim()) falta.push("Falta a descrição do post: escreva na ficha do card.");
  const m = midias(t), videos = m.filter((a) => a.tipo === "video").length;
  if (formato === "post" && (m.length !== 1 || videos)) falta.push("Post leva 1 imagem.");
  if (formato === "reels" && (m.length !== 1 || !videos)) falta.push("Reels leva 1 vídeo.");
  if (formato === "carrossel" && (m.length < 2 || m.length > 10)) falta.push("Carrossel leva de 2 a 10 imagens ou vídeos.");
  if (formato === "story" && m.length !== 1) falta.push("Story leva 1 imagem ou 1 vídeo.");
  return falta;
}

/** Erro em que o post pode ter saído (a função caiu ou a resposta se perdeu). Frases do 019 e do Correio. */
export const INCERTO = /estado incerto|n[aã]o d[aá] para saber/i;
/** A data do post ainda não chegou (em Brasília): a rede na fila espera a hora, não está postando. */
const esperaAHora = (t: Pick<Tarefa, "postarEm">, agora: Date) => !!t.postarEm && !jaPassou(t.postarEm, agora);
const emAndamento = (p: Postagem) => p.status === "fila" || p.status === "enviando" || p.status === "processando";
const quando = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;

export type Situacao =
  | { tipo: "postando" }
  | { tipo: "erro"; texto: string; saiu?: Postagem; refazer: RedePost[]; incerto: boolean }
  | { tipo: "programado"; texto: string };

/** O que o card Aprovado mostra sobre a postagem. Postando vence erro; erro vence a data programada. */
export function situacao(t: Pick<Tarefa, "postagens" | "postarEm" | "postarRedes">, agora = new Date()): Situacao | null {
  const ps = (t.postagens ?? []).filter((p) => redesDe(t).includes(p.rede)); // rede tirada do card não conta (achado b da Lupa)
  // r2 B1 (037): "tentar de novo" com data futura deixa a rede na fila até a hora marcada; isso é Programado, não Postando
  if (ps.some((p) => emAndamento(p) && !(p.status === "fila" && esperaAHora(t, agora)))) return { tipo: "postando" };
  const erros = ps.filter((p) => p.status === "erro");
  if (erros.length) {
    const saiu = ps.find((p) => p.status === "postado");
    const motivo = erros[0].erro ?? "a Meta não disse o motivo";
    const texto = saiu ? `Saiu no ${NOME_REDE[saiu.rede]}, falhou no ${erros.map((p) => NOME_REDE[p.rede]).join(" e ")}: ${motivo}` : `Não postou: ${motivo}`;
    // "estado incerto" (019/postar-meta): a função caiu no meio e não dá para saber se saiu; o Natham confere o perfil antes de tentar de novo.
    return { tipo: "erro", texto, saiu, refazer: erros.map((p) => p.rede), incerto: erros.some((p) => INCERTO.test(p.erro ?? "")) };
  }
  return t.postarEm ? { tipo: "programado", texto: `Programado · ${quando(t.postarEm)} · ${textoRedes(redesDe(t))}` } : null;
}

export const CANCELADA = "Programação cancelada: carrossel com vídeo não vai para o Facebook. Acenda o Instagram ou tire o vídeo e programe de novo.";
/** O salvar tirou a programação (carrossel com vídeo só para o Facebook, achado 6 da Lupa): sem data, e a ficha mostra CANCELADA. */
export const programacaoCancelada = (t: Pick<Tarefa, "arquivos" | "formato" | "postarEm" | "postarRedes" | "programacaoCancelada" | "postagens">) =>
  !t.postarEm && carrosselSoFacebook(t, t.formato, redesDe(t)) && (!!t.programacaoCancelada || !!t.postagens?.length); // nunca programado: só a checagem (achado a da Lupa)

/** A linha única do card Aprovado na Esteira (pedido do Natham: os botões ficam na ficha, o card fica baixo). */
export function estadoDoCard(t: Pick<Tarefa, "empresaId" | "postagens" | "postarEm" | "postarRedes" | "arquivos" | "formato" | "programacaoCancelada">): { texto: string; tom: "normal" | "postando" | "erro" } {
  if (t.empresaId !== "you") return { texto: SO_YOU_CARD, tom: "normal" };
  const sit = situacao(t);
  if (sit?.tipo === "postando") return { texto: "Postando…", tom: "postando" };
  if (sit?.tipo === "erro") return { texto: "Erro ao postar: abra o card", tom: "erro" };
  if (programacaoCancelada(t)) return { texto: "Programação cancelada: abra o card", tom: "erro" };
  // Programado assim antes do conserto (dado antigo): a função recusaria; o próximo salvar cancela a programação.
  if (t.postarEm && carrosselSoFacebook(t, t.formato, redesDe(t))) return { texto: "Precisa de ajuste: abra o card", tom: "erro" };
  return sit ? { texto: sit.texto, tom: "normal" } : { texto: "Sem programação", tom: "normal" };
}
