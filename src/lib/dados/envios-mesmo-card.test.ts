// Bug novo 2 do Codex (A7): dois vídeos do MESMO card na fila. O 1º chega e o banco tira a marca "vídeo novo pendente";
// o 2º ainda está subindo, então a marca tem de voltar na hora, senão o post sai com o vídeo antigo ou com o carrossel incompleto.
import { expect, it, vi } from "vitest";

let banco = false; // a marca no banco
const chegadas: (() => void)[] = [];
const enviar = vi.fn(() => new Promise<void>((ok) => chegadas.push(() => { banco = false; ok(); }))); // chegar tira a marca (arquivos_video_novo)
vi.mock("./drive", () => ({ enviarParaDrive: () => enviar() }));
vi.mock("./repositorio", () => ({ recarregarTarefas: async () => {} }));
vi.mock("./subindo", () => ({ marcarPendente: async () => { banco = true; return null; } }));

import { enviarEmSegundoPlano } from "./envios";

it("a marca só sai quando o último vídeo do card chega", async () => {
  const video = (n: string) => new File(["x"], n, { type: "video/mp4" });
  enviarEmSegundoPlano("t1", video("1.mp4"));
  enviarEmSegundoPlano("t1", video("2.mp4"));
  await vi.waitFor(() => expect(chegadas).toHaveLength(1));
  chegadas[0](); // o 1º chega: o banco tira a marca
  await vi.waitFor(() => expect(chegadas).toHaveLength(2)); // o 2º começou a subir
  expect(banco).toBe(true); // e o card continua marcado enquanto ele sobe
  chegadas[1]();
  await vi.waitFor(() => expect(banco).toBe(false));
});
