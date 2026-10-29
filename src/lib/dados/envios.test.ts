import { describe, expect, it, vi } from "vitest";

// A7 (pente fino r1): vídeo esperando atrás de outro na fila também segura o post: a marca é pedida ao ENFILEIRAR.
let liberarPrimeiro: () => void = () => {};
const enviar = vi.fn((tarefaId: string) => (tarefaId === "t1" ? new Promise<void>((r) => { liberarPrimeiro = r; }) : Promise.resolve()));
const marcar = vi.fn<(t: string) => Promise<string | null>>(async () => null);
vi.mock("./drive", () => ({ enviarParaDrive: (t: string) => enviar(t) }));
vi.mock("./repositorio", () => ({ recarregarTarefas: async () => {} }));
vi.mock("./subindo", () => ({ marcarPendente: (t: string) => marcar(t) }));

import { enviarEmSegundoPlano } from "./envios";

const video = (nome: string) => new File(["x"], nome, { type: "video/mp4" });

describe("envios: marca de vídeo pendente (A7)", () => {
  it("o segundo vídeo é marcado logo ao entrar na fila, antes de o primeiro terminar", async () => {
    enviarEmSegundoPlano("t1", video("grande.mp4"));
    enviarEmSegundoPlano("t2", video("legendado.mp4"));
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledWith("t1"));
    expect(marcar).toHaveBeenCalledWith("t2");
    expect(enviar).not.toHaveBeenCalledWith("t2");
    liberarPrimeiro();
    await vi.waitFor(() => expect(enviar).toHaveBeenCalledWith("t2"));
    expect(marcar).toHaveBeenCalledTimes(2); // uma por vídeo, sem pedir de novo ao começar
  });
});
