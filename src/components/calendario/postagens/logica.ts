// Calendário de postagens (315): só agrupamento, rótulos e conferência do formulário. O ESTADO (planejada/feita/faltou/extra) vem pronto do banco;
// aqui nada é recalculado. Datas "AAAA-MM-DD" do relógio local, como o resto do calendário.
import type { EscopoPostagem, EstadoPostagem, Ocorrencia, Planejada } from "@/lib/dados";
import { deTexto, diasDaSemana, diasDoMes, somarDias, type Visao } from "../logica";

export type Modo = Visao;

/** Os dias que a tela mostra e o intervalo que o banco é chamado para devolver (o mês inclui os dias de fora, como no Calendário).
 *  O Ano não entra: ele só mostra o calendário, sem buscar postagens. */
export function periodoDe(modo: Exclude<Modo, "ano">, cursor: string) {
  const dias = modo === "dia" ? [cursor] : modo === "semana" ? diasDaSemana(cursor) : diasDoMes(cursor);
  return { dias, de: dias[0], ate: dias[dias.length - 1] };
}

/** L3: mostra o calendário de postagens (e o botão Tarefas | Postagens)? Depois de ver uma vez, a semana nova carregando (virada da semana)
    não esconde a tela: só esconde se o banco disser que a função não existe. */
export const temPostagens = (jaTeve: boolean, itens: unknown, ausente: boolean) => !ausente && (jaTeve || itens !== undefined);

/** Por dia, na ordem da hora; empate: empresa. */
export function porDiaPostagens(itens: readonly Ocorrencia[]) {
  const mapa = new Map<string, Ocorrencia[]>();
  for (const o of itens) mapa.set(o.dia, [...(mapa.get(o.dia) ?? []), o]);
  for (const l of mapa.values()) l.sort((a, b) => a.hora.localeCompare(b.hora) || a.empresaId.localeCompare(b.empresaId));
  return mapa;
}

export const ESTADOS: Record<EstadoPostagem, string> = { planejada: "Planejada", feita: "Postada", faltou: "Faltou", extra: "Extra" };

/** Horas oferecidas: 05:00 a 21:30, de meia em meia hora (a grade da semana vai até 22:00). O Caderno começa às 07:00: antes disso a tarefa cai na primeira linha. */
export const HORAS = Array.from({ length: 34 }, (_, k) => `${String(5 + Math.floor(k / 2)).padStart(2, "0")}:${k % 2 ? "30" : "00"}`);

/** Segunda a domingo (como o Natham fala); o número é o do banco: 0 = domingo. */
export const DIAS_SEMANA = [{ n: 1, nome: "Seg" }, { n: 2, nome: "Ter" }, { n: 3, nome: "Qua" }, { n: 4, nome: "Qui" }, { n: 5, nome: "Sex" }, { n: 6, nome: "Sáb" }, { n: 0, nome: "Dom" }];

export const planejadaNova = (dia: string): Planejada => ({
  empresaId: "", formato: "reels", redes: ["instagram", "facebook"], hora: "17:00", responsavel: "matheus", titulo: "",
  repete: "data", data: dia, diasSemana: [], inicio: dia,
});

/** O que falta preencher ("" = pode salvar). */
export function faltaPreencher(p: Planejada): string {
  if (!p.empresaId) return "Escolha a empresa.";
  if (!p.redes.length) return "Escolha pelo menos uma rede.";
  if (p.repete === "data") return p.data ? "" : "Escolha o dia.";
  if (!p.diasSemana?.length) return "Marque os dias da semana.";
  if (!p.inicio) return "Escolha quando começa.";
  return p.fim && p.fim < p.inicio ? "O fim não pode ser antes do começo." : "";
}

/** "Só este dia" no banco só muda hora, quem faz e título. Mudou outra coisa? Essa opção não pode ser oferecida (ela ignoraria a mudança em silêncio).
 *  Virar meta (sem hora) ou deixar de ser também não: no banco, hora vazia num dia quer dizer "a da série". */
export const soHoraQuemTitulo = (a: Planejada, b: Planejada) =>
  !a.hora === !b.hora && a.empresaId === b.empresaId && a.formato === b.formato && a.redes.join() === b.redes.join() && a.repete === b.repete
  && (a.diasSemana ?? []).join() === (b.diasSemana ?? []).join() && (a.fim ?? "") === (b.fim ?? "") && (a.inicio ?? "") === (b.inicio ?? "");

/** Mesmo texto do selo "formato · hora" do bloco. */
export const quando = (o: Pick<Ocorrencia, "hora">) => o.hora.slice(0, 5);

/** Lupa 315: um dia com "só este dia" tem hora, quem posta e título próprios. A ficha abre mostrando os DO DIA (é o bloco que foi clicado). */
export const comODia = (s: Planejada, o: Pick<Ocorrencia, "hora" | "responsavel" | "titulo">): Planejada =>
  ({ ...s, hora: quando(o), responsavel: o.responsavel ?? s.responsavel, titulo: o.titulo ?? s.titulo });

/** Ao gravar "este e os próximos" ou "todos", hora/quem/título que a pessoa NÃO mexeu voltam a ser os da série:
 *  senão o "só este dia" de um dia vazaria para a série inteira em silêncio. "Só este dia" grava o que está na ficha. */
export function paraGravar(serie: Planejada, aberta: Planejada, t: Planejada, escopo: EscopoPostagem): Planejada {
  if (escopo === "dia") return t;
  const fica = <K extends "hora" | "responsavel" | "titulo">(c: K) => (t[c] === aberta[c] ? serie[c] : t[c]);
  return { ...t, hora: fica("hora"), responsavel: fica("responsavel"), titulo: fica("titulo") };
}

/** Etiqueta de metas de uma empresa num dia: tudo saiu = feita; alguma faltou = faltou; senão, planejada. */
export function estadoDoGrupo(metas: readonly Pick<Ocorrencia, "estado">[]): EstadoPostagem {
  if (metas.every((o) => o.estado === "feita")) return "feita";
  return metas.some((o) => o.estado === "faltou") ? "faltou" : "planejada";
}

/** Feita: o bloco mostra (e fica na grade) na hora em que o card saiu, não na planejada. Sem a hora do card (não carregado), fica a planejada. */
export const naHoraDoCard = (o: Ocorrencia, horaDoCard: (id: string) => string): Ocorrencia => {
  const hora = o.estado === "feita" && o.cardId ? horaDoCard(o.cardId) : "";
  return hora ? { ...o, hora } : o;
};

/** Até onde a ficha procura outra planejada igual: a data avulsa, ou a série de `desde` (o dia aberto, ou hoje) até o fim, no máximo 5 semanas.
 *  Série antiga começa a olhar em `desde`, não no começo dela (Lince: senão só via o passado). */
export function janelaDaPlanejada(p: Planejada, desde: string): { de: string; ate: string } {
  if (p.repete === "data") return { de: p.data || desde, ate: p.data || desde };
  const de = p.inicio && p.inicio > desde ? p.inicio : desde;
  // shortcut: olha só 5 semanas a partir de `de`; outra planejada que comece depois disso não é avisada
  const ate = somarDias(de, 34);
  return { de, ate: p.fim && p.fim < ate ? p.fim : ate };
}

/** Lince 27/10: dias em que JÁ existe outra planejada da mesma empresa e formato nos dias que esta cobre (o post casaria com só uma delas). */
export function diasRepetidos(p: Planejada, itens: readonly Ocorrencia[], desde: string): string[] {
  const { de, ate } = janelaDaPlanejada(p, desde);
  const cobre = (dia: string) => (p.repete === "data" ? dia === p.data : dia >= de && dia <= ate && !!p.diasSemana?.includes(deTexto(dia).getDay()));
  return [...new Set(itens.filter((o) => o.planejadaId && o.planejadaId !== p.id && o.empresaId === p.empresaId && o.formato === p.formato && cobre(o.dia)).map((o) => o.dia))].sort();
}
