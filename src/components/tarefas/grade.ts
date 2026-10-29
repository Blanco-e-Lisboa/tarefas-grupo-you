import { comoNatham, duplicarCard, podeAlterar, podeMarcar, RESPONSAVEIS, type EventoAgenda, type NovaTarefa, type Responsavel, type Tag, type Tarefa } from "@/lib/dados";
import { deTexto, ultimoDia } from "@/components/calendario/logica";

// Margem de horários do caderno (igual ao CRM): a linha k vale 07:00 + 30 min × k, 31 linhas até 22:00.
export const PRIMEIRA = 7 * 60;
export const PASSO = 30;
export const SLOTS = 31;

const dois = (n: number) => String(n).padStart(2, "0");
const hhmm = (m: number) => `${dois(Math.floor(m / 60))}:${dois(m % 60)}`;

/** Cadernos que dá para abrir (item 155/266): o Natham abre o de todos; o Adrian, o dele e o do Matheus; os outros, só o próprio. */
export const cadernosQueVe = (eu: Responsavel | null | undefined): Responsavel[] =>
  !eu ? [] : eu === "natham" ? [...RESPONSAVEIS] : comoNatham(eu) ? [eu, "matheus"] : [eu];

/** Tarefa escrita numa linha do Caderno, no seu ou no de outra pessoa que você abre: vai para `responsavel` e, se não for você,
    chega como "enviada por" você (o mesmo envio de sempre: enviarPara). */
export const novaDoCaderno = (titulo: string, empresaId: string, responsavel: Responsavel) =>
  ({ titulo, tipo: "outro" as const, empresaId, responsavel, enviarPara: responsavel, cor: "etiqueta-5" as const, links: [], arquivos: [] });

export const rotuloSlot = (k: number) => (k < SLOTS ? hhmm(PRIMEIRA + k * PASSO) : "");
/** "HH:MM" do início, ou "" se for dia inteiro ou sem hora. */
export const horaDe = (t: Tarefa) => (t.diaInteiro || !t.inicio || t.inicio.length < 16 ? "" : t.inicio.slice(11, 16));
export const minutos = (hora: string) => +hora.slice(0, 2) * 60 + +hora.slice(3, 5);
export const horaDoSlot = (k: number) => hhmm(PRIMEIRA + k * PASSO);
export const somarMinutos = (hora: string, n: number) => hhmm(Math.min(23 * 60 + 59, minutos(hora) + n));

/** Duração em minutos (item 275): do início ao fim no mesmo dia. Sem hora, sem fim ou fim em outro dia = 30 min (o padrão). */
export const duracaoDe = (t: Tarefa) => {
  const h = horaDe(t);
  return h && t.fim && t.fim.length > 10 && t.fim.slice(0, 10) === t.inicio?.slice(0, 10) ? Math.max(PASSO, minutos(t.fim.slice(11, 16)) - minutos(h)) : PASSO;
};

/** B9: minutos que a tarefa pede ao ser arrastada para outra linha: do início ao fim de verdade (passa da meia-noite também). Sem hora ou sem fim = 30. */
export const duracaoQuerida = (t: Tarefa) =>
  horaDe(t) && t.fim && t.fim.length > 10 ? Math.max(15, Math.round((deTexto(t.fim).getTime() - deTexto(t.inicio!).getTime()) / 60_000)) : PASSO;

/** A2/M17: cópia pelo ⋮ do Caderno ("Duplicar" e "Criar tarefa para"). Card de conteúdo copia como na Esteira (duplicarCard: volta para Roteiro,
    sem data do post, legenda, anexos e aprovação), mantendo o horário. Tarefa do Caderno fica no caderno do mesmo dono e nunca leva os anexos
    (os arquivos são do original: tirar um da cópia apagaria o dele). */
export const copiaDoCaderno = (t: Tarefa, todas: readonly Tarefa[], tags: readonly Tag[]): NovaTarefa => ehConteudo(t)
  ? { ...duplicarCard(t, todas, tags), inicio: t.inicio, fim: t.fim, diaInteiro: t.diaInteiro }
  : { ...t, id: undefined, concluida: false, arquivos: [], postagens: undefined, postarEm: undefined, vaiProGoogle: undefined, enviarPara: t.dono }; // L7: só o Calendário liga a ida ao Google, ao criar

const CHAVE_FEITAS = "grade:tarefas-feitas";
/** B6: migração única das "feitas" que moravam no navegador para o campo concluida. Só sai da lista o que o banco confirmou
    (ou que não precisa mais: já feita, tarefa que não existe, ou que a pessoa não pode marcar); o que o banco recusou fica para a próxima abertura.
    L2: tarefa RECEBIDA é só leitura para quem recebeu: marca pelo marcarFeita (031), como o clique no Caderno. */
export async function migrarFeitas(guarda: Pick<Storage, "getItem" | "setItem" | "removeItem">, tarefas: readonly Tarefa[], eu: Responsavel,
  { salvar, marcarFeita }: { salvar: (t: Tarefa) => Promise<unknown>; marcarFeita: (id: string, feita: boolean) => Promise<boolean> }) {
  const velhas: unknown = JSON.parse(guarda.getItem(CHAVE_FEITAS) ?? "[]");
  if (!Array.isArray(velhas)) return guarda.removeItem(CHAVE_FEITAS);
  const faltam = tarefas.filter((t) => velhas.includes(t.id) && !t.concluida && podeMarcar(t, eu));
  const marcar = async (t: Tarefa) => (podeAlterar(t, eu) ? !!(await salvar({ ...t, concluida: true })) : marcarFeita(t.id, true));
  const recusadas = (await Promise.all(faltam.map(async (t) => ((await marcar(t)) ? null : t.id)))).filter(Boolean);
  if (recusadas.length) guarda.setItem(CHAVE_FEITAS, JSON.stringify(recusadas));
  else guarda.removeItem(CHAVE_FEITAS);
}

/** Linha de baixo de uma tarefa longa (item 275): ocupada pelo bloco, não aceita outra tarefa. */
export type Continua = { continuaDe: Tarefa };

/** Quantas linhas o bloco da tarefa na linha `k` ocupa (1 = tarefa comum). */
export const linhasDoBloco = (grade: readonly unknown[], k: number): number => {
  const t = grade[k];
  let n = 1;
  while ((grade[k + n] as Continua | null)?.continuaDe && (grade[k + n] as Continua).continuaDe === t) n++;
  return n;
};

/** Maior duração (minutos, múltiplo de 30) que a tarefa das `hora`, na linha `k`, pode ter sem cobrir linha já ocupada por outra
    tarefa ou compromisso (item 275, regra: bloco nunca cobre linha ocupada). Passa `grade` já com os compromissos. */
export const duracaoMaxima = (grade: readonly unknown[], k: number, hora: string) => {
  const eu = grade[k];
  let n = 1;
  while (k + n < SLOTS && (!grade[k + n] || ((grade[k + n] as Continua).continuaDe && (grade[k + n] as Continua).continuaDe === eu))) n++;
  const sobra = minutos(hora) - (PRIMEIRA + k * PASSO); // 11:15 na linha das 11:00 já gastou 15 min; tarefa que desceu de linha (09:00 na linha das 09:30) ganha os 30 que ficou para trás
  return Math.floor((n * PASSO - sobra) / PASSO) * PASSO;
};

/** Item 279: a duração vai até 6h. */
export const DURACAO_MAXIMA = 360;

/** Até onde o menu oferece duração para a tarefa das `hora`: no máximo 6h e nunca depois do fim das linhas (22:30). */
export const duracaoLimite = (hora: string) => Math.min(DURACAO_MAXIMA, Math.max(0, Math.floor((FIM_GRADE - minutos(hora)) / PASSO) * PASSO));

/** "HH:MM" onde começa o que ocupa a primeira linha que bloqueia a tarefa da linha `k` (tarefa ou compromisso; "" se nada bloqueia até o fim). */
export const ocupadoAs = (grade: readonly unknown[], k: number): string => {
  const eu = grade[k];
  let j = k + 1;
  while (j < SLOTS && (!grade[j] || (grade[j] as Continua).continuaDe === eu)) j++;
  const x = grade[j] as (Tarefa & { inicio?: string }) | Encaixe | null | undefined;
  if (!x || j >= SLOTS) return "";
  return "evento" in x ? x.inicio : horaDe(x as Tarefa) || rotuloSlot(j);
};

/** As tarefas do caderno de `dono` no `dia`, sem a que está sendo editada (`id`): o que a ficha confere antes de aceitar um horário. */
export const outrasNoDia = (todas: Tarefa[], dia: string, dono: Responsavel | null | undefined, id?: string) =>
  todas.filter((x) => x.id !== id && x.inicio?.slice(0, 10) === dia && doCaderno(x, dono));

/** Minutos que cabem a partir de `hora` entre as `outras` tarefas do dia (as do mesmo caderno, sem a que está sendo editada). 0 = a linha
    do horário já está ocupada por outra tarefa ou pelo bloco dela: a ficha não aceita esse início (mesma regra do arraste). */
export function duracaoLivre(outras: Tarefa[], hora: string): number {
  const g = montarGrade(outras, true, true);
  const k = Math.min(SLOTS - 1, Math.max(0, Math.floor((minutos(hora) - PRIMEIRA) / PASSO)));
  return g[k] ? 0 : Math.max(PASSO, duracaoMaxima(g, k, hora));
}

type DaFicha = { id?: string; dono?: Responsavel | null; responsavel: Responsavel; inicio?: string; diaInteiro: boolean };
/** Para a ficha (item 275): minutos que cabem no `dia` a partir de `hora` no caderno do dono (Infinity = sem limite, dia inteiro; 0 = linha ocupada). */
export const cabeNaFicha = (todas: Tarefa[], t: DaFicha, dia: string, hora: string) =>
  !dia || t.diaInteiro ? Infinity : Math.min(DURACAO_MAXIMA, duracaoLivre(outrasNoDia(todas, dia, t.dono ?? t.responsavel, t.id), hora));
/** A ficha barra o início que cai em linha ocupada. Início que não mudou (sobreposição antiga) segue salvando; só o Caderno avisa. */
export const fichaOcupada = (todas: Tarefa[], t: DaFicha, dia: string, hora: string) =>
  (!t.id || `${dia}T${hora}` !== t.inicio) && cabeNaFicha(todas, t, dia, hora) === 0;

/** Sobreposição antiga: a duração gravada passa de onde o bloco cabe (outra tarefa começa antes). Só para mostrar; nada é gravado. */
export const emConflito = (grade: readonly unknown[], k: number, t: Tarefa) => {
  const h = horaDe(t);
  return !!h && duracaoDe(t) > Math.max(PASSO, duracaoMaxima(grade, k, h));
};

/**
 * Cada tarefa mora na linha do seu horário (antes das 07:00 vai para 07:00, depois das 22:00 para 22:00).
 * Linha ocupada: desce para a próxima livre. Sem hora: ocupa as primeiras linhas livres. Sempre sobra uma linha vazia.
 * Entrada já ordenada por hora. Com `blocos` (Caderno), tarefa de mais de 30 min também toma as linhas de baixo que estiverem
 * livres, marcadas como `Continua`; as outras telas (Mapa) chamam sem `blocos` e recebem só tarefas.
 */
export function montarGrade(tarefas: Tarefa[], porHora: boolean): (Tarefa | null)[];
export function montarGrade(tarefas: Tarefa[], porHora: boolean, blocos: true): (Tarefa | Continua | null)[];
export function montarGrade(tarefas: Tarefa[], porHora: boolean, blocos = false): (Tarefa | Continua | null)[] {
  const linhas: (Tarefa | Continua | undefined)[] = [];
  const semHora: Tarefa[] = [];
  const lugar = new Map<Tarefa, number>();
  for (const t of tarefas) {
    const h = porHora ? horaDe(t) : "";
    if (!h) { semHora.push(t); continue; }
    let k = Math.min(SLOTS - 1, Math.max(0, Math.floor((minutos(h) - PRIMEIRA) / PASSO)));
    while (linhas[k]) k++;
    linhas[k] = t;
    lugar.set(t, k);
  }
  // Só depois de todas no lugar: o bloco toma as linhas de baixo que sobraram e nunca empurra outra tarefa do seu horário.
  // Quantas linhas o bloco quer: da linha onde ficou até o fim gravado (tarefa que desceu de linha conta do fim, não da duração).
  const pedidas = (t: Tarefa, k: number) => { const h = minutos(horaDe(t)), topo = PRIMEIRA + k * PASSO; return h >= topo ? Math.ceil(duracaoDe(t) / PASSO) : Math.max(1, Math.ceil((h + duracaoDe(t) - topo) / PASSO)); };
  if (blocos) for (const [t, k] of lugar) for (let j = k + 1; j < Math.min(SLOTS, k + pedidas(t, k)) && !linhas[j]; j++) linhas[j] = { continuaDe: t };
  for (const t of semHora) {
    let k = 0;
    while (linhas[k]) k++;
    linhas[k] = t;
  }
  return Array.from({ length: Math.max(SLOTS, linhas.length + 1) }, (_, k) => linhas[k] ?? null);
}

/** Milissegundos até a próxima meia-noite local (mais 500 de folga para o relógio já ter virado). */
export const msAteMeiaNoite = (agora: Date): number =>
  new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1).getTime() - agora.getTime() + 500;

/** Reunião (item 188) = tipo Reunião ou título com "reunião", "reuniões" ou a abreviação "reun", sem ligar para maiúscula
    ou acento. "Reunir material" não conta. Só o título já basta: é o que o evento do Google traz.
    314 · Mas só quando o tipo não foi escolhido: card de Postagem/Roteiro criado na Esteira com "reunião" no título é conteúdo (sumia da coluna). */
export const ehReuniao = (t: { titulo: string; tipo?: string }): boolean =>
  t.tipo === "reuniao" || ((!t.tipo || t.tipo === "outro") && /\b(reuni(ao|oes)|reun)\b/.test(t.titulo.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()));

/** Conteúdo de empresa tem etapa e empresa. Postagem sem empresa continua sendo tarefa pessoal do Caderno.
    Reunião nunca é conteúdo (fica no Calendário e no Caderno, fora da Esteira, do Mapa e da Fila). */
/** Item 287: a visão "Sem data" do Caderno mostra SÓ tarefas do caderno. Card de conteúdo (empresa + etapa) sem data vive na Esteira, nunca aqui. */
export const semDataDoCaderno = (ts: Tarefa[]) => ts.filter((x) => !x.inicio && !ehConteudo(x));

export const ehConteudo = (t: Pick<Tarefa, "etapa" | "empresaId" | "titulo" | "tipo">): boolean => !!(t.etapa && t.empresaId) && !ehReuniao(t);

/** Tarefa pessoal que `de` mandou para outra pessoa: continua no caderno de quem enviou (item 144), onde ele edita e apaga. */
export const enviadaPorMim = (t: Tarefa, de: string | null | undefined) =>
  !!de && !ehConteudo(t) && t.enviadaPor === de && !!t.dono && t.dono !== de;

/** O caderno de `de` = o que é DELE (dono; o banco não transfere dono ao trocar o responsável) mais o que ele enviou. Conteúdo com empresa segue o responsável. Sem `de`, tudo. */
export const doCaderno = (t: Tarefa, de: string | null | undefined) =>
  !de || (ehConteudo(t) ? t.responsavel === de : (t.dono ?? t.responsavel) === de || enviadaPorMim(t, de));

/** Item 263: o Natham vê o caderno de quem recebe, então a tarefa que ele envia sai do caderno DELE e vive só no de quem recebeu
    (onde ele ainda edita). Item 266: o Adrian também abre o caderno do Matheus, então o que ele manda ao Matheus sai do dele.
    Só regra de exibição; o que o Adrian manda ao Natham, e o que o Matheus manda, continua no caderno de quem enviou (ninguém abre o do Natham). */
export const somenteNoDeQuemRecebeu = (t: Tarefa, de: string | null | undefined, eu: string | null | undefined) =>
  de === eu && enviadaPorMim(t, de) && (eu === "natham" || (comoNatham(eu) && t.dono === "matheus"));

/** Nas listas pessoais, conteúdo com empresa aparece para todos; o restante segue o dono do Caderno. */
export const daMinhaLista = (t: Tarefa, eu: string | null | undefined) =>
  ehConteudo(t) || (!!eu && doCaderno(t, eu));

/** Compromissos do Google que caem em `dia` (também os de vários dias), dia inteiro primeiro, depois por hora. */
export const eventosDoDia = (eventos: EventoAgenda[], dia: string, dono: Responsavel | null) =>
  eventos
    .filter((e) => !!dono && e.fontes.includes(dono) && e.inicio.slice(0, 10) <= dia && dia <= ultimoDia(e))
    .sort((a, b) => Number(b.diaInteiro) - Number(a.diaInteiro) || a.inicio.localeCompare(b.inicio));

/** "09:00 às 10:00", "a partir das 09:00" ou "dia inteiro". Compromisso que vem de outro dia mostra só o que vale hoje. */
export const quandoEvento = (e: EventoAgenda, dia: string) => {
  if (e.diaInteiro) return "dia inteiro";
  const ini = e.inicio.slice(0, 10) === dia ? e.inicio.slice(11, 16) : "";
  const fim = e.fim && e.fim.slice(0, 10) === dia ? e.fim.slice(11, 16) : "";
  return ini && fim ? `${ini} às ${fim}` : ini ? `a partir das ${ini}` : fim ? `até as ${fim}` : "dia inteiro";
};

// ===== Compromissos do Google dentro das linhas do Caderno (item 221) =====
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
const palavras = (s: string) => new Set(semAcento(s).split(/[^a-z0-9]+/).filter((w) => w.length > 2));

/** Um título contém o outro (4 letras ou mais) ou as palavras de um e de outro coincidem em 60% (interseção sobre união). */
export const titulosParecidos = (a: string, b: string): boolean => {
  const x = semAcento(a).trim(), y = semAcento(b).trim();
  if (!x || !y) return false;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const A = palavras(a), B = palavras(b);
  const junto = new Set([...A, ...B]).size;
  return junto > 0 && [...A].filter((w) => B.has(w)).length / junto >= 0.6;
};

/** Já existe tarefa digitada para este compromisso: mesmo dia, início até 30 min de diferença (dia inteiro: tarefa sem hora) e título parecido. */
export const jaTemTarefa = (e: EventoAgenda, tarefas: Tarefa[]): boolean =>
  tarefas.some((t) => {
    const h = horaDe(t);
    const perto = e.diaInteiro ? !h : !!h && e.inicio.slice(0, 10) === t.inicio?.slice(0, 10) && Math.abs(minutos(h) - minutos(e.inicio.slice(11, 16))) <= 30;
    return perto && titulosParecidos(e.titulo, t.titulo);
  });

const FIM_GRADE = PRIMEIRA + SLOTS * PASSO; // 22:30: a linha das 22:00 vai até aqui

/** Trecho do compromisso que cai em `dia`, em minutos desde 00:00. Sem fim: 30 min. */
const trecho = (e: EventoAgenda, dia: string) => {
  const de = e.inicio.slice(0, 10) < dia ? 0 : minutos(e.inicio.slice(11, 16));
  const fim = !e.fim ? de + PASSO : e.fim.slice(0, 10) > dia ? 1440 : e.fim.slice(0, 10) < dia ? de + PASSO : minutos(e.fim.slice(11, 16));
  return { de, ate: Math.max(fim, de + 1) };
};

/** Dia inteiro vai para a faixa de cima; o resto, para as linhas; o que cai todo fora de 07:00 às 22:30 fica só na agenda da direita. */
export function separarCompromissos(eventos: EventoAgenda[], dia: string) {
  const faixa = eventos.filter((e) => e.diaInteiro);
  const horas = eventos.filter((e) => { if (e.diaInteiro) return false; const { de, ate } = trecho(e, dia); return ate > PRIMEIRA && de < FIM_GRADE; });
  return { faixa, horas };
}

export type Encaixe = { evento: EventoAgenda; /** "HH:MM" onde começa neste dia. */ inicio: string; fim: string; /** false = linha de baixo de um compromisso longo (só pintada). */ primeira: boolean };

/**
 * Põe cada compromisso na linha da meia hora em que começa (11:15 vai para 11:00) e pinta as linhas que ele ocupa.
 * A tarefa já está no lugar dela: se a linha do início está ocupada, o compromisso desce para a próxima livre, e um compromisso
 * longo para de pintar quando encontra uma linha ocupada. Entrada: `grade` de `montarGrade` e `horas` já em ordem de início.
 */
export function encaixarCompromissos(grade: (Tarefa | Continua | null)[], horas: EventoAgenda[], dia: string): (Tarefa | Continua | Encaixe | null)[] {
  const linhas: (Tarefa | Continua | Encaixe | undefined)[] = grade.map((l) => l ?? undefined);
  const clamp = (k: number) => Math.min(SLOTS - 1, Math.max(0, k));
  for (const e of horas) {
    const { de, ate } = trecho(e, dia);
    const k0 = clamp(Math.floor((de - PRIMEIRA) / PASSO));
    const n = clamp(Math.floor((Math.min(ate, FIM_GRADE) - 1 - PRIMEIRA) / PASSO)) - k0 + 1; // toda meia hora tocada: 11:15 às 11:45 pinta 11:00 e 11:30
    const dados = { evento: e, inicio: hhmm(de), fim: hhmm(Math.min(ate, 1439)) };
    let k = k0;
    while (linhas[k]) k++;
    linhas[k] = { ...dados, primeira: true };
    for (let j = k + 1; j < k + n && j < SLOTS && !linhas[j]; j++) linhas[j] = { ...dados, primeira: false };
  }
  return Array.from({ length: Math.max(SLOTS, linhas.length + 1) }, (_, k) => linhas[k] ?? null);
}

/** Item 292 · Linhas do Caderno "Sem data": cada tarefa fica na linha que guardou (`linhaCaderno`), com vazias entre elas.
    Linha já tomada: desce para a próxima livre. Tarefa sem linha guardada (antes do SQL 292) empilha nas primeiras livres, como sempre foi. */
export function montarSemData(tarefas: Tarefa[]): (Tarefa | null)[] {
  const linhas: (Tarefa | undefined)[] = [];
  const livre = (k: number) => { while (linhas[k]) k++; return k; };
  for (const t of tarefas) if (t.linhaCaderno !== undefined) linhas[livre(Math.max(0, t.linhaCaderno))] = t;
  for (const t of tarefas) if (t.linhaCaderno === undefined) linhas[livre(0)] = t;
  return Array.from({ length: Math.max(SLOTS, linhas.length + 1) }, (_, k) => linhas[k] ?? null);
}
