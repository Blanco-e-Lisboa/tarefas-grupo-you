// r3 A7 (038, contrato com o Bussola): cada vídeo marca o card com o id do SEU envio e o confirma com o mesmo id; o banco guarda a lista e só
// tira a marca quando ela esvazia. Com dois vídeos do mesmo card, a marca não sai entre a chegada do 1º e a do 2º (sem janela).
import { expect, it, vi } from "vitest";

const lista = new Set<string>(); // tarefas.videos_pendentes no banco (simulado)
const marcada = () => lista.size > 0;
const chegadas: (() => void)[] = [];
const quandoChegou: boolean[] = []; // a marca no instante em que cada vídeo chegou
const enviar = vi.fn((...a: unknown[]) => new Promise<void>((ok) => chegadas.push(() => { lista.delete(a[6] as string); quandoChegou.push(marcada()); ok(); })));
const marcar = vi.fn(async (_t: string, envio?: string) => { if (envio) lista.add(envio); return null; });
vi.mock("./drive", () => ({ enviarParaDrive: (...a: unknown[]) => enviar(...a) }));
vi.mock("./repositorio", () => ({ recarregarTarefas: async () => {} }));
vi.mock("./subindo", () => ({ marcarPendente: (t: string, e?: string) => marcar(t, e) }));

import { enviarEmSegundoPlano } from "./envios";

it("a marca só sai quando o último vídeo do card chega, e cada envio leva o próprio id ao marcar e ao confirmar", async () => {
  const video = (n: string) => new File(["x"], n, { type: "video/mp4" });
  const id1 = enviarEmSegundoPlano("t1", video("1.mp4"));
  const id2 = enviarEmSegundoPlano("t1", video("2.mp4"));
  expect(marcar).toHaveBeenCalledWith("t1", id1);
  expect(marcar).toHaveBeenCalledWith("t1", id2);
  await vi.waitFor(() => expect(chegadas).toHaveLength(1));
  chegadas[0]();
  await vi.waitFor(() => expect(chegadas).toHaveLength(2));
  chegadas[1]();
  await vi.waitFor(() => expect(quandoChegou).toHaveLength(2));
  expect(quandoChegou).toEqual([true, false]); // no instante em que o 1º chegou o card continuava marcado; no 2º, desmarcou
  expect(enviar.mock.calls.map((c) => c[6])).toEqual([id1, id2]);
});
