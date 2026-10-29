// Datas do calendário: SEMPRE pelo relógio local, em texto "AAAA-MM-DD" e "AAAA-MM-DDTHH:MM".
// Nunca toISOString: ele converte para o fuso de Londres e, depois das 21h, já marca o dia seguinte.
import type { EventoAgenda, NovaTarefa, Tarefa } from "@/lib/dados";

export type Visao = "dia" | "semana" | "mes" | "ano";
/** Opções do filtro Visão, iguais nos dois calendários. */
export const VISOES: { v: Visao; rotulo: string }[] = [{ v: "dia", rotulo: "Dia" }, { v: "semana", rotulo: "Semana" }, { v: "mes", rotulo: "Mês" }, { v: "ano", rotulo: "Ano" }];
/** Para onde a tarefa foi solta. null = coluna "Sem data". */
export type Destino = { dia: string; minuto?: number; diaInteiro?: boolean } | null;

const p2 = (n: number) => String(n).padStart(2, "0");
export const paraDia = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const paraHora = (d: Date) => `${paraDia(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
export function deTexto(s: string) {
  const [a, m, d] = s.slice(0, 10).split("-").map(Number);
  const [h, min] = s.length > 10 ? s.slice(11, 16).split(":").map(Number) : [0, 0];
  return new Date(a, m - 1, d, h, min);
}
export const somarDias = (dia: string, n: number) => { const d = deTexto(dia); d.setDate(d.getDate() + n); return paraDia(d); };
const somarMinutos = (hora: string, n: number) => { const d = deTexto(hora); d.setMinutes(d.getMinutes() + n); return paraHora(d); };
export const minutoDoDia = (hora: string) => (hora.length > 10 ? Number(hora.slice(11, 13)) * 60 + Number(hora.slice(14, 16)) : 0);
export const comMinuto = (dia: string, min: number) => `${dia}T${p2(Math.floor(min / 60))}:${p2(min % 60)}`;
const diasEntre = (a: string, b: string) => Math.round((deTexto(b).getTime() - deTexto(a).getTime()) / 86_400_000);

/** Semana começa no domingo, como no Google Agenda do Brasil. */
export const inicioSemana = (dia: string) => somarDias(dia, -deTexto(dia).getDay());
export const diasDaSemana = (dia: string) => Array.from({ length: 7 }, (_, i) => somarDias(inicioSemana(dia), i));
/** Número da semana como no Google Agenda: semana de domingo a sábado, que pertence ao ano da sua quinta-feira;
    a semana 1 é a da primeira quinta do ano (2026: 28/12 a 3/1; 27/12/2026 é a 53; 25/10/2026 é a 44). */
export function semanaDoAno(dia: string) {
  const quinta = somarDias(inicioSemana(dia), 4);
  const jan1 = deTexto(`${quinta.slice(0, 4)}-01-01`);
  const primeira = somarDias(paraDia(jan1), (4 - jan1.getDay() + 7) % 7);
  return Math.round(diasEntre(primeira, quinta) / 7) + 1;
}
/** Grade do mês: semanas inteiras (domingo a sábado) que cobrem o mês, 5 ou 6 linhas. */
export function diasDoMes(dia: string) {
  const primeiro = `${dia.slice(0, 7)}-01`;
  const d = deTexto(primeiro);
  const total = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const semanas = Math.ceil((d.getDay() + total) / 7);
  return Array.from({ length: semanas * 7 }, (_, i) => somarDias(inicioSemana(primeiro), i));
}

/** Um passo para trás (-1) ou para frente (+1) na visão atual. */
export function andar(visao: Visao, dia: string, passo: 1 | -1) {
  if (visao === "dia") return somarDias(dia, passo);
  if (visao === "semana") return somarDias(dia, 7 * passo);
  const d = deTexto(dia);
  d.setDate(1); // 31/01 + 1 mês não pode cair em março
  if (visao === "mes") d.setMonth(d.getMonth() + passo);
  else d.setFullYear(d.getFullYear() + passo);
  return paraDia(d);
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", o);
const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const nomeMes = (dia: string) => maiuscula(fmt({ month: "long" }).format(deTexto(dia)));
export const nomeSemana = (dia: string, tamanho: "short" | "long" = "short") =>
  maiuscula(fmt({ weekday: tamanho }).format(deTexto(dia)).replace(".", ""));
export const diaCurto = (dia: string) => `${Number(dia.slice(8, 10))}/${dia.slice(5, 7)}`;
export const horaCurta = (hora: string) => hora.slice(11, 16);

/** Título do período e o ano (o ano sai em cinza ao lado). */
export function tituloPeriodo(visao: Visao, dia: string): [string, string] {
  const ano = dia.slice(0, 4);
  if (visao === "ano") return ["", ano];
  if (visao === "mes") return [nomeMes(dia), ano];
  if (visao === "dia") return [`${nomeSemana(dia, "long")}, ${Number(dia.slice(8, 10))} de ${nomeMes(dia).toLowerCase()}`, ano];
  const [a, b] = [inicioSemana(dia), somarDias(inicioSemana(dia), 6)];
  return [a.slice(5, 7) === b.slice(5, 7) ? `${Number(a.slice(8))} a ${Number(b.slice(8))} de ${nomeMes(a).toLowerCase()}` : `${diaCurto(a)} a ${diaCurto(b)}`, b.slice(0, 4)];
}

/** Tarefa com hora que termina em outro dia: aparece na faixa de "dia inteiro" de cada dia que cobre. */
export const variosDias = (t: Tarefa) => !!t.inicio && !!t.fim && !t.diaInteiro && t.fim.slice(0, 10) > t.inicio.slice(0, 10);
export function diasCobertos(t: Tarefa) {
  if (!t.inicio) return [];
  const dias = [t.inicio.slice(0, 10)];
  if (variosDias(t)) while (dias[dias.length - 1] < t.fim!.slice(0, 10)) dias.push(somarDias(dias[dias.length - 1], 1));
  return dias;
}

/** Agrupa as tarefas por dia (uma tarefa de vários dias entra em cada um), em ordem: dia inteiro primeiro, depois por hora. */
export function porDia(tarefas: Tarefa[]) {
  const mapa = new Map<string, Tarefa[]>();
  for (const t of tarefas) for (const d of diasCobertos(t)) mapa.set(d, [...(mapa.get(d) ?? []), t]);
  const chave = (t: Tarefa) => (t.diaInteiro || variosDias(t) ? "" : t.inicio!);
  for (const lista of mapa.values()) lista.sort((a, b) => chave(a).localeCompare(chave(b)) || a.titulo.localeCompare(b.titulo));
  return mapa;
}

/** Último dia de um compromisso do Google (item 190). O que termina à meia-noite em ponto não ocupa o dia seguinte. */
export const ultimoDia = (e: EventoAgenda) => {
  const f = e.fim ?? e.inicio;
  return !e.diaInteiro && f.endsWith("T00:00") && f.slice(0, 10) > e.inicio.slice(0, 10) ? somarDias(f.slice(0, 10), -1) : f.slice(0, 10);
};
/** Compromisso que vai para a faixa de dia inteiro: o de dia inteiro e o que tem hora e passa para outro dia (como a tarefa). */
export const eventoNoTopo = (e: EventoAgenda) => e.diaInteiro || ultimoDia(e) > e.inicio.slice(0, 10);
/** Compromissos do Google por dia (um de vários dias entra em cada um), na ordem do banco (início). */
export function agendaPorDia(eventos: EventoAgenda[]) {
  const mapa = new Map<string, EventoAgenda[]>();
  for (const e of eventos) for (let d = e.inicio.slice(0, 10); d <= ultimoDia(e); d = somarDias(d, 1)) mapa.set(d, [...(mapa.get(d) ?? []), e]);
  return mapa;
}

/** Item 192 + Lupa R5-3/R5-5: vai para o Google a tarefa marcada pelo Calendário, COM data, que quem criou fez para si mesmo
    ou que o Natham criou para alguém. Espelha private.pode_ir_pro_google do 010 (o banco decide; isto só evita prometer na tela). */
export const vaiProGoogle = (t: Pick<Tarefa, "vaiProGoogle" | "responsavel">, temData: boolean, criador: Tarefa["criadoPor"] | null) =>
  !!t.vaiProGoogle && temData && !!criador && (t.responsavel === criador || criador === "natham");

/** A9: card Aprovado com data do post = o alarme vai postar nessa data. Arrastar só mudaria o início (o post sairia no dia antigo), então as telas não deixam. */
export const postProgramado = (t: Pick<Tarefa, "etapa" | "postarEm">) => t.etapa === "aprovado" && !!t.postarEm;
export const avisoProgramado = (t: Pick<Tarefa, "postarEm">) =>
  `Este card está programado para postar em ${diaCurto(t.postarEm!)} às ${horaCurta(t.postarEm!)}. Para mudar o dia ou o horário, mude a data do post na ficha.`;

/** Nova versão da tarefa depois de arrastada. Mantém a duração quando dá. */
export function mover(t: Tarefa, destino: Destino): NovaTarefa {
  if (!destino) return { ...t, inicio: undefined, fim: undefined, diaInteiro: false };
  const { dia, minuto, diaInteiro } = destino;
  if (diaInteiro) return { ...t, inicio: dia, fim: undefined, diaInteiro: true };
  const temHora = !!t.inicio && !t.diaInteiro;
  const duracao = temHora && t.fim ? Math.round((deTexto(t.fim).getTime() - deTexto(t.inicio!).getTime()) / 60_000) : null;
  if (minuto !== undefined) {
    const inicio = comMinuto(dia, minuto);
    // Sem fim antes, sem fim depois (item 159: a ficha não tem mais Termina, então não se inventa 1 h escondida).
    return { ...t, inicio, fim: duracao !== null ? somarMinutos(inicio, duracao) : undefined, diaInteiro: false };
  }
  // Solta num dia do mês/ano: troca só a data e mantém o horário.
  if (!temHora) return { ...t, inicio: dia, fim: undefined, diaInteiro: true };
  const desloca = diasEntre(t.inicio!.slice(0, 10), dia);
  return { ...t, inicio: somarDias(t.inicio!.slice(0, 10), desloca) + t.inicio!.slice(10), fim: t.fim && somarDias(t.fim.slice(0, 10), desloca) + t.fim.slice(10) };
}

/** Lado a lado quando os horários se cruzam: cada tarefa ganha uma faixa e o total de faixas do seu grupo. */
export function faixas<T extends { ini: number; fim: number }>(itens: T[]) {
  const ordem = [...itens].sort((a, b) => a.ini - b.ini || b.fim - a.fim);
  const saida: (T & { faixa: number; total: number })[] = [];
  let grupo: (T & { faixa: number; total: number })[] = [], fins: number[] = [], fimGrupo = -1;
  const fechar = () => grupo.forEach((g) => (g.total = fins.length));
  for (const it of ordem) {
    if (it.ini >= fimGrupo) { fechar(); grupo = []; fins = []; }
    let f = fins.findIndex((x) => x <= it.ini);
    if (f < 0) f = fins.push(0) - 1;
    fins[f] = it.fim;
    const item = { ...it, faixa: f, total: 1 };
    grupo.push(item); saida.push(item);
    fimGrupo = Math.max(fimGrupo, it.fim);
  }
  fechar();
  return saida;
}

/** Régua 215 v2: na semana (coluna estreita), tarefas curtas (até 45 min) que dividem o horário não ficam lado a lado (o
    nome não cabia): viram uma pilha na largura toda do dia, uma por linha de 30 min, até a próxima tarefa ou 1 h. O que não
    cabe vira a linha "+N" (`mais`), que abre a lista. Fora disso, cada item fica na faixa de `faixas`. Tudo em minutos. */
export type Posto<T> = { it: T; topo: number; altura: number; faixa: number; total: number } | { mais: T[]; topo: number; altura: number };
export function empilhar<T extends { ini: number; fim: number; faixa: number; total: number }>(itens: T[], ligado: boolean): Posto<T>[] {
  const normal = (it: T): Posto<T> => ({ it, topo: it.ini, altura: it.fim - it.ini, faixa: it.faixa, total: it.total });
  if (!ligado) return itens.map(normal);
  const grupos: T[][] = [];
  let fim = -1;
  for (const it of [...itens].sort((a, b) => a.ini - b.ini || b.fim - a.fim)) {
    if (it.ini >= fim) grupos.push([it]);
    else grupos.at(-1)!.push(it);
    fim = Math.max(it.ini >= fim ? it.fim : fim, it.fim);
  }
  return grupos.flatMap((g, i) => {
    if (g.length < 2 || g.some((it) => it.fim - it.ini > 45)) return g.map(normal);
    const ini = g[0].ini, proxima = grupos[i + 1]?.[0].ini ?? Infinity;
    const linhas = Math.max(1, Math.floor(Math.min(60, proxima - ini) / 30));
    const cabem = g.length <= linhas ? g.length : linhas - 1;
    const postos: Posto<T>[] = g.slice(0, cabem).map((it, k) => ({ it, topo: ini + k * 30, altura: 30, faixa: 0, total: 1 }));
    return cabem < g.length ? [...postos, { mais: g.slice(cabem), topo: ini + cabem * 30, altura: 30 }] : postos;
  });
}

/** Espera o fim de um arraste (drop ou dragend, os dois chegam na janela) e chama `fim` uma vez só. Devolve como parar
    de esperar, para quem sai da tela no meio do arraste: sem isso os ouvintes ficavam presos na janela. */
export function esperarFimDoArraste(janela: EventTarget, fim: () => void) {
  const ouvintes = new AbortController();
  const uma = () => { ouvintes.abort(); fim(); };
  janela.addEventListener("drop", uma, { signal: ouvintes.signal });
  janela.addEventListener("dragend", uma, { signal: ouvintes.signal });
  return () => ouvintes.abort();
}
