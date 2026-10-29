// r2 F6 / r3 A1: depois de "Postar agora", o Salvar seguinte da mesma ficha não é recusado pela mudança que foi dela,
// mas a edição de OUTRA pessoa nunca é adotada como desta aba (o Codex reproduziu: a ficha velha gravava por cima).
import { expect, it, vi } from "vitest";
import { anotarMudancaPropria, salvarNaVez } from "./versao-card";

const salvar = () => vi.fn(async (v: number | undefined) => ({ data: (v ?? 0) + 1, error: null }));

it("o número que o Postar agora deixou conta como desta aba: o Salvar da ficha (que viu 6) manda 7", async () => {
  anotarMudancaPropria("t1", 6, { antes: 6, depois: 7 });
  const s = salvar();
  await salvarNaVez("t1", 6, s);
  expect(s).toHaveBeenCalledWith(7);
});

it("outra pessoa mexeu antes do Postar agora (o banco tinha 7, a ficha viu 6): não adota, e o Salvar manda 6 (o banco recusa: card mudou)", async () => {
  anotarMudancaPropria("t2", 6, { antes: 7, depois: 8 });
  const s = salvar();
  await salvarNaVez("t2", 6, s);
  expect(s).toHaveBeenCalledWith(6);
});

it("número que não subiu, ou banco antes do 041 (sem resposta): nada é anotado", async () => {
  anotarMudancaPropria("t3", 3, { antes: 3, depois: 3 });
  anotarMudancaPropria("t3", 3, null);
  const s = salvar();
  await salvarNaVez("t3", 3, s);
  expect(s).toHaveBeenCalledWith(3);
});
