// Função `postar-meta`: o alarme do card (019) chama; ela responde 202 na hora e trabalha em segundo plano.
// Sem Deno aqui dentro (index.ts liga o servidor): roda igual no Vitest com o banco, o Drive e a Meta falsos.
// Log: só tarefa, rede, etapa e código. Nunca a chave, nunca o pedido inteiro.
import { assinar, conferir, iguais } from "../_shared/google.ts";
import { assinaturaDe, criarBanco, type Arq, type Banco, type Card, type Linha } from "./banco.ts";
import { criarMeta, ErroCancelado, ErroDescartado, ErroIncerto, ErroLocal, traduzir, VERSAO } from "./meta.ts";
import { facebook, instagram, pedidoNaMeta, type Ctx, type Resultado } from "./redes.ts";

type Busca = typeof fetch;
export type Deps = {
  env: (n: string) => string | undefined;
  fetch: Busca;
  baixarDrive: (driveId: string, range?: string) => Promise<Response>;
  duracaoDrive: (driveId: string) => Promise<number | undefined>;
  paraJpg: (png: Uint8Array) => Promise<Uint8Array>;
  waitUntil: (p: Promise<unknown>) => void;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  log?: (linha: string) => void;
};
type Fim = "postado" | "processando" | "fila" | "erro" | "cancelado";

/** 1 entrega + até 4 conferências (vídeo processando ou função que caiu); passou disso, para com erro e aviso (combinado com a Alvenaria). */
export const RODADAS_MAX = 5;
const PRAZO_MS = 300_000; // a função vive até 400 s; conferências dentro da mesma execução param em 5 min
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const vazio = (status: number) => new Response(null, { status });
const INCERTO_CANCELADO = "Estado incerto: a programação saiu no meio da postagem. Confira a rede antes de tentar de novo.";
const VALIDADE_LINK = 2 * 3600_000; // a Meta baixa o vídeo no tempo dela; cobre as rodadas de conferência (5 x 12 min)
const textoLink = (arquivo: string, ate: number) => `video.${arquivo}.${ate}`; // prefixo próprio: não vale como link da função drive

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

export function criarManipulador(d: Deps) {
  const trabalhar = criarTrabalho(d);
  /** 239 · A tela pergunta "está em modo de teste?" (POSTAR_DE_VERDADE). Responde SÓ um verdadeiro/falso (nenhum segredo), e só para quem está logado. */
  async function modo(req: Request): Promise<Response> {
    const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
    const r = token ? await d.fetch(`${d.env("SUPABASE_URL")}/auth/v1/user`, { headers: { apikey: d.env("SUPABASE_ANON_KEY") ?? "", authorization: `Bearer ${token}` } }).catch(() => null) : null;
    if (!r?.ok) return new Response(JSON.stringify({ erro: "Entre no sistema." }), { status: 401, headers: { ...CORS, "content-type": "application/json" } });
    return new Response(JSON.stringify({ deVerdade: d.env("POSTAR_DE_VERDADE") === "sim" }), { status: 200, headers: { ...CORS, "content-type": "application/json" } });
  }
  /** O link que a Meta baixa (file_url): só com assinatura válida e dentro do prazo. Entrega o vídeo INTEIRO do Drive (ou o pedaço
      que a Meta pedir por Range), com o tamanho que o Drive informa. */
  async function servirVideo(req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams;
    const id = q.get("video") ?? "", ate = Number(q.get("ate")), sig = q.get("sig") ?? "";
    const banco = criarBanco(d.env, d.fetch);
    const segredo = await banco.segredo("tarefas_funcoes_segredo").catch(() => null);
    if (!segredo || !(ate > (d.agora ?? Date.now)()) || !(await conferir(segredo, textoLink(id, ate), sig))) return vazio(403);
    const a = await banco.arquivo(id).catch(() => undefined); // id já veio assinado por nós
    if (!a?.drive_id || a.tipo !== "video") return vazio(404);
    const r = await d.baixarDrive(a.drive_id, req.headers.get("range") ?? undefined).catch(() => null);
    if (!r) return vazio(502);
    const h = new Headers({ "accept-ranges": "bytes" });
    for (const n of ["content-type", "content-length", "content-range"]) { const v = r.headers.get(n); if (v) h.set(n, v); }
    // Log do que a Meta pediu e de quanto foi entregue (só números: nada do link nem da chave)
    const escrever = d.log ?? ((l: string) => console.log(l));
    const pedido = { etapa: "link", arquivo: id, metodo: req.method, range: req.headers.get("range"), status: r.status, tamanho: h.get("content-length"), tipo: h.get("content-type") };
    if (req.method === "HEAD") { await r.body?.cancel(); escrever(JSON.stringify(pedido)); return new Response(null, { status: r.status, headers: h }); }
    let enviado = 0;
    const contar = new TransformStream<Uint8Array, Uint8Array>({
      transform(parte, c) { enviado += parte.length; c.enqueue(parte); },
      flush() { escrever(JSON.stringify({ ...pedido, enviado, fim: "completo" })); },
      cancel() { escrever(JSON.stringify({ ...pedido, enviado, fim: "cortado" })); },
    } as Transformer<Uint8Array, Uint8Array>);
    return new Response(r.body?.pipeThrough(contar), { status: r.status, headers: h });
  }
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if ((req.method === "GET" || req.method === "HEAD") && new URL(req.url).searchParams.has("video")) return servirVideo(req);
    if (req.method !== "POST") return vazio(405);
    if (req.headers.get("x-tarefas-segredo") === null && (await req.clone().json().catch(() => null))?.acao === "modo") return modo(req);
    const certo = await criarBanco(d.env, d.fetch).segredo("tarefas_funcoes_segredo").catch(() => null);
    if (!certo || !(await iguais(req.headers.get("x-tarefas-segredo") ?? "", certo))) return vazio(401);
    const corpo = (await req.json().catch(() => null)) as { acao?: string; tarefa_id?: string } | null;
    if (corpo?.acao !== "postar" || !UUID.test(corpo.tarefa_id ?? "")) return vazio(400);
    d.waitUntil(trabalhar(corpo.tarefa_id!));
    return vazio(202);
  };
}

export function criarTrabalho(d: Deps) {
  const agora = d.agora ?? Date.now;
  const dormir = d.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const escrever = d.log ?? ((l: string) => console.log(l));
  const igId = d.env("META_IG_ID") ?? "17841445114922887";
  const pageId = d.env("META_PAGE_ID") ?? "1156670167523861";

  return async function trabalhar(tarefa: string): Promise<void> {
    const log = (rede: string | null, etapa: string, codigo?: string | number) =>
      escrever(JSON.stringify({ tarefa, ...(rede ? { rede } : {}), etapa, ...(codigo !== undefined ? { codigo } : {}) }));
    try {
      await rodar(tarefa, log);
    } catch (e) {
      // Linhas ficam em "enviando": o sentinela do banco (+12 min) chama de novo e a catraca retoma depois de 10 min.
      log(null, "caiu", e instanceof Error ? e.name : "desconhecido");
    }
  };

  async function rodar(tarefa: string, log: (rede: string | null, etapa: string, codigo?: string | number) => void) {
    const prazo = agora() + PRAZO_MS;
    const banco = criarBanco(d.env, d.fetch);
    const linhas = await banco.pegar(tarefa);
    if (!linhas.length) {
      // Nada a pegar: outra execução está nisso, ou tudo já saiu e só faltou mover o card (a mudança para Postado falhou antes).
      return log(null, (await concluir(banco, tarefa)) === "postado" ? "card-postado" : "nada-a-pegar");
    }
    const token = d.env("META_PUBLISHER_TOKEN") ?? "";
    const meta = criarMeta({ base: d.env("META_BASE") ?? `https://graph.facebook.com/${VERSAO}`, rupload: d.env("RUPLOAD_BASE") ?? "https://rupload.facebook.com", token, fetch: d.fetch });
    const [card, arqs] = await Promise.all([banco.card(tarefa), banco.arquivos(tarefa)]);
    const assinatura = assinaturaDe(card, arqs); // N2: o conteúdo de agora; vai junto do rascunho ("<rascunho>|<assinatura>")
    const comAssinatura = (conteiner: string) => `${conteiner}|${assinatura}`;
    let tokenPg: Promise<string> | undefined; // chave da página: pedida uma vez, só em memória
    const tokenPagina = () => (tokenPg ??= meta.get<{ access_token: string }>(pageId, "access_token").then((r) => r.access_token));
    let segredoLink: Promise<string | null> | undefined;
    const linkVideo = async (a: Arq) => {
      const s = await (segredoLink ??= banco.segredo("tarefas_funcoes_segredo"));
      if (!s) throw new ErroLocal("Falta o segredo das funções no banco (tarefas_funcoes_segredo).");
      const ate = agora() + VALIDADE_LINK;
      return `${d.env("SUPABASE_URL")}/functions/v1/postar-meta?video=${a.id}&ate=${ate}&sig=${await assinar(s, textoLink(a.id, ate))}`;
    };
    const copias: string[] = [];

    async function umaRede(l: Linha): Promise<Fim> {
      const logRede = (etapa: string, codigo?: string | number) => log(l.rede, etapa, codigo);
      // A5 (pente fino r1): o card deixou de valer. Nada pedido à Meta = a linha sai (o rascunho vence sozinho) e a próxima programação começa do zero.
      // Pós-Codex (bug 1): rascunho já pedido à Meta (pub:, video-pub:, fotos:) NUNCA se apaga: vira "estado incerto" e guarda o rascunho, para a retomada conferir.
      const cancelar = async (conteiner: string | null): Promise<Fim> => {
        if (pedidoNaMeta(conteiner)) await banco.gravar(l.id, { status: "erro", erro: INCERTO_CANCELADO });
        else await banco.apagarLinha(l.id);
        logRede("cancelado");
        return "cancelado";
      };
      // N2 (r3): rascunho ainda NÃO pedido à Meta, feito com outro conteúdo (legenda, mídia ou capa mudaram no card): descarta e refaz.
      // Já pedido (pub:, video-pub:, fotos:): nunca se refaz (seria um segundo post). N2 (r4): sem assinatura (linha de antes do r3) também
      // se refaz; o rascunho solto do Instagram antes passa pela Meta (pode já ter saído e a gravação de "postado" se perdido).
      const [marca, dele] = (l.conteiner_id ?? "").split("|");
      l.conteiner_id = marca || null;
      const conferirVelho = !!l.conteiner_id && dele === undefined && l.rede === "instagram" && !/^(pub:|filhos:)/.test(l.conteiner_id);
      if (l.conteiner_id && dele !== assinatura && !pedidoNaMeta(l.conteiner_id) && !conferirVelho) { logRede("rascunho-velho"); l.conteiner_id = null; }
      const pegouCom = l.conteiner_id; // o ErroCancelado vem sempre ANTES de pedir nesta rodada: vale o que já estava pedido ao pegar
      logRede("pegou", l.rodadas);
      let r: Resultado;
      try {
        if (!token) throw new ErroLocal("Falta a chave da Meta no servidor (Secrets).");
        if (l.rodadas > RODADAS_MAX) throw new ErroLocal("Estado incerto: a postagem travou (a Meta não terminou de processar ou a função caiu várias vezes). Confira a rede antes de tentar de novo.");
        const c: Ctx = {
          meta, banco, card, arqs, linha: l, verdade: d.env("POSTAR_DE_VERDADE") === "sim", igId, pageId, prazo, agora, dormir,
          baixarDrive: d.baixarDrive, duracaoDrive: d.duracaoDrive, aindaVale: () => banco.aindaVale(tarefa, agora(), l.rede, assinatura),
          paraJpg: d.paraJpg, tokenPagina, linkVideo, copias, log: logRede, conferirVelho,
          salvar: async (conteiner) => {
            await banco.gravar(l.id, { conteiner_id: comAssinatura(conteiner) });
            l.conteiner_id = conteiner;
          },
        };
        r = l.rede === "instagram" ? await instagram(c) : await facebook(c);
      } catch (e) {
        if (e instanceof ErroCancelado) return cancelar(pegouCom);
        const t = traduzir(e, token);
        // A mensagem vai junto (já sem chave nem links, ver traduzir): erro que volta para a fila não grava nada no banco (1º teste, 28/10)
        logRede("erro", `${(e as { codigo?: number }).codigo ?? (e instanceof Error ? e.name : "desconhecido")} · ${t.erro}`);
        // O rascunho só sai quando a Meta o descartou ou o Natham vai conferir (estado incerto). Fora isso ele fica, e a retomada
        // (inclusive o Tentar de novo) confere na Meta antes de publicar: uma falha passageira nunca vira um segundo post.
        const rascunho = e instanceof ErroDescartado || e instanceof ErroIncerto ? { conteiner_id: null } : {};
        if (t.repetir && l.tentativas < 2) {
          await banco.gravar(l.id, { status: "fila", erro: null, ...rascunho });
          return "fila";
        }
        await banco.gravar(l.id, { status: "erro", erro: t.erro, ...rascunho });
        await avisar(banco, card, l, t.erro, tarefa, logRede);
        return "erro";
      }
      if (r.fim === "postado") {
        await banco.gravar(l.id, { status: "postado", post_id: r.post_id, link: r.link, postado_em: new Date(agora()).toISOString(), erro: null });
        logRede("postado");
        return "postado";
      }
      if (r.fim === "processando") {
        if (!(await banco.aindaVale(tarefa, agora(), l.rede, assinatura))) return cancelar(r.conteiner_id); // A5/N1/N2: saiu de Aprovado, a rede saiu ou o conteúdo mudou
        await banco.gravar(l.id, { status: "processando", conteiner_id: comAssinatura(r.conteiner_id) });
        logRede("processando");
        return "processando";
      }
      await banco.gravar(l.id, { status: "erro", erro: "Modo de teste: parou antes de publicar (nada saiu na rede).", conteiner_id: null });
      logRede("teste");
      return "erro"; // modo de teste não avisa ninguém
    }

    const fins = await Promise.all(linhas.map(umaRede));

    if (!fins.includes("processando")) {
      // Cópias de minutos saem quando ninguém mais precisa delas (inclusive as de rodadas anteriores: o nome é previsível).
      const todas = arqs.filter((a) => a.tipo === "imagem").flatMap((a) => ["instagram", "facebook"].flatMap((r) => [`${tarefa}/${r}-${a.id}.jpg`, `${tarefa}/${r}-${a.id}.png`]));
      await banco.apagarCopias([...new Set([...copias, ...todas])]).catch(() => log(null, "copias-ficaram"));
    }
    let falta = false;
    if (fins.includes("postado")) {
      try {
        const fim = await concluir(banco, tarefa);
        if (fim === "postado") return log(null, "card-postado");
        falta = fim === "falta";
      } catch {
        log(null, "mover-falhou");
        return void (await banco.armar(tarefa, 5)); // a próxima chamada não pega linha nenhuma e só move o card
      }
    }
    if (fins.includes("processando")) await banco.armar(tarefa, 5);
    else if (fins.includes("fila")) await banco.armar(tarefa, 10);
    else if (falta) await banco.armar(tarefa, 1); // novo 1 (r4): rede acrescentada durante a publicação; a próxima volta a posta
    else if (!fins.includes("cancelado")) await banco.desarmar(tarefa); // pós-Codex (bug 5): cancelado não desarma; o banco cuida do alarme (vídeo pendente rearma)
  }

  /** Todas as redes escolhidas AGORA saíram: move para Postado (o banco desarma o alarme e arma a limpeza de 7 dias).
      Novo 1 (r4): as redes são relidas aqui, não as do começo da volta. 'falta' = rede escolhida sem linha (acrescentada no meio). */
  async function concluir(banco: Banco, tarefa: string): Promise<"postado" | "falta" | "espera"> {
    const fim = await banco.concluir(tarefa);
    if (fim) return fim;
    // banco sem o 039: o mesmo, em duas gravações (a janela entre ler e mover é de milissegundos)
    const [card, redes] = await Promise.all([banco.card(tarefa), banco.redes(tarefa)]);
    if (!card) return "espera";
    if (card.postar_redes.some((r) => !redes.some((p) => p.rede === r))) return "falta";
    if (!card.postar_redes.every((r) => redes.some((p) => p.rede === r && p.status === "postado"))) return "espera";
    await banco.moverParaPostado(tarefa);
    return "postado";
  }

  /** WhatsApp do Natham via n8n (brief: docs/levas/N8N-AVISO-POSTAGEM-BRIEF.md). Sem endereço cadastrado: só não avisa. */
  async function avisar(banco: Banco, card: Card, l: Linha, motivo: string, tarefa: string, log: (etapa: string) => void) {
    try {
      const url = await banco.segredo("tarefas_aviso_url");
      if (!url) return;
      const segredo = (await banco.segredo("tarefas_aviso_segredo")) ?? "";
      const links = (await banco.redes(tarefa)).filter((p) => p.status === "postado" && p.link).map((p) => ({ rede: p.rede, link: p.link }));
      const r = await d.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-tarefas-segredo": segredo },
        body: JSON.stringify({ tipo: "erro", tarefa_id: tarefa, titulo: card.titulo, redes: [l.rede], motivo, links }),
      });
      log(r.ok ? "avisou" : "aviso-recusado");
    } catch {
      log("aviso-falhou");
    }
  }
}
