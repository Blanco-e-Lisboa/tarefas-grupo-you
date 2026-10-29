import { describe, expect, it } from "vitest";
import type { Arquivo } from "@/lib/dados";
import { estadoDoCard, faltaParaPostar, redesValidas, situacao, textosPublicacao, comoHoraMarcada, CANCELADA, MODO_TESTE, SO_YOU_CARD, hojeEmBrasilia, jaPassou, jaPostadoEm } from "./postagem";

const img: Arquivo = { nome: "a.png", tipo: "imagem" }, vid: Arquivo = { nome: "b.mp4", tipo: "video" }, capa: Arquivo = { nome: "c.jpg", tipo: "imagem", papel: "capa" };
const card = (arquivos: Arquivo[], legenda = "Texto") => ({ arquivos, legenda, empresaId: "you" });

describe("o que falta para postar (196)", () => {
  it("cada formato com a sua quantidade; a capa não conta como mídia", () => {
    expect(faltaParaPostar(card([img]), "post", ["instagram"])).toEqual([]);
    expect(faltaParaPostar(card([vid, capa]), "reels", ["instagram"])).toEqual([]);
    expect(faltaParaPostar(card([img]), "reels", ["instagram"])).toEqual(["Reels leva 1 vídeo."]);
    expect(faltaParaPostar(card([img]), "carrossel", ["instagram"])).toEqual(["Carrossel leva de 2 a 10 imagens ou vídeos."]);
    expect(faltaParaPostar(card([vid], ""), "story", ["instagram", "facebook"])).toEqual([]); // story não leva descrição do post
    expect(faltaParaPostar(card([{ ...img, pendente: {} as File }]), "post", ["instagram"])).toEqual(["Post leva 1 imagem."]); // não subiu: não conta
  });
  it("sem descrição do post, sem rede, sem formato e empresa que não é a You", () => {
    expect(faltaParaPostar(card([img], " "), "post", [])).toEqual(["Escolha ao menos uma rede.", "Falta a descrição do post: escreva na ficha do card."]);
    expect(faltaParaPostar(card([img]), undefined, ["instagram"])).toEqual(["Escolha o formato."]);
    expect(faltaParaPostar({ ...card([img]), empresaId: "beec" }, "post", ["instagram"])).toEqual(["A Beec ainda não está ligada à postagem automática."]);
  });
  it("carrossel com vídeo perde o Facebook", () => {
    expect(redesValidas({ arquivos: [img, vid] }, "carrossel", ["instagram", "facebook"])).toEqual(["instagram"]);
    expect(redesValidas({ arquivos: [img, img] }, "carrossel", ["instagram", "facebook"])).toEqual(["instagram", "facebook"]);
  });
  it("só Facebook nunca vira Instagram sozinho: a checagem barra e pede para acender o Instagram ou tirar o vídeo", () => {
    expect(redesValidas({ arquivos: [img, vid] }, "carrossel", ["facebook"])).toEqual(["facebook"]);
    expect(faltaParaPostar(card([img, vid]), "carrossel", ["facebook"])).toEqual(["Carrossel com vídeo não vai para o Facebook: acenda o Instagram ou tire o vídeo."]);
    expect(faltaParaPostar(card([img, vid]), "carrossel", ["instagram"])).toEqual([]);
  });
});

describe("situação do card Aprovado", () => {
  it("postando vence erro; saiu numa e falhou na outra só refaz a que falhou", () => {
    expect(situacao({ postagens: [{ rede: "instagram", status: "enviando" }, { rede: "facebook", status: "erro" }] })).toEqual({ tipo: "postando" });
    expect(situacao({ postagens: [{ rede: "instagram", status: "postado", link: "x" }, { rede: "facebook", status: "erro", erro: "imagem grande" }] }))
      .toMatchObject({ tipo: "erro", texto: "Saiu no Instagram, falhou no Facebook: imagem grande", refazer: ["facebook"], incerto: false });
    expect(situacao({ postagens: [{ rede: "facebook", status: "erro", erro: "estado incerto: confira a rede antes de tentar de novo" }] })).toMatchObject({ incerto: true });
    expect(situacao({ postagens: [{ rede: "facebook", status: "erro", erro: "Não dá para saber se saiu no Facebook" }] })).toMatchObject({ incerto: true });
  });
  it("linha de rede tirada do card não conta (achado b da Lupa)", () => {
    expect(situacao({ postarRedes: ["instagram"], postagens: [{ rede: "facebook", status: "fila" }] })).toBeNull();
    expect(situacao({ postarRedes: ["instagram"], postagens: [{ rede: "facebook", status: "erro", erro: "x" }, { rede: "instagram", status: "fila" }] })).toEqual({ tipo: "postando" });
  });
  it("programado mostra data e redes; sem data e sem postagem, nada", () => {
    expect(situacao({ postarEm: "2026-10-25T18:00", postarRedes: ["instagram"] })).toEqual({ tipo: "programado", texto: "Programado · 25/10 18:00 · Instagram" });
    expect(situacao({})).toBeNull();
  });
});

describe("linha única do card Aprovado (botões na ficha)", () => {
  const you = { empresaId: "you", arquivos: [img] };
  it("um texto curto por estado; Beec não mostra Programado", () => {
    expect(estadoDoCard({ ...you, postarEm: "2026-10-27T10:00", postarRedes: ["instagram", "facebook"] }).texto).toBe("Programado · 27/10 10:00 · Instagram + Facebook");
    expect(estadoDoCard({ ...you, postagens: [{ rede: "instagram", status: "enviando" }] })).toEqual({ texto: "Postando…", tom: "postando" });
    expect(estadoDoCard({ ...you, postagens: [{ rede: "facebook", status: "erro", erro: "x" }] })).toEqual({ texto: "Erro ao postar: abra o card", tom: "erro" });
    expect(estadoDoCard(you).texto).toBe("Sem programação");
    expect(estadoDoCard({ ...you, empresaId: "beec", postarEm: "2026-10-27T12:00" }).texto).toBe(SO_YOU_CARD); // M1: só a You programa
  });
  it("só Facebook + vídeo sem data: 'cancelada' só se havia programação; nunca programado = só a checagem (achado a da Lupa)", () => {
    const soFb = { empresaId: "you", formato: "carrossel" as const, arquivos: [img, vid], postarRedes: ["facebook" as const] };
    expect(estadoDoCard(soFb)).toEqual({ texto: "Sem programação", tom: "normal" });
    expect(estadoDoCard({ ...soFb, programacaoCancelada: true })).toEqual({ texto: "Programação cancelada: abra o card", tom: "erro" });
    // ainda programado assim (dado de antes do conserto): não diz "Programado"
    expect(estadoDoCard({ empresaId: "you", formato: "carrossel", arquivos: [img, vid], postarRedes: ["facebook"], postarEm: "2026-10-28T11:00" })).toEqual({ texto: "Precisa de ajuste: abra o card", tom: "erro" });
  });
});

describe("textosPublicacao (238)", () => {
  it("ligada: Programar/Reprogramar, Postar agora, Programado e nenhum aviso", () => {
    const t = textosPublicacao(true, false);
    expect([t.marcar, t.postarAgora, t.aviso, t.situacao("Programado · 26/10 08:00 · Instagram")]).toEqual(["Programar postagem", true, undefined, "Programado · 26/10 08:00 · Instagram"]);
    expect(textosPublicacao(true, true).marcar).toBe("Reprogramar postagem");
  });
  it("desligada: Marcar hora, sem Postar agora, Hora marcada e o aviso de que a publicação é à mão", () => {
    const t = textosPublicacao(false, false);
    expect([t.marcar, t.postarAgora, t.situacao("Programado · 26/10 08:00 · Instagram")]).toEqual(["Marcar hora", false, "Hora marcada · 26/10 08:00 · Instagram"]);
    expect(t.aviso).toBe("Postagem automática ainda desligada: na hora marcada o card vira Postado e você publica nas redes.");
    expect(textosPublicacao(false, true).marcar).toBe("Remarcar hora");
  });
});

describe("comoHoraMarcada (238)", () => {
  it("desligada: Programado, Sem programação e Programação cancelada viram hora marcada; ligada: o texto como está", () => {
    expect(comoHoraMarcada("Programado · 26/10 08:00 · Instagram", false)).toBe("Hora marcada · 26/10 08:00 · Instagram");
    expect(comoHoraMarcada("Sem programação", false)).toBe("Sem hora marcada");
    expect(comoHoraMarcada("Programação cancelada: abra o card", false)).toBe("Hora marcada cancelada: abra o card");
    expect(comoHoraMarcada(CANCELADA, false)).toBe("Hora marcada cancelada: carrossel com vídeo não vai para o Facebook. Acenda o Instagram ou tire o vídeo e marque a hora de novo.");
    expect(comoHoraMarcada("Programado · 26/10 08:00 · Instagram", true)).toBe("Programado · 26/10 08:00 · Instagram");
    expect(comoHoraMarcada("Erro ao postar: abra o card", false)).toBe("Erro ao postar: abra o card");
    expect(comoHoraMarcada(SO_YOU_CARD, false)).toBe(SO_YOU_CARD); // M1: o aviso de outra empresa não depende do interruptor
  });
});

describe("M18: horário que já passou é o de Brasília", () => {
  const agora = new Date("2026-10-29T15:00:00Z"); // 12:00 em Brasília (13:00 num computador em UTC+1, 15:00 em UTC)
  it("compara com a hora de Brasília, não com o relógio do computador", () => {
    expect(jaPassou("2026-10-29T13:00", agora)).toBe(false);
    expect(jaPassou("2026-10-29T11:59", agora)).toBe(true);
    expect(hojeEmBrasilia(new Date("2026-10-30T02:00:00Z"))).toBe("2026-10-29"); // 23:00 do dia 29 em Brasília
  });
});

describe("modo de teste (239)", () => {
  it("ligada em modo de teste: aviso e confirmação dizem que cria rascunho e não publica", () => {
    const t = textosPublicacao(true, true, true);
    expect(t.aviso).toBe("Modo de teste: cria um rascunho na Meta, não publica.");
    expect(t.confirmar("Instagram", "Reels")).toEqual({ titulo: "Mandar um rascunho para o Instagram?", texto: `"Reels": ${MODO_TESTE}`, acao: "Mandar rascunho" });
    expect(t.postarAgora).toBe(true);
  });
  it("ligada de verdade: sem aviso, a confirmação de sempre; desligada: o aviso da 238 (o teste não conta)", () => {
    const t = textosPublicacao(true, true, false);
    expect(t.aviso).toBeUndefined();
    expect(t.confirmar("Instagram", "Reels")).toEqual({ titulo: "Postar agora no Instagram da You?", texto: '"Reels" vai para o ar agora. Não dá para desfazer.', acao: "Postar" });
    expect(textosPublicacao(false, false, true).aviso).toMatch(/^Postagem automática ainda desligada/);
  });
});

describe("r2 B1 (037): situação da fila com data futura", () => {
  it("tentar de novo com data futura mostra Programado, não Postando", () => {
    const t = { postarEm: "2026-10-30T18:00", postarRedes: ["instagram" as const], postagens: [{ rede: "instagram" as const, status: "fila" as const }] };
    expect(situacao(t, new Date("2026-10-29T15:00:00Z"))?.tipo).toBe("programado");
    expect(situacao(t, new Date("2026-10-30T22:00:00Z"))?.tipo).toBe("postando"); // passou da hora: está saindo
  });
});

it("r4 F2 (b): já postado só quando TODA rede escolhida tem post publicado", () => {
  const postagens = [{ rede: "instagram" as const, status: "postado" as const }, { rede: "facebook" as const, status: "erro" as const }];
  expect(jaPostadoEm({ postagens }, ["instagram"])).toBe(true);
  expect(jaPostadoEm({ postagens }, ["instagram", "facebook"])).toBe(false); // o Facebook deu erro: continua programável
  expect(jaPostadoEm({ postagens: [] }, ["instagram"])).toBe(false);
  expect(jaPostadoEm({ postagens }, [])).toBe(false);
});
