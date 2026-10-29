// A1 (pente fino r1, SQL 040): o número de edição do card. O salvar manda o número que a tela viu; se o banco já tem outro, recusa
// ("Este card mudou enquanto você editava"). Este arquivo cuida de um detalhe: dois salvar seguidos DESTA aba (arrastar e logo trocar a cor)
// partem do mesmo número; o 2º precisa mandar o número que o 1º deixou, senão o banco o recusaria à toa. Saiu do repositorio.ts (limite de linhas).
const proprias = new Map<string, Map<number, number>>(); // id -> (número de onde o salvar desta aba partiu -> número que ele deixou)
const fila = new Map<string, Promise<unknown>>(); // um salvar por card de cada vez: o 2º só sai quando o 1º já disse o número novo

/** Segue a corrente dos salvar desta aba: 5 -> 6 -> 7. */
const versaoAtual = (id: string, v: number | undefined) => { const m = proprias.get(id); while (v !== undefined && m?.has(v)) v = m.get(v); return v; };
/** Anota "de -> para" como mudança desta aba. Só se o número SUBIU: "5 leva a 5" rodaria para sempre (bug novo 4 do Codex). */
const anotar = (id: string, de: number, para: number) => { if (para > de) proprias.set(id, (proprias.get(id) ?? new Map<number, number>()).set(de, para)); };

/** Roda `salvar` (o salvar_tarefa) na vez deste card, com o número certo, e anota o número que ele devolveu.
    `vista`: o número que a tela viu (undefined = sem conferência: card novo, ou banco antes do 040). */
export function salvarNaVez<R extends { data: unknown; error: unknown }>(id: string, vista: number | undefined, salvar: (versao: number | undefined) => PromiseLike<R>): Promise<R> {
  const vez = (fila.get(id) ?? Promise.resolve()).then(async () => {
    const de = versaoAtual(id, vista);
    const r = await salvar(de);
    if (!r.error && typeof r.data === "number" && de !== undefined) anotar(id, de, r.data);
    return r;
  });
  fila.set(id, vez.catch(() => {}));
  return vez;
}

/** r2 F6 / r3 A1: "Postar agora" muda a data do post no banco e o número sobe; a ficha que mandou continua aberta com o número velho.
    O banco (041) devolve `{ antes, depois }`: o número que o card tinha quando ELE travou a linha e o que deixou. Só é desta aba se o "antes"
    é o que esta aba viu. Se outra pessoa mexeu antes, não adota: o próximo Salvar da ficha avisa "Este card mudou" (antes, a tela lia o
    número depois e podia adotar a edição do outro e gravar por cima dela). Sem o 041 (resposta vazia), não anota nada. */
export function anotarMudancaPropria(id: string, vista: number | undefined, resposta: unknown) {
  const { antes, depois } = (resposta ?? {}) as { antes?: unknown; depois?: unknown };
  if (vista === undefined || typeof antes !== "number" || typeof depois !== "number") return;
  if (versaoAtual(id, vista) === antes) anotar(id, antes, depois);
}
