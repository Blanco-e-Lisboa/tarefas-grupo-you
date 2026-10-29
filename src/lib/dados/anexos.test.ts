// Pente fino r1 (Lince): M8 (a mesma imagem não sobe duas vezes) e M14 (a capa velha só sai quando a nova chegou).
import { beforeEach, expect, it, vi } from "vitest";
import type { Arquivo } from "./tipos";

const drive = vi.hoisted(() => ({ enviar: vi.fn(), apagar: vi.fn(), ordenar: vi.fn(), ocasioes: vi.fn() }));
vi.mock("./drive", () => ({ enviarParaDrive: drive.enviar, apagarAnexoDrive: drive.apagar, ordenarAnexosDrive: drive.ordenar, recarregarOcasioes: drive.ocasioes, registrarProgresso: () => {} }));
const fila = vi.hoisted(() => ({ enviar: vi.fn(), adiar: vi.fn() }));
vi.mock("./envios", () => ({ enviarEmSegundoPlano: fila.enviar, apagarQuandoChegar: fila.adiar }));
vi.mock("@/lib/supabase/cliente", () => ({ supabase: () => ({}) }));

import { sincronizarAnexos } from "./anexos";

const sb = {} as Parameters<typeof sincronizarAnexos>[0];
beforeEach(() => { drive.enviar.mockReset(); drive.apagar.mockReset().mockResolvedValue(undefined); drive.ordenar.mockReset().mockResolvedValue(undefined); fila.enviar.mockReset(); });

it("M8: dois salvar seguidos com a mesma foto ainda subindo mandam a foto uma vez só", async () => {
  let chegou!: () => void;
  drive.enviar.mockImplementation(() => new Promise((ok) => { chegou = () => ok({ id: "a1", nome: "f.png", tipo: "imagem", driveId: "d1", ordem: 0, papel: "anexo" }); }));
  const foto: Arquivo = { nome: "f.png", tipo: "imagem", pendente: new File(["x"], "f.png") };
  const um = sincronizarAnexos(sb, "t1", "you", "p1", [], [foto]);
  const dois = sincronizarAnexos(sb, "t1", "you", "p1", [foto], [{ ...foto }]); // o arrastar levou a cópia do card com a foto ainda pendente
  await vi.waitFor(() => expect(chegou).toBeDefined());
  chegou();
  await Promise.all([um, dois]);
  expect(drive.enviar).toHaveBeenCalledTimes(1);
});

it("M14: trocar a capa e o envio da nova falhar não apaga a velha; dando certo, quem tira a velha é o servidor ao confirmar a nova", async () => {
  const velha: Arquivo = { id: "c1", nome: "velha.png", tipo: "imagem", driveId: "d0", papel: "capa" };
  const nova = (): Arquivo => ({ nome: "nova.png", tipo: "imagem", papel: "capa", pendente: new File(["y"], "nova.png") });
  drive.enviar.mockRejectedValueOnce(new Error("sem rede"));
  await expect(sincronizarAnexos(sb, "t1", "you", "p1", [velha], [nova()])).rejects.toThrow("sem rede");
  expect(drive.apagar).not.toHaveBeenCalled();

  drive.enviar.mockResolvedValueOnce({ id: "c2", nome: "nova.png", tipo: "imagem", driveId: "d2", ordem: 0, papel: "capa" });
  const r = await sincronizarAnexos(sb, "t1", "you", "p1", [velha], [nova()]);
  expect(r.map((a) => a.id)).toEqual(["c2"]);
  expect(drive.enviar.mock.calls.at(-1)?.[5]).toBe("c1"); // substitui_arquivo_id: o servidor confere a nova e só então tira a velha
  expect(drive.apagar).not.toHaveBeenCalled(); // bug novo 3 do Codex: apagar_anexo da última capa mandava a pasta (com a nova dentro) para a lixeira
});

it("r2 B3: trocar o vídeo não apaga o velho na hora; a fila o apaga quando o novo chegar", async () => {
  const velho: Arquivo = { id: "v1", nome: "velho.mp4", tipo: "video", driveId: "d1", papel: "anexo" };
  const novo: Arquivo = { nome: "novo.mp4", tipo: "video", papel: "anexo", pendente: new File(["x"], "novo.mp4", { type: "video/mp4" }) };
  await sincronizarAnexos(sb, "t1", "you", "p1", [velho], [novo]);
  expect(drive.apagar).not.toHaveBeenCalled();
  expect(fila.enviar).toHaveBeenCalledWith("t1", novo.pendente, expect.objectContaining({ apagarDepois: ["v1"] }));
});

it("r2 B4: vídeo novo no meio do carrossel: a foto que vem depois dele passa para a posição seguinte", async () => {
  const a: Arquivo = { id: "a", nome: "a.png", tipo: "imagem", driveId: "da", ordem: 0 };
  const b: Arquivo = { id: "b", nome: "b.png", tipo: "imagem", driveId: "db", ordem: 1 };
  const video: Arquivo = { nome: "v.mp4", tipo: "video", pendente: new File(["x"], "v.mp4", { type: "video/mp4" }) };
  const r = await sincronizarAnexos(sb, "t1", "you", "p1", [a, b], [a, video, b]);
  expect(fila.enviar).toHaveBeenCalledWith("t1", video.pendente, expect.objectContaining({ ordem: 1 }));
  expect(drive.ordenar).toHaveBeenCalledWith("t1", [{ id: "b", ordem: 2 }]);
  expect(r.map((x) => [x.id, x.ordem])).toEqual([["a", 0], ["b", 2]]);
});

it("r3 N5: reordenar um carrossel com imagens antigas do Supabase grava a ordem delas também", async () => {
  const a: Arquivo = { id: "a", nome: "a.png", tipo: "imagem", caminho: "tarefas/t1/a.png", ordem: 0 };
  const b: Arquivo = { id: "b", nome: "b.png", tipo: "imagem", caminho: "tarefas/t1/b.png", ordem: 1 };
  const r = await sincronizarAnexos(sb, "t1", "", "p1", [a, b], [b, a]);
  expect(drive.ordenar).toHaveBeenCalledWith("t1", [{ id: "b", ordem: 0 }, { id: "a", ordem: 1 }]);
  expect(r.map((x) => [x.id, x.ordem])).toEqual([["b", 0], ["a", 1]]);
});

it("r3 (Ferreiro 3): 2º salvar com o vídeo novo ainda subindo pelo 1º: o velho vai para esse envio, não para a lixeira na hora", async () => {
  const velho: Arquivo = { id: "v1", nome: "velho.mp4", tipo: "video", driveId: "d1", papel: "anexo" };
  const novo: Arquivo = { nome: "novo.mp4", tipo: "video", papel: "anexo", pendente: new File(["x"], "novo.mp4", { type: "video/mp4" }) };
  await sincronizarAnexos(sb, "t1", "you", "p1", [velho], [novo]); // 1º salvar (Aprovar): o velho vai para o envio
  fila.adiar.mockReturnValue(true); // o envio do novo ainda está na fila
  await sincronizarAnexos(sb, "t1", "you", "p1", [velho], [novo]); // 2º salvar: o tempo real trouxe o velho de volta para o card vivo
  expect(fila.enviar).toHaveBeenCalledTimes(1); // M8: o novo não sobe de novo
  expect(fila.adiar).toHaveBeenCalledWith(novo.pendente, ["v1"]);
  expect(drive.apagar).not.toHaveBeenCalled();
});
