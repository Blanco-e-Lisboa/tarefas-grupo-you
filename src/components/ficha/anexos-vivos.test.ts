import { expect, it } from "vitest";
import type { Arquivo } from "@/lib/dados";
import { juntarChegados } from "./anexos-vivos";

it("r2 B2: a foto que o salvar já pôs na ficha (com o id novo) não entra de novo quando chega pelo card vivo", () => {
  const naFicha: Arquivo = { id: "a1", nome: "final.png", tipo: "imagem", driveId: "d1" }; // o salvar deu o id ao item da ficha
  const vivo: Arquivo = { id: "a1", nome: "final.png", tipo: "imagem", driveId: "d1" };
  expect(juntarChegados([naFicha], [vivo], [vivo])).toEqual([naFicha]);
});

it("o vídeo que chegou em segundo plano entra; o que já está ganha o papel do banco", () => {
  const velho: Arquivo = { id: "v1", nome: "sem-legenda.mp4", tipo: "video", papel: "anexo" };
  const novo: Arquivo = { id: "v2", nome: "legendado.mp4", tipo: "video", papel: "anexo" };
  const r = juntarChegados([velho], [{ ...velho, papel: "original" }, novo], [novo]);
  expect(r.map((a) => [a.id, a.papel])).toEqual([["v1", "original"], ["v2", "anexo"]]);
});

it("r4 novo 4: o vídeo entregue toma o lugar do provisório pendente na ficha aberta (o Programar não pede mais salvar)", () => {
  const provisorio: Arquivo = { nome: "reels.mp4", tipo: "video", pendente: new File([], "reels.mp4"), url: "blob:x" };
  const capa: Arquivo = { id: "c1", nome: "capa.png", tipo: "imagem", papel: "capa" };
  const chegou: Arquivo = { id: "v9", nome: "reels.mp4", tipo: "video", driveId: "d9", papel: "anexo" };
  expect(juntarChegados([provisorio, capa], [capa, chegou], [chegou])).toEqual([chegou, capa]);
});
