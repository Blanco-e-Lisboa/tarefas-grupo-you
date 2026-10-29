// Calendário de postagens (item 315): o que cada empresa tem de postar em cada dia, e se saiu (feita), não saiu (faltou) ou saiu sem estar
// planejado (extra). Quem decide o estado é UMA função do banco (postagens_calendario, SQL 2026-10-26-315-01-pauta.sql); a tela só desenha.
// Só o Natham cria e muda (o banco barra os outros com 42501). Antes do SQL colado a função não existe: `ausente` fica verdadeiro e a tela
// esconde o botão "Postagens". Datas sempre "AAAA-MM-DD" do relógio de quem olha (nunca toISOString).
"use client";
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { funcaoAusente } from "./repositorio";
import { ligarTempoReal } from "./tempo-real";
import type { Formato, RedePost, Responsavel } from "./tipos";

export type Repete = "data" | "semana";
export type EstadoPostagem = "planejada" | "feita" | "faltou" | "extra";
/** Ao mudar ou apagar uma que se repete: só este dia, este e os próximos, ou todos. */
export type EscopoPostagem = "dia" | "proximos" | "todos";

/** O que o Natham monta na ficha. `diasSemana`: 0 = domingo ... 6 = sábado (igual ao getDay()). */
export type Planejada = {
  /** `hora` vazia = meta do dia: tem de sair naquele dia, a qualquer hora; fica só no calendário (não vira tarefa no Caderno). */
  id?: string; empresaId: string; formato: Formato; redes: RedePost[]; hora: string; responsavel?: Responsavel; titulo?: string;
  repete: Repete; data?: string; diasSemana?: number[]; inicio?: string; fim?: string;
};

/** Um bloco do calendário. Planejada: tem `planejadaId`. Extra: só o card (`cardId`), sem `planejadaId`. Feita: os dois. */
export type Ocorrencia = {
  planejadaId?: string; dia: string; hora: string; empresaId: string; formato?: Formato; redes?: RedePost[]; responsavel?: Responsavel;
  titulo?: string; repete?: Repete; estado: EstadoPostagem; cardId?: string; cardTitulo?: string;
};

type Linha = {
  planejada_id: string | null; dia: string; hora: string | null; empresa_id: string; formato: Formato | null; redes: RedePost[] | null;
  responsavel: Responsavel | null; titulo: string | null; repete: Repete | null; estado: EstadoPostagem; card_id: string | null; card_titulo: string | null;
};

export const daLinha = (l: Linha): Ocorrencia => ({
  planejadaId: l.planejada_id ?? undefined, dia: l.dia, hora: l.hora ?? "", empresaId: l.empresa_id, formato: l.formato ?? undefined,
  redes: l.redes ?? undefined, responsavel: l.responsavel ?? undefined, titulo: l.titulo ?? undefined, repete: l.repete ?? undefined,
  estado: l.estado, cardId: l.card_id ?? undefined, cardTitulo: l.card_titulo ?? undefined,
});

export const paraBanco = (p: Planejada) => ({
  id: p.id ?? null, empresa_id: p.empresaId, formato: p.formato, redes: p.redes, hora: p.hora, responsavel: p.responsavel ?? "matheus",
  titulo: p.titulo?.trim() || null, repete: p.repete, data: p.repete === "data" ? p.data ?? null : null,
  dias_semana: p.repete === "semana" ? p.diasSemana ?? [] : null, inicio: p.inicio ?? null, fim: p.repete === "semana" ? p.fim ?? null : null,
});

// ponytail: um período por semana/mês olhado, guardado até fechar a aba; limpar os antigos se a lista crescer de verdade
let periodos = new Map<string, Ocorrencia[]>();
let ausente = false;
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const chave = (de: string, ate: string) => `${de}|${ate}`;
export const lerPeriodo = (de: string, ate: string) => periodos.get(chave(de, ate));
export const lerAusente = () => ausente;

/** Lê do banco o calendário de `de` a `ate` (inclusive). Falhou: mantém o que está na tela. */
const vez = new Map<string, number>(); // B11: última leitura pedida por período; resposta de uma anterior que chega depois é descartada
export async function carregar(de: string, ate: string) {
  const n = (vez.get(chave(de, ate)) ?? 0) + 1;
  vez.set(chave(de, ate), n);
  const { data, error } = await supabase().rpc("postagens_calendario", { p_de: de, p_ate: ate });
  if (vez.get(chave(de, ate)) !== n) return;
  if (error) {
    if (funcaoAusente(error) && !ausente) { ausente = true; avisar(); }
    return;
  }
  ausente = false;
  periodos = new Map(periodos).set(chave(de, ate), ((data ?? []) as Linha[]).map(daLinha));
  avisar();
}
const relerTudo = () => [...periodos.keys()].forEach((k) => { const [de, ate] = k.split("|"); void carregar(de, ate); });

// A pauta toca "pauta"; um card que entra em Postado toca "esteira" (o bloco fica verde sem recarregar).
const AVISOS_PAUTA = ["pauta", "esteira"] as const;
let iniciado = false;
let desligarTempoReal: (() => void) | undefined;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  if (!iniciado && typeof window !== "undefined") {
    iniciado = true;
    document.addEventListener("visibilitychange", () => { if (!document.hidden) relerTudo(); });
  }
  desligarTempoReal ??= ligarTempoReal("pauta", AVISOS_PAUTA, relerTudo);
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};

/** Blocos de `de` a `ate` ("AAAA-MM-DD"). `itens` undefined = carregando. `ausente` = o SQL do 315 ainda não foi colado (esconda o botão). */
export function usePostagensCalendario(de: string, ate: string) {
  const k = chave(de, ate);
  const itens = useSyncExternalStore(assinar, () => periodos.get(k), () => undefined);
  const semFuncao = useSyncExternalStore(assinar, lerAusente, () => false);
  useEffect(() => { void carregar(de, ate); }, [de, ate]);
  return { itens, ausente: semFuncao };
}

function mensagem(e: { code?: string }, padrao: string) {
  if (e.code === "42501") return "Só o Natham monta o calendário de postagens.";
  if (funcaoAusente(e)) return "O calendário de postagens ainda não foi ligado no banco.";
  if (e.code === "23514") return "Confira a postagem: empresa, formato, hora, redes e o dia (ou os dias da semana).";
  if (e.code === "P0002") return "Essa postagem não existe mais (alguém apagou).";
  return padrao;
}

/** Cria (sem `id`) ou muda. Para uma que se repete, `escopo` + `dia` dizem se vale só naquele dia, dali em diante ou em todos.
 *  Devolve o id gravado ("este e os próximos" devolve o id da série nova) ou o aviso para mostrar. */
export async function salvarPlanejada(p: Planejada, escopo: EscopoPostagem = "todos", dia?: string): Promise<{ id: string | null; erro: string }> {
  const { data, error } = await supabase().rpc("salvar_planejada", { p: paraBanco(p), p_escopo: escopo, p_dia: dia ?? null });
  if (error) return { id: null, erro: mensagem(error, "Não deu para salvar a postagem.") };
  relerTudo();
  return { id: data as string, erro: "" };
}

/** Apaga só o `dia`, dali em diante, ou a postagem inteira. As tarefas já feitas no Caderno ficam. Devolve o aviso ("" = deu certo). */
export async function apagarPlanejada(id: string, escopo: EscopoPostagem = "todos", dia?: string): Promise<string> {
  const { error } = await supabase().rpc("apagar_planejada", { p_id: id, p_escopo: escopo, p_dia: dia ?? null });
  if (error) return mensagem(error, "Não deu para apagar a postagem.");
  relerTudo();
  return "";
}

type LinhaSerie = {
  id: string; empresa_id: string; formato: Formato; redes: RedePost[]; hora: string | null; titulo: string | null; repete: Repete; data: string | null;
  dias_semana: number[] | null; inicio: string | null; fim: string | null; pessoas: { slug: Responsavel } | null;
};

/** Uma linha da tabela postagens_planejadas (com o slug de quem posta) como a ficha edita. */
export const daSerie = (l: LinhaSerie): Planejada => ({
  id: l.id, empresaId: l.empresa_id, formato: l.formato, redes: l.redes, hora: l.hora?.slice(0, 5) ?? "", titulo: l.titulo ?? "", responsavel: l.pessoas?.slug ?? "matheus",
  repete: l.repete, data: l.data ?? undefined, diasSemana: l.dias_semana ?? [], inicio: l.inicio ?? undefined, fim: l.fim ?? undefined,
});

/** A série INTEIRA de uma postagem (dias da semana, começo, fim): o bloco do calendário só traz o dia dele, e editar "todos" sem isso apagaria o começo.
 *  A trava de leitura do banco deixa os logados lerem. `null` = não achou ou falhou (a ficha avisa). */
export async function lerSerie(id: string): Promise<Planejada | null> {
  const { data, error } = await supabase().from("postagens_planejadas").select("*, pessoas:responsavel_id(slug)").eq("id", id).maybeSingle();
  return error || !data ? null : daSerie(data as LinhaSerie);
}
