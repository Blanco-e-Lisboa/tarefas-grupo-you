import { describe, expect, it } from "vitest";
import { postando, postarEmQueVale, redesQueValem } from "./postagens";
import type { Arquivo, Tarefa } from "./tipos";

const img: Arquivo = { nome: "a.jpg", tipo: "imagem" }, vid: Arquivo = { nome: "b.mp4", tipo: "video" };

describe("postar_redes gravado (achado 3 da Lupa no Correio)", () => {
  it("carrossel com vídeo grava só o Instagram, também quando as redes estão no padrão (nulo = as duas)", () => {
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, vid], postarRedes: ["instagram", "facebook"] })).toEqual(["instagram"]);
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, vid] })).toEqual(["instagram"]);
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, { ...vid, pendente: {} as File }] })).toEqual(["instagram"]); // vídeo subindo agora conta
  });
  it("o resto fica como está: carrossel só de fotos, outro formato e vídeo já removido", () => {
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, img], postarRedes: ["instagram", "facebook"] })).toEqual(["instagram", "facebook"]);
    expect(redesQueValem({ formato: "reels", arquivos: [vid] })).toBeUndefined();
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, { ...vid, removido: true }], postarRedes: ["facebook"] })).toEqual(["facebook"]);
  });
  it("programado só para o Facebook e depois ganha vídeo: NUNCA troca a rede sozinho (decisão do Maestro); o card pede ajuste", () => {
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, vid], postarRedes: ["facebook"] })).toEqual(["facebook"]);
    expect(redesQueValem({ formato: "carrossel", arquivos: [img, { ...vid, pendente: {} as File }], postarRedes: ["facebook"] })).toEqual(["facebook"]);
  });
  it("Aprovado só Facebook que ganhou vídeo perde a programação (o banco desarma o alarme); o resto mantém a data (achado 6, 3ª volta)", () => {
    const base = { etapa: "aprovado" as const, formato: "carrossel" as const, postarEm: "2026-10-27T10:00" };
    expect(postarEmQueVale({ ...base, arquivos: [img, vid], postarRedes: ["facebook"] })).toBeUndefined();
    expect(postarEmQueVale({ ...base, arquivos: [img, vid], postarRedes: ["instagram"] })).toBe("2026-10-27T10:00");
    expect(postarEmQueVale({ ...base, arquivos: [img, img], postarRedes: ["facebook"] })).toBe("2026-10-27T10:00");
    expect(postarEmQueVale({ ...base, etapa: "postado", arquivos: [img, vid], postarRedes: ["facebook"] })).toBe("2026-10-27T10:00"); // postado não se mexe
    expect(postarEmQueVale({ ...base, etapa: "edicao", arquivos: [img] })).toBeUndefined(); // fora de Aprovado/Postado, sem data (015)
  });
});

describe("recarga de 15 s (achado b da Lupa): só rede escolhida em andamento, e só em Aprovado", () => {
  const card = (extra: Partial<Tarefa>) => ({ id: "t", titulo: "x", tipo: "postagem", empresaId: "you", etapa: "aprovado", responsavel: "natham", diaInteiro: false, cor: "etiqueta-1", links: [], arquivos: [], ...extra }) as Tarefa;
  it("rede tirada do card em 'fila' não segura a recarga; Postado nunca; status desconhecido também não", () => {
    expect(postando(card({ postarRedes: ["instagram"], postagens: [{ rede: "facebook", status: "fila" }, { rede: "instagram", status: "postado" }] }))).toBe(false);
    expect(postando(card({ etapa: "postado", postagens: [{ rede: "facebook", status: "fila" }] }))).toBe(false);
    expect(postando(card({ postagens: [{ rede: "instagram", status: "cancelado" as never }] }))).toBe(false);
    expect(postando(card({ postarRedes: ["instagram"], postagens: [{ rede: "instagram", status: "enviando" }] }))).toBe(true);
  });
});

describe("r2 B1 (037): rede na fila esperando a hora marcada não é 'postando'", () => {
  const card = (postarEm?: string) => ({ etapa: "aprovado", postarEm, postarRedes: ["instagram"], postagens: [{ rede: "instagram", status: "fila" }] }) as unknown as Tarefa;
  const agora = new Date("2026-10-29T15:00:00Z"); // 12:00 em Brasília
  it("fila com data futura espera; com data passada (ou sem data) está postando", () => {
    expect(postando(card("2026-10-30T18:00"), agora)).toBe(false);
    expect(postando(card("2026-10-29T11:00"), agora)).toBe(true);
    expect(postando(card(), agora)).toBe(true);
  });
});
