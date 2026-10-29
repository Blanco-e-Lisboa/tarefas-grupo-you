// Agenda do Google (item 190). Leitura de agenda_eventos: o n8n grava (supabase/008), o app só lê, com a sessão de quem está logado.
// Quem decide o que cada pessoa vê é a trava do banco (agenda_acesso): Natham todas, Matheus nunca a do Natham.
"use client";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { AVISOS, ligarTempoReal } from "./tempo-real";

export const FONTES_AGENDA = ["natham", "matheus", "adrian", "adrian_pessoal", "lucas", "contato"] as const; // M15: adrian_pessoal existe desde o 011
export type FonteAgenda = (typeof FONTES_AGENDA)[number];
/** Nome para o filtro "Agendas" do Calendário. contato = a agenda própria da contato@assessoriabeec.com.br. */
export const ROTULO_AGENDA: Record<FonteAgenda, string> = { natham: "Natham", matheus: "Matheus", adrian: "Adrian", adrian_pessoal: "Adrian (pessoal)", lucas: "Lucas", contato: "Beec (contato)" };

/** Compromisso do Google. Mesmo formato de data da Tarefa (hora de Brasília, sem fuso), então o Calendário desenha igual. */
export type EventoAgenda = {
  id: string;
  /** "Ocupado" quando o dono marcou como particular (o Google não manda título). */
  titulo: string;
  /** "2026-10-22T14:00", ou "2026-10-22" se diaInteiro. */
  inicio: string;
  /** Mesmo formato. Dia inteiro: último dia INCLUÍDO (o Google manda o dia seguinte; aqui já vem descontado). Sem fim = ausente. */
  fim?: string;
  diaInteiro: boolean;
  local?: string;
  particular: boolean;
  /** Agendas onde o compromisso aparece, só as que VOCÊ pode ver (a mesma reunião na contato@ e na do Natham vira 1 evento com 2 fontes). */
  fontes: FonteAgenda[];
};

export type LinhaEvento = { id: string; fontes: FonteAgenda[]; titulo: string; particular: boolean; inicio: string; fim: string | null; dia_inteiro: boolean; local: string | null };

const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
/** Instante (timestamptz do banco) -> "AAAA-MM-DDTHH:mm" na hora de Brasília, qualquer que seja o fuso do computador. */
export const horaDeBrasilia = (iso: string): string => {
  const p = Object.fromEntries(partes.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
};
const diaAnterior = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);

/** Linha do banco -> EventoAgenda. `minhas` = agendas que a pessoa pode ver (some do evento as que ela não vê). */
export function daLinhaEvento(l: LinhaEvento, minhas: readonly FonteAgenda[]): EventoAgenda {
  const inicio = horaDeBrasilia(l.inicio), fim = l.fim ? horaDeBrasilia(l.fim) : undefined;
  const base = { id: l.id, titulo: l.titulo, diaInteiro: l.dia_inteiro, local: l.local ?? undefined, particular: l.particular, fontes: l.fontes.filter((f) => minhas.includes(f)) };
  if (!l.dia_inteiro) return { ...base, inicio, fim };
  const ultimo = fim && diaAnterior(fim.slice(0, 10));
  return { ...base, inicio: inicio.slice(0, 10), fim: ultimo && ultimo > inicio.slice(0, 10) ? ultimo : undefined };
}

// Janela carregada: 45 dias para trás, 180 para frente, contados pelo INÍCIO do evento.
const DIAS_ATRAS = 45, DIAS_ADIANTE = 180;
const NADA: never[] = [];
let eventos: EventoAgenda[] = NADA;
let fontes: FonteAgenda[] = NADA;
const SEM_IDS: ReadonlySet<string> = new Set();
let confirmadas: ReadonlySet<string> = SEM_IDS;
let iniciado = false;
const ouvintes = new Set<() => void>();
let desligarTempoReal: (() => void) | undefined;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  iniciar();
  desligarTempoReal ??= ligarTempoReal("agenda", AVISOS.agenda, () => void recarregarAgenda()); // 274
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};

function iniciar() {
  if (typeof window === "undefined" || iniciado) return;
  iniciado = true;
  void recarregarAgenda();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void recarregarAgenda(); }); // voltou para a aba: busca de novo
  // Sem relógio de 60 s (290): o n8n gravar evento ou confirmar a ida ao Google toca o sino do 028 (agenda_copias / agenda_saida_vinculo) e a tela relê.
}

/** Busca de novo no banco. Se falhar (por exemplo, o 008 ainda não foi aplicado), mantém o que já tinha: o Calendário só fica sem a agenda. */
let leitura = 0; // B11: só a leitura mais nova vale (uma anterior que chega depois é descartada)
export async function recarregarAgenda() {
  const n = ++leitura;
  const sb = supabase(), dia = (n: number) => new Date(Date.now() + n * 864e5).toISOString();
  const [e, a, g] = await Promise.all([
    sb.from("agenda_eventos").select("id, fontes, titulo, particular, inicio, fim, dia_inteiro, local").gte("inicio", dia(-DIAS_ATRAS)).lt("inicio", dia(DIAS_ADIANTE)).order("inicio"),
    sb.from("agenda_acesso").select("fonte"),
    sb.rpc("tarefas_no_google"), // 010; sem ele aplicado dá erro e o selo "Na agenda do Google" simplesmente não aparece
  ]);
  if (n !== leitura) return;
  if (!g.error) confirmadas = new Set(g.data as string[]);
  if (e.error || a.error) return ouvintes.forEach((f) => f());
  const minhas = (a.data as { fonte: FonteAgenda }[]).map((x) => x.fonte);
  fontes = FONTES_AGENDA.filter((f) => minhas.includes(f));
  eventos = (e.data as LinhaEvento[]).map((l) => daLinhaEvento(l, fontes));
  ouvintes.forEach((f) => f());
}

/** Compromissos do Google que o banco deixa VOCÊ ver, em ordem de início (reativo; volta a buscar quando a aba volta ao foco). Vazio até carregar. */
export const useAgendaEventos = () => useSyncExternalStore(assinar, () => eventos, () => NADA);
/** Agendas que VOCÊ pode ver (para os botões do filtro "Agendas"). Natham: as 5; Matheus: sem a "natham". */
export const useAgendasVisiveis = () => useSyncExternalStore(assinar, () => fontes, () => NADA);
/** Ids das tarefas que JÁ estão confirmadas no Google (o n8n entregou e o banco guardou o vínculo). Só vale para tarefa em que você é dono, criador ou responsável.
 *  Para o selo da Ficha: `useTarefasNoGoogle().has(tarefa.id!)` = "Na agenda do Google"; `vaiProGoogle` sem confirmação = "Será enviada ao Google" (e só se tiver data). Depois de salvar, `recarregarAgenda()` atualiza na hora. */
export const useTarefasNoGoogle = () => useSyncExternalStore(assinar, () => confirmadas, () => SEM_IDS);
