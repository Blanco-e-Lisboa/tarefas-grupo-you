// Prova da postar-meta SÓ com Meta falsa, banco falso e Google falso. Nenhuma chamada real.
import { describe, expect, it } from "vitest";
import { JPG, mundo, PNG, TAREFA, TOKEN } from "./mundo-falso.ts";
import { traduzir, ErroMeta } from "./meta.ts";

const pubs = (m: ReturnType<typeof mundo>, rede?: string) => m.meta.estado.publicacoes.filter((p: { rede: string }) => !rede || p.rede === rede);
const video = (n = 300_000) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe("postar-meta: entrada", () => {
  it("só abre com a campainha certa, responde 202 na hora e trabalha em segundo plano", async () => {
    const m = mundo();
    const trabalhos: Promise<unknown>[] = [];
    m.deps.waitUntil = (p) => void trabalhos.push(p);
    const pedir = (segredo: string, corpo: unknown) => m.manipulador(new Request("https://f/postar-meta", { method: "POST", headers: { "x-tarefas-segredo": segredo }, body: JSON.stringify(corpo) }));
    expect((await pedir("errado", { acao: "postar", tarefa_id: TAREFA })).status).toBe(401);
    expect((await pedir("campainha-falsa", { acao: "limpar", tarefa_id: TAREFA })).status).toBe(400);
    expect((await pedir("campainha-falsa", { acao: "postar", tarefa_id: "x; drop" })).status).toBe(400);
    expect(trabalhos).toHaveLength(0);
  });
});

describe("postar-meta: postar", () => {
  it("post agendado sai nas duas redes, o card vai para Postado e as cópias saem do balde", async () => {
    const m = mundo();
    m.card({ formato: "post" }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(pubs(m)).toHaveLength(2);
    expect(m.linha("instagram")).toMatchObject({ status: "postado", link: expect.stringContaining("instagram.com/p/"), conteiner_id: expect.any(String) });
    expect(m.linha("facebook")).toMatchObject({ status: "postado", link: expect.stringContaining("facebook.com/1156670167523861_") });
    expect(m.etapa()).toBe("postado");
    expect(m.balde.size).toBe(0);
    expect(m.alarmes).toEqual([]); // sucesso: quem desarma é o gatilho ao ir para Postado
  });

  it("dois disparos ao mesmo tempo = 1 post por rede (catraca)", async () => {
    const m = mundo();
    m.card({ formato: "post" }, [{ tipo: "imagem", bytes: JPG }]);
    await Promise.all([m.trabalhar(TAREFA), m.trabalhar(TAREFA)]);
    expect(pubs(m, "instagram")).toHaveLength(1);
    expect(pubs(m, "facebook")).toHaveLength(1);
    expect(m.logs.some((l) => l.includes("nada-a-pegar"))).toBe(true);
  });

  it("publicou e a resposta se perdeu: a nova pegada confere na Meta e NÃO publica de novo", async () => {
    const m = mundo();
    m.card({ formato: "post", legenda: "TIMEOUT-PUBLISH", postar_redes: ["instagram"] }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")?.status).toBe("postado"); // já na conferência logo após a queda
    m.b.estado.tabelas.tarefas[0].etapa = "aprovado";
    Object.assign(m.linha("instagram")!, { status: "processando" }); // pior caso: a próxima rodada retoma o mesmo contêiner
    await m.trabalhar(TAREFA);
    expect(pubs(m, "instagram")).toHaveLength(1);
  });

  it("retomada com a Meta fora do ar por um instante: o rascunho fica e NÃO sai um segundo post (achado da Lupa)", async () => {
    const m = mundo();
    m.card({ formato: "post", postar_redes: ["instagram"] }, [{ tipo: "imagem", bytes: JPG }]);
    const chamar = (caminho: string, campos: Record<string, string>) =>
      m.meta.fetch(`https://meta.falsa/v26.0/${caminho}`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: new URLSearchParams(campos) }).then((r: Response) => r.json());
    const { id } = await chamar("17841445114922887/media", { image_url: "", caption: "Legenda do post" });
    await chamar("17841445114922887/media_publish", { creation_id: id }); // publicou, e a gravação de "postado" se perdeu
    m.b.estado.tabelas.postagens.push({ id: "p-instagram", tarefa_id: TAREFA, rede: "instagram", status: "processando", conteiner_id: id, tentativas: 1, rodadas: 1, pego_em: 0 });
    m.meta.estado.falhasDeRede = 1; // a consulta do contêiner cai
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")).toMatchObject({ status: "fila", conteiner_id: id });
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")?.status).toBe("postado");
    expect(pubs(m, "instagram")).toHaveLength(1);
    expect(m.etapa()).toBe("postado");
  });

  it("tudo saiu mas o card não mudou para Postado: a próxima chamada só move o card", async () => {
    const m = mundo();
    m.card({ formato: "post", postar_redes: ["instagram"] }, [{ tipo: "imagem", bytes: JPG }]);
    m.b.estado.tabelas.postagens.push({ id: "p-instagram", tarefa_id: TAREFA, rede: "instagram", status: "postado", conteiner_id: "1", tentativas: 1, rodadas: 1, pego_em: 0 });
    await m.trabalhar(TAREFA);
    expect(m.etapa()).toBe("postado");
    expect(pubs(m)).toHaveLength(0);
  });

  it("erro: tenta sozinho 1 vez (alarme de 10 min), depois para, avisa e desarma", async () => {
    const m = mundo();
    m.card({ formato: "post", legenda: "ERRO-PNG", postar_redes: ["instagram"] }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")).toMatchObject({ status: "fila", erro: null });
    expect(m.alarmes).toEqual(["armar 10"]);
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")).toMatchObject({ status: "erro", erro: expect.stringContaining("só aceita JPG") });
    expect(m.alarmes).toEqual(["armar 10", "desarmar"]);
    expect(m.avisos).toEqual([expect.objectContaining({ tipo: "erro", redes: ["instagram"], titulo: "Card de teste", segredo: "segredo-aviso-falso" })]);
    await m.trabalhar(TAREFA);
    expect(m.logs.at(-1)).toContain("nada-a-pegar");
  });

  it("permissão perdida: não tenta de novo", async () => {
    const m = mundo();
    m.card({ formato: "post", legenda: "ERRO-PERMISSAO", postar_redes: ["instagram"] }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")).toMatchObject({ status: "erro", erro: expect.stringContaining("perdeu acesso") });
    expect(m.avisos).toHaveLength(1);
  });

  it("saiu no Instagram e falhou no Facebook: card fica em Aprovado e a nova tentativa não repete o Instagram", async () => {
    const m = mundo();
    m.meta.estado.recusarFacebook = true;
    m.card({ formato: "post" }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    await m.trabalhar(TAREFA); // a tentativa automática
    expect(m.linha("instagram")?.status).toBe("postado");
    expect(m.linha("facebook")?.status).toBe("erro");
    expect(m.etapa()).toBe("aprovado");
    expect(m.avisos[0]).toMatchObject({ redes: ["facebook"], links: [{ rede: "instagram", link: expect.any(String) }] });
    m.meta.estado.recusarFacebook = false;
    Object.assign(m.linha("facebook")!, { status: "fila", erro: null }); // o que o tentar_de_novo (019) faz
    await m.trabalhar(TAREFA);
    expect(m.linha("facebook")?.status).toBe("postado");
    expect(pubs(m, "instagram")).toHaveLength(1);
    expect(m.etapa()).toBe("postado");
  });

  it("PNG vira JPG só para o Instagram; o Facebook recebe o PNG original", async () => {
    const m = mundo({ verdade: true });
    m.card({ formato: "post" }, [{ tipo: "imagem", bytes: PNG }]);
    let bytesFb: Uint8Array | undefined;
    const guardar = m.balde.set.bind(m.balde);
    m.balde.set = (k, v) => { if (k.includes("/facebook-")) bytesFb = v; return guardar(k, v); };
    await m.trabalhar(TAREFA);
    expect(m.conversoes()).toBe(1);
    expect(pubs(m)).toHaveLength(2); // a Meta falsa recusa imagem não JPEG no Instagram: passou porque converteu
    expect([...bytesFb!.slice(0, 4)]).toEqual([...PNG.slice(0, 4)]);
  });

  it("modo de teste (POSTAR_DE_VERDADE desligado): faz tudo até o rascunho, não publica e não avisa", async () => {
    const m = mundo({ verdade: false });
    m.card({ formato: "post" }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(pubs(m)).toHaveLength(0);
    expect(m.meta.estado.conteineres.size).toBe(1);
    expect(m.linha("instagram")?.erro).toContain("Modo de teste");
    expect(m.avisos).toHaveLength(0);
    expect(m.alarmes).toEqual(["desarmar"]);
  });
});

describe("postar-meta: Reels, Story e carrossel", () => {
  it("Reels com capa própria: cover_url (JPG) e nunca thumb_offset; vídeo vai em fluxo do Drive para a Meta", async () => {
    const m = mundo();
    m.card({ formato: "reels", capa_quadro_ms: 12400 }, [{ tipo: "video", bytes: video() }, { tipo: "imagem", bytes: PNG, papel: "capa" }]);
    await m.trabalhar(TAREFA);
    const [c] = [...m.meta.estado.conteineres.values()];
    expect(c.campos).toMatchObject({ media_type: "REELS", upload_type: "resumable", cover_url: expect.any(String) });
    expect(c.campos.thumb_offset).toBeUndefined();
    expect(c.recebido).toBe(300_000);
    // 28/10: caminho oficial de arquivo hospedado: o vídeo não vai no corpo, a Meta baixa pelo link assinado (file_url)
    expect(m.corposRupload.every((b) => b === undefined)).toBe(true);
    expect(m.meta.estado.links).toHaveLength(2); // Instagram e Facebook
    expect(m.meta.estado.links.every((l: string) => l.includes("/functions/v1/postar-meta?video=a0&ate=") && l.includes("&sig="))).toBe(true);
    expect(pubs(m, "facebook")[0]).toMatchObject({ tipo: "video_reels" });
    expect(m.linha("facebook")?.link).toContain("facebook.com/reel/");
    expect(m.etapa()).toBe("postado");
  });

  it("link do vídeo: entrega o arquivo inteiro com o tamanho; assinatura errada ou vencida, 403; arquivo que não é vídeo, 404", async () => {
    const m = mundo();
    m.card({ formato: "reels" }, [{ tipo: "video", bytes: video(50_000) }, { tipo: "imagem", bytes: JPG, papel: "capa" }]);
    await m.trabalhar(TAREFA);
    const link = m.meta.estado.links[0] as string;
    const ok = await m.manipulador(new Request(link));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-length")).toBe("50000");
    expect((await ok.arrayBuffer()).byteLength).toBe(50_000);
    expect((await m.manipulador(new Request(link, { method: "HEAD" }))).headers.get("content-length")).toBe("50000");
    expect((await m.manipulador(new Request(link.replace(/sig=\w+/, `sig=${"0".repeat(64)}`)))).status).toBe(403);
    expect((await m.manipulador(new Request(link.replace("video=a0", "video=a1")))).status).toBe(403); // a assinatura é do vídeo, não vale para a capa
    m.avancar(3 * 3600_000);
    expect((await m.manipulador(new Request(link))).status).toBe(403); // venceu (2 h)
  });

  it("Reels sem capa própria com quadro escolhido: thumb_offset", async () => {
    const m = mundo();
    m.card({ formato: "reels", capa_quadro_ms: 12400, postar_redes: ["instagram"] }, [{ tipo: "video", bytes: video() }]);
    await m.trabalhar(TAREFA);
    const [c] = [...m.meta.estado.conteineres.values()];
    expect(c.campos).toMatchObject({ thumb_offset: "12400" });
    expect(c.campos.cover_url).toBeUndefined();
  });

  it("vídeo que a Meta não termina: processando + alarme de 5 min; na 6ª rodada vira erro, avisa e desarma", async () => {
    const m = mundo({ conferencias: 10_000 });
    m.card({ formato: "reels", postar_redes: ["instagram"] }, [{ tipo: "video", bytes: video() }]);
    for (let i = 0; i < 5; i++) {
      await m.trabalhar(TAREFA);
      expect(m.linha("instagram")?.status).toBe("processando");
    }
    expect(m.meta.estado.conteineres.size).toBe(1); // retomou o mesmo contêiner, sem reenviar
    await m.trabalhar(TAREFA);
    expect(m.linha("instagram")).toMatchObject({ status: "erro", erro: expect.stringContaining("travou") });
    expect(m.alarmes).toEqual([...Array(5).fill("armar 5"), "desarmar"]);
    expect(m.avisos).toHaveLength(1);
    expect(pubs(m)).toHaveLength(0);
  });

  it("Story de imagem nas duas redes, sem legenda no Instagram", async () => {
    const m = mundo();
    m.card({ formato: "story" }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    const [c] = [...m.meta.estado.conteineres.values()];
    expect(c.campos).toMatchObject({ media_type: "STORIES" });
    expect(c.campos.caption).toBeUndefined();
    expect(pubs(m, "facebook")[0]).toMatchObject({ tipo: "photo_story" });
  });

  it("carrossel com vídeo: itens do Instagram (vídeo retomável) e Facebook recusado sem nova tentativa", async () => {
    const m = mundo();
    m.card({ formato: "carrossel" }, [{ tipo: "imagem", bytes: PNG }, { tipo: "video", bytes: video(1000) }]);
    await m.trabalhar(TAREFA);
    const itens = [...m.meta.estado.conteineres.values()].filter((c) => c.campos.is_carousel_item === "true");
    expect(itens.map((c) => c.campos.media_type ?? "IMAGEM")).toEqual(["IMAGEM", "VIDEO"]);
    expect(pubs(m, "instagram")[0]).toMatchObject({ tipo: "CAROUSEL" });
    expect(m.linha("facebook")).toMatchObject({ status: "erro", erro: expect.stringContaining("só vai para o Instagram") });
  });

  it("Facebook publica as fotos e responde HTTP 500: estado incerto, sem segundo post (achado da Lupa)", async () => {
    const m = mundo();
    m.meta.estado.feedPublicaE500 = true;
    m.card({ formato: "post", postar_redes: ["facebook"] }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(m.linha("facebook")).toMatchObject({ status: "erro", erro: expect.stringContaining("Estado incerto") });
    await m.trabalhar(TAREFA);
    expect(pubs(m, "facebook")).toHaveLength(1);
  });

  it("Facebook recusa as fotos com 4xx: nada saiu, tenta de novo 1 vez do zero", async () => {
    const m = mundo();
    m.card({ formato: "post", legenda: "ERRO-PNG", postar_redes: ["facebook"] }, [{ tipo: "imagem", bytes: JPG }]);
    await m.trabalhar(TAREFA);
    expect(m.linha("facebook")).toMatchObject({ status: "fila", conteiner_id: null });
    await m.trabalhar(TAREFA);
    expect(m.linha("facebook")).toMatchObject({ status: "erro", erro: expect.stringContaining("A Meta recusou") });
    expect(pubs(m)).toHaveLength(0);
  });

  it("Facebook caiu depois de subir as fotos: estado incerto, nunca reposta às cegas", async () => {
    const m = mundo();
    m.card({ formato: "post", postar_redes: ["facebook"] }, [{ tipo: "imagem", bytes: JPG }]);
    m.b.estado.tabelas.postagens.push({ id: "p-facebook", tarefa_id: TAREFA, rede: "facebook", status: "enviando", conteiner_id: "fotos:9001", tentativas: 1, rodadas: 1, pego_em: 0 });
    await m.trabalhar(TAREFA);
    expect(m.linha("facebook")).toMatchObject({ status: "erro", erro: expect.stringContaining("Confira a página"), conteiner_id: null });
    expect(pubs(m)).toHaveLength(0);
  });
});

describe("postar-meta: a chave", () => {
  it("nunca aparece em log, endereço, banco ou aviso; só no cabeçalho", async () => {
    const m = mundo();
    m.meta.estado.recusarFacebook = true;
    m.card({ formato: "reels" }, [{ tipo: "video", bytes: video(5000) }]);
    await m.trabalhar(TAREFA);
    await m.trabalhar(TAREFA);
    const tudo = JSON.stringify({ logs: m.logs, banco: m.b.estado.tabelas, avisos: m.avisos, urls: m.meta.estado.chamadas.map((c: { url: string }) => c.url) });
    expect(tudo).not.toContain(TOKEN);
    expect(m.meta.estado.chamadas.filter((c: { auth: string }) => c.auth.includes(TOKEN)).length).toBeGreaterThan(0);
  });

  it("a tradução do erro tira endereço assinado e a chave", () => {
    const t = traduzir(new ErroMeta(400, 1, 0, `falhou ${TOKEN} em https://x/sign/a?token=abc`), TOKEN);
    expect(t.erro).not.toContain(TOKEN);
    expect(t.erro).not.toContain("token=abc");
  });
});

describe("239: a tela pergunta se a postar-meta está em MODO DE TESTE", () => {
  const modo = (m: ReturnType<typeof mundo>, token?: string, extra: Record<string, string> = {}) =>
    m.manipulador(new Request("https://f/postar-meta", { method: "POST", headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), origin: "https://app", ...extra }, body: JSON.stringify({ acao: "modo" }) }));
  it("logado: responde só { deVerdade } (true só com POSTAR_DE_VERDADE=sim) e nenhum segredo", async () => {
    const real = mundo({ verdade: true });
    real.b.estado.usuarios.set("tok-natham", "u-natham");
    const r = await modo(real, "tok-natham");
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ deVerdade: true });
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    const teste = mundo({ verdade: false });
    teste.b.estado.usuarios.set("tok-natham", "u-natham");
    const t = await modo(teste, "tok-natham");
    expect(await t.json()).toEqual({ deVerdade: false });
    const corpo = JSON.stringify(await (await modo(teste, "tok-natham")).json());
    expect(corpo).not.toContain(TOKEN); // nada de chave da Meta
  });
  it("só 'sim' vale: outro valor (vazio, 'nao', 'SIM') é modo de teste", async () => {
    for (const v of ["nao", "", "SIM", "true"]) {
      const m = mundo({ env: { POSTAR_DE_VERDADE: v } });
      m.b.estado.usuarios.set("tok-natham", "u-natham");
      expect(await (await modo(m, "tok-natham")).json()).toEqual({ deVerdade: false });
    }
  });
  it("sem login ou com login que o banco não conhece: 401, e sem a resposta de modo", async () => {
    const m = mundo({ verdade: true });
    expect((await modo(m)).status).toBe(401);
    expect((await modo(m, "tok-qualquer")).status).toBe(401);
  });
  it("responde ao preflight do navegador (OPTIONS) e não abre o postar sem campainha", async () => {
    const m = mundo();
    const pre = await m.manipulador(new Request("https://f/postar-meta", { method: "OPTIONS" }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-headers")).toContain("authorization");
    const sem = await m.manipulador(new Request("https://f/postar-meta", { method: "POST", body: JSON.stringify({ acao: "postar", tarefa_id: TAREFA }) }));
    expect(sem.status).toBe(401);
  });
});
