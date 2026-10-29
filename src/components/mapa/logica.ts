// Mapa: lê as MESMAS tarefas da agenda. Todo conteúdo (tipo "postagem") com data vira um nó. Só a data conta, sem horário.
import type { Tarefa } from "@/lib/dados";
import { deTexto, paraDia, somarDias } from "@/components/calendario/logica";
import { diasDeAtraso, quandoDe } from "@/lib/atraso";
import { ehConteudo, montarGrade } from "@/components/tarefas/grade";

/** L6: assinatura do "hoje" do Mapa: confere o dia a cada minuto (só re-desenha quando o texto muda), para a aba aberta virar à meia-noite. */
export const aCadaMinuto = (avisar: () => void) => { const i = setInterval(avisar, 60_000); return () => clearInterval(i); };

/** Hoje pelo relógio do navegador, em data local (nunca toISOString: em UTC viraria o dia errado à noite no Brasil). */
export const hoje = (agora = new Date()) => paraDia(agora);

/** Do início até o fim do mês do início, ou até `ate` (a última postagem com data), o que vier depois. */
export function diasDoPeriodo(inicio: string, ate = "") {
  const d = deTexto(inicio);
  const fimDoMes = paraDia(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  const fim = ate > fimDoMes ? ate : fimDoMes;
  const dias: string[] = [];
  for (let x = inicio; x <= fim; x = somarDias(x, 1)) dias.push(x);
  return dias;
}

// O cartão mostra só o título, para bater o olho e saber do que se trata. Sem título, o objetivo serve de reserva.
export const tituloDe = (t: Tarefa) => t.titulo.trim() || t.objetivo?.trim() || "Sem título";

export const foiPostado = (t: Tarefa) => t.etapa === "postado" || !!t.concluida;
/** Quando o card entra no Mapa: card de Postagem usa a data e hora de POSTAR quando existe; senão, o início. Mora em @/lib/atraso (o atraso usa a mesma regra). */
export { quandoDe };
/** Só vale para card que já tem data (quandoDe). */
export const diaDe = (t: Tarefa) => quandoDe(t)!.slice(0, 10);

export const ultimoDia = (lista: readonly Tarefa[]) => lista.reduce((m, t) => (diaDe(t) > m ? diaDe(t) : m), "");

/** 278 · Tem lugar no Mapa: Postagem, ou QUALQUER conteúdo que esteja em Postado (a regra é: todo Postado aparece). */
const noMapa = (t: Tarefa) => ehConteudo(t) && (t.tipo === "postagem" || t.etapa === "postado");

export const conteudos = (tarefas: readonly Tarefa[]) =>
  tarefas.filter((t) => noMapa(t) && quandoDe(t)).sort((a, b) => quandoDe(a)!.localeCompare(quandoDe(b)!));

/** Postagem ainda sem data: não tem dia na linha, então o Mapa a mostra numa faixa à parte (item 198).
    278 · Card em Postado entra também (a regra é: todo Postado aparece no Mapa); o sem data fica nesta faixa. Só concluído sem estar em Postado continua fora. */
export const semData = (tarefas: readonly Tarefa[]) => tarefas.filter((t) => noMapa(t) && !quandoDe(t) && (t.etapa === "postado" || !foiPostado(t)));

/** 278 · O que vira marco na linha: o que vem de hoje em diante e TODO Postado com data, mesmo de dias passados (antes só entrava de hoje em diante). */
export const marcosDoMapa = (todos: readonly Tarefa[], inicio: string) => todos.filter((t) => (t.etapa === "postado" && diaDe(t) >= recuoMaximo(inicio)) || diaDe(t) >= inicio);
/** 278 · Teto do recuo: a linha volta no máximo até o 1º dia do mês anterior ao de hoje (senão ficaria enorme com meses de Postados). */
export const recuoMaximo = (inicio: string) => { const d = deTexto(inicio); return paraDia(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
/** Postados antigos demais para a linha (ficam só na Esteira, coluna Postado). */
export const postadosFora = (todos: readonly Tarefa[], inicio: string) => todos.filter((t) => t.etapa === "postado" && diaDe(t) < recuoMaximo(inicio)).length;
/** 278 · A linha começa hoje, ou no dia do Postado mais antigo que couber no teto (para ele ter onde aparecer). */
export const inicioDaLinha = (marcos: readonly Tarefa[], inicio: string) => marcos.reduce((m, t) => (diaDe(t) < m ? diaDe(t) : m), inicio);

/** Quantos conteúdos já foram postados no mês do início, mesmo antes do período (a linha só mostra o que vem pela frente). */
export const postadosNoMes = (lista: readonly Tarefa[], inicio: string) =>
  lista.filter((t) => foiPostado(t) && diaDe(t).startsWith(inicio.slice(0, 7))).length;

// ---------- formato "Fila": um card por dia, o que fazer em cada um ----------
export const ETAPAS_ATE_POSTAR = ["roteiro", "gravacao", "edicao", "analise", "aprovado"] as const;
/** Próximo passo pela etapa em que o conteúdo está. Sem etapa conta como roteiro. */
export const PASSO = { roteiro: "Gravar", gravacao: "Editar", edicao: "Enviar para análise", analise: "Aprovar", aprovado: "Postar" } as const;

export type Item = { t: Tarefa; dias: number; passo: string };
/** `dias` = quantos dias faltam para o dia do card (0 = hoje). */
export type DiaFila = { dia: string; dias: number; itens: Item[] };

export const diasAte = (dia: string, de: string) => Math.round((deTexto(dia).getTime() - deTexto(de).getTime()) / 864e5);

export function prazo(dias: number) {
  if (dias < 0) return dias === -1 ? "Atrasado 1 dia" : `Atrasado ${-dias} dias`;
  return dias === 0 ? "Hoje" : dias === 1 ? "Amanhã" : `Em ${dias} dias`;
}

/**
 * O que falta fazer, um grupo por dia, do mais perto ao mais longe. O grupo de hoje existe sempre (mesmo vazio) e leva
 * no topo o que ficou atrasado. Dentro do dia a ordem é a da folha do Caderno: com horário na linha do horário, sem horário
 * na ordem em que foi criado (a lista chega na ordem de criação, e a ordenação por data é estável).
 */
export function filaPorDia(lista: readonly Tarefa[], de: string): DiaFila[] {
  const itens = new Map<string, Item>();
  const porDia = new Map<string, Tarefa[]>();
  for (const t of lista) {
    if (!ehConteudo(t)) continue;
    // entra o que vem pela frente (postagem a postar) e todo atrasado, mesmo de antes do período do Mapa (mesma regra do Conteúdos)
    if (!quandoDe(t) || (!diasDeAtraso(t, de) && (t.tipo !== "postagem" || foiPostado(t)))) continue;
    const etapa = Math.max(0, ETAPAS_ATE_POSTAR.indexOf((t.etapa ?? "roteiro") as (typeof ETAPAS_ATE_POSTAR)[number]));
    itens.set(t.id, { t, dias: diasAte(diaDe(t), de), passo: PASSO[ETAPAS_ATE_POSTAR[etapa]] });
    const dia = diaDe(t) < de ? de : diaDe(t); // atrasado cai em hoje
    porDia.set(dia, [...(porDia.get(dia) ?? []), t]);
  }
  if (!porDia.size) return [];
  // atrasados primeiro: ordenados pelo dia de origem (o mais antigo no topo), cada dia na ordem da folha
  const doDia = (ts: Tarefa[]) => montarGrade([...ts].sort((a, b) => quandoDe(a)!.localeCompare(quandoDe(b)!)), true).filter((t): t is Tarefa => !!t);
  const atrasadas = (porDia.get(de) ?? []).filter((t) => diaDe(t) < de);
  const dehoje = (porDia.get(de) ?? []).filter((t) => diaDe(t) >= de);
  const pilhaAtraso = [...new Set(atrasadas.map(diaDe))].sort().flatMap((d) => doDia(atrasadas.filter((t) => diaDe(t) === d)));
  porDia.set(de, [...pilhaAtraso, ...doDia(dehoje)]);
  return [...porDia].sort(([a], [b]) => a.localeCompare(b)).map(([dia, ts]) => ({ dia, dias: diasAte(dia, de), itens: (dia === de ? ts : doDia(ts)).map((t) => itens.get(t.id)!) }));
}
