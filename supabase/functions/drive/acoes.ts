// Função `drive`: tudo que mexe no Google Drive em nome do app. Sem Deno aqui dentro (index.ts é quem liga o servidor): roda igual no Vitest.
// Duas chaves: a do USUÁRIO (as travas do banco decidem se pode) e a de SERVIÇO (só para gravar o que só esta função grava).
import { assinar, conferir, iguais } from "../_shared/google.ts";
import { chaves, FORMATOS, formatoValido } from "../_shared/pastas.ts";
import type { DriveApi } from "./drive-api.ts";
import { ErroDrive } from "./drive-api.ts";
import { limitarRange, MAX_BYTES, NAO_RECONHECI, nomeOk, Recusa, SO_TEMA, texto, tipoReal, TIPOS } from "./comum.ts";
import { criarPastaLivre } from "./pasta-livre.ts";
import { COLUNAS_CARD, criarPastas, type Card, type Tema } from "./pastas-drive.ts";
import { criarRest, ErroRest, semFuncao, type Rest } from "./rest.ts";

type Busca = typeof fetch;
export type Deps = {
  env: (n: string) => string | undefined;
  fetch: Busca;
  api: DriveApi;
  baixar: (driveId: string, range?: string | null) => Promise<Response>;
  agora?: () => number;
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-expose-headers": "content-range, accept-ranges, content-length",
};
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });
const FORMATOS_E_SEM = [...FORMATOS, null];

export { limitarRange, PEDACO_VIDEO } from "./comum.ts";
export function criarManipulador(d: Deps) {
  const agora = d.agora ?? Date.now;
  const url = () => d.env("SUPABASE_URL")!;
  const servico = (): Rest => criarRest(url(), d.env("SUPABASE_SERVICE_ROLE_KEY")!, d.env("SUPABASE_SERVICE_ROLE_KEY")!, d.fetch);
  const doUsuario = (token: string): Rest => criarRest(url(), d.env("SUPABASE_ANON_KEY")!, token, d.fetch);
  let segredoMemo: string | undefined;
  async function segredo(): Promise<string> {
    segredoMemo ??= (await servico().rpc<string | null>("ler_segredo_servico", { p_nome: "tarefas_funcoes_segredo" })) ?? undefined;
    if (!segredoMemo) throw new Recusa(500, "Segredo interno ausente");
    return segredoMemo;
  }

  /** Quem está chamando: o Supabase confere a chave; devolve a pessoa (id e slug) ligada ao login. */
  async function pessoaDe(token: string) {
    const r = await d.fetch(`${url()}/auth/v1/user`, { headers: { apikey: d.env("SUPABASE_ANON_KEY")!, authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Recusa(401, "Entre de novo no sistema.");
    const { id } = (await r.json()) as { id: string };
    const [p] = await servico().ler<{ id: string; slug: string }>("pessoas", { user_id: id }, "id,slug");
    if (!p) throw new Recusa(403, "Seu login não está ligado a uma pessoa.");
    return p;
  }
  const exigir = (ok: unknown, status: number, msg: string) => { if (ok !== true) throw new Recusa(status, msg); };

  const { pastaEmpresa, renomearConteudos, temaDe, novoTema, pastaDeTema, cardDe, pastaDoConteudo, rearmarLimpeza, tirarPastaDoConteudo, esvaziar } = criarPastas(d, servico);
  const livres = criarPastaLivre(d, servico, pastaEmpresa);

  /** Valida o destino de um documento solto: pessoa com login (o banco decide), empresa visível, formato válido, tema da mesma empresa. */
  async function pedidoDePasta(c: Record<string, unknown>, eu: Rest) {
    const empresa = texto(c.empresa_id);
    const formato = c.formato == null || c.formato === "" ? undefined : c.formato;
    if (!empresa || (formato !== undefined && !formatoValido(formato))) throw new Recusa(400, "Pasta inválida.");
    exigir(await eu.rpc("pode_mexer_pastas"), 403, "Você não pode mexer nas pastas.");
    if (!(await eu.ler("empresas", { id: empresa }, "id")).length) throw new Recusa(403, "Empresa não encontrada.");
    const tema = await temaDe(texto(c.ocasiao_id), empresa);
    if (c.ocasiao_id && !tema) throw new Recusa(404, "Tema não encontrado.");
    return { empresa, formato: formato as string | undefined, tema, destino: `${empresa}|${chaves.formato(empresa, formato)}|${tema?.id ?? "sem"}` };
  }

  // ---- ações ----
  type Corpo = Record<string, unknown>;
  async function comUsuario(acao: string, c: Corpo, token: string, origem: string): Promise<unknown> {
    const pessoa = await pessoaDe(token);
    const eu = doUsuario(token);
    const tarefaId = texto(c.tarefa_id);
    const podeMexer = async (id: string) => exigir(await eu.rpc("pode_mexer_anexos", { p_tarefa: id }), 403, "Você não pode mexer nos anexos deste card.");
    switch (acao) {
      case "sessao_envio": {
        const nome = nomeOk(c.nome, 200), tipo = texto(c.tipo), papel = texto(c.papel) ?? "anexo", tamanho = Number(c.tamanho);
        const mime = texto(c.mime) ?? "application/octet-stream";
        if (!tarefaId || !nome || !tipo || !TIPOS.includes(tipo) || !(tamanho > 0 && tamanho <= MAX_BYTES) || !["anexo", "capa"].includes(papel) || (papel === "capa" && tipo !== "imagem")
          || (tipo === "imagem" && !mime.startsWith("image/")) || (tipo === "video" && !mime.startsWith("video/"))) throw new Recusa(400, "Pedido de envio inválido.");
        await podeMexer(tarefaId);
        const pasta = (await pastaDoConteudo(await cardDe(tarefaId))).id;
        return { sessao_url: await d.api.abrirSessao(pasta, nome, mime, tamanho, origem, { tarefa: tarefaId }) };
      }
      case "confirmar_envio": {
        const driveId = texto(c.drive_id), nome = nomeOk(c.nome, 200), tipo = texto(c.tipo), papel = texto(c.papel) ?? "anexo", tamanho = Number(c.tamanho), ordem = Number(c.ordem ?? 0);
        if (!tarefaId || !driveId || !nome || !tipo || !TIPOS.includes(tipo) || !(tamanho > 0) || !["anexo", "capa"].includes(papel) || !Number.isInteger(ordem)) throw new Recusa(400, "Confirmação inválida.");
        await podeMexer(tarefaId);
        const s = servico(), envio = c.envio_id ? String(c.envio_id) : undefined;
        const jaChegou = async (id: string) => { if (envio) await s.rpc("video_chegou", { p_tarefa: tarefaId, p_envio: envio }).catch(semFuncao); return { arquivo_id: id }; }; // novo 3 (r4, 039): já registrado (repetição ou retomada), o envio sai da lista igual
        const [ja] = await s.ler<{ id: string; tarefa_id: string }>("arquivos", { drive_id: driveId }, "id,tarefa_id");
        if (ja) {
          if (ja.tarefa_id !== tarefaId) throw new Recusa(409, "Este arquivo já pertence a outro card.");
          return await jaChegou(ja.id); // repetição do mesmo pedido
        }
        const card = await cardDe(tarefaId);
        const f = await d.api.ver(driveId).catch((e: unknown) => {
          if (e instanceof ErroDrive && e.status === 404) throw new Recusa(410, "O arquivo não existe mais no Drive."); // a tela pode descartar a anotação do envio
          throw e;
        });
        if (f.trashed) throw new Recusa(410, "O arquivo foi para a lixeira do Drive.");
        // Só confirma o envio que a sessão abriu PARA ESTE card (a etiqueta `tarefa` vai no arquivo na abertura da sessão). Outro card, outra empresa ou arquivo que não é nosso: só recusa, nunca mexe nele.
        if (f.mimeType === "application/vnd.google-apps.folder" || f.appProperties?.tarefa !== tarefaId) throw new Recusa(422, "Este arquivo não foi enviado para este card.");
        if (Number(f.size) !== tamanho) {
          await d.api.lixeira(driveId).catch(() => {}); // é um envio nosso que ficou pela metade: não serve, vai para a lixeira em vez de ficar solto
          throw new Recusa(422, "O arquivo não chegou inteiro ao Drive. Tente de novo.");
        }
        const real = tipoReal(new Uint8Array(await (await d.baixar(driveId, "bytes=0-15")).arrayBuffer()), tipo, f.mimeType ?? ""); // B3 e F10 (ver comum.ts)
        if (!real || (papel === "capa" && real !== "imagem")) {
          await d.api.lixeira(driveId).catch(() => {});
          throw new Recusa(422, real ? "A capa precisa ser uma imagem." : NAO_RECONHECI);
        }
        // M14 (pente fino r1): troca de capa. A velha só sai depois de a nova passar em todas as conferências, e a pasta do conteúdo nunca sai junto.
        const [velho] = c.substitui_arquivo_id ? await s.ler<{ id: string; tarefa_id: string; papel: string; drive_id: string | null; caminho: string | null }>(
          "arquivos", { id: String(c.substitui_arquivo_id) }, "id,tarefa_id,papel,drive_id,caminho") : [];
        if (velho && (velho.tarefa_id !== tarefaId || velho.papel !== papel)) throw new Recusa(409, "O anexo a trocar não é deste card.");
        // A ocasião do card pode ter mudado durante o envio: o arquivo é bom, então SEGUE para a pasta atual do card (não se descarta nem se deixa na antiga sem registro)
        const pasta = (await pastaDoConteudo(card)).id; // só depois das recusas: pedido recusado não cria ocasião nem pasta
        if (!f.parents?.includes(pasta)) await d.api.mover(driveId, pasta, f.parents ?? []);
        if (velho) {
          // F4 (pente fino r2): numa gravação só, a linha da capa passa a apontar para o arquivo novo; se falhar, nada mudou e a capa velha segue.
          // Só depois o arquivo velho sai (se a lixeira falhar, ele fica solto no Drive, mas o card já está com a capa nova).
          await s.atualizar("arquivos", { id: velho.id }, { drive_id: driveId, caminho: null, nome, tipo: real, tamanho, ordem, criado_por: pessoa.id });
          if (velho.drive_id) await d.api.lixeira(velho.drive_id).catch(() => console.error(JSON.stringify({ funcao: "drive", acao: "capa-velha-na-lixeira", erro: "falhou" })));
          if (velho.caminho) await s.removerObjetos("arquivos", [velho.caminho]).catch(() => console.error(JSON.stringify({ funcao: "drive", acao: "capa-velha-storage", erro: "falhou" })));
          return { arquivo_id: velho.id };
        }
        const linha = { tarefa_id: tarefaId, drive_id: driveId, nome, tipo: real, tamanho, papel, ordem, criado_por: pessoa.id };
        try {
          const id = envio && (await s.rpc<string>("registrar_video", { p_tarefa: tarefaId, p_envio: envio, p_linha: linha }).catch(semFuncao)); // A7 (r4, 039): registra e sai da lista juntos; sem o 039, caminho do 038
          if (id) return { arquivo_id: id };
          if (envio) await s.rpc("video_chegando", { p_tarefa: tarefaId, p_envio: envio }).catch(semFuncao);
          return { arquivo_id: (await s.inserir<{ id: string }>("arquivos", linha))[0].id };
        } catch (e) {
          // Perdeu a corrida contra a mesma confirmação? Então a linha existe: é o MESMO arquivo, não se apaga nada.
          // Se esta consulta falhar, o erro sobe: NUNCA se apaga um arquivo que pode estar registrado.
          const [agora] = await s.ler<{ id: string; tarefa_id: string }>("arquivos", { drive_id: driveId }, "id,tarefa_id");
          if (agora) {
            if (agora.tarefa_id !== tarefaId) throw new Recusa(409, "Este arquivo já pertence a outro card.");
            return await jaChegou(agora.id);
          }
          await d.api.lixeira(driveId).catch(() => {}); // sem linha para esse arquivo ele ficaria solto no Drive
          if (e instanceof ErroRest && e.status === 409) throw new Recusa(409, "Este card já tem capa. Tire a atual antes.");
          throw e;
        }
      }
      case "criar_ocasiao": {
        const empresa = texto(c.empresa_id), nome = nomeOk(c.nome);
        if (!empresa || !nome) throw new Recusa(400, "Escreva o nome do tema.");
        exigir(await eu.rpc("pode_mexer_pastas"), 403, SO_TEMA); // B2 (decisão do Natham, 29/10)
        const visivel = await eu.ler("empresas", { id: empresa }, "id");
        if (!visivel.length) throw new Recusa(403, "Empresa não encontrada.");
        // Já Permanente na criação = LIGAR: mesma regra de quem liga (Natham e Matheus; o banco responde). Adrian ou Lucas com login não ligam.
        if (c.permanente === true) exigir(await eu.rpc("pode_ligar_permanente"), 403, "Só o Natham ou o Matheus ligam o Permanente.");
        const o = await novoTema(empresa, nome, pessoa.id, c.permanente === true);
        return { ocasiao: { id: o.id, empresa_id: o.empresa_id, nome: o.nome, permanente: o.permanente === true } };
      }
      case "renomear_ocasiao": {
        const id = texto(c.ocasiao_id), nome = nomeOk(c.nome);
        if (!id || !nome) throw new Recusa(400, "Escreva o nome do tema.");
        exigir(await eu.rpc("pode_mexer_pastas"), 403, SO_TEMA); // B2
        if (!(await eu.ler("ocasioes", { id }, "id")).length) throw new Recusa(404, "Tema não encontrado."); // a trava de leitura do banco decide se a pessoa a enxerga
        const s = servico();
        const [o] = await s.ler<Tema>("ocasioes", { id });
        if (!o) throw new Recusa(404, "Tema não encontrado.");
        if ((await s.ler("ocasioes", { empresa_id: o.empresa_id })).some((x) => x.id !== id && String(x.nome).trim().toLowerCase() === nome.toLowerCase())) throw new Recusa(409, "Já existe um tema com esse nome.");
        // pastas do Tema (uma por Formato) e, por último, as pastas dos conteúdos (o nome delas leva o tema). Repetir é seguro.
        for (const f of FORMATOS_E_SEM) {
          const [x] = await s.ler<{ drive_id: string }>("drive_pastas", { chave: chaves.tema(id, o.empresa_id, f) }, "drive_id");
          if (x) await d.api.renomear(x.drive_id, nome); // acha pelo id, não pelo nome
        }
        await s.atualizar("ocasioes", { id }, { nome });
        return { ok: true, ...(await renomearConteudos(id, texto(c.cursor))) }; // em levas, com cursor (236)
      }
      case "permanente_ocasiao": {
        const id = texto(c.ocasiao_id);
        if (!id || typeof c.ligado !== "boolean") throw new Recusa(400, "Pedido inválido.");
        // QUEM pode é do banco, não da tela: o Matheus liga mas não desliga (definir_permanente recusa com 42501).
        try { await eu.rpc("definir_permanente", { p_ocasiao: id, p_ligado: c.ligado }); } catch (e) {
          if (e instanceof ErroRest && e.codigo === "55006") throw new Recusa(409, "Este tema está sendo limpo agora. Tente de novo em alguns minutos.");
          if (e instanceof ErroRest && (e.status === 403 || e.codigo === "42501")) throw new Recusa(403, "Só o Natham desliga o Permanente.");
          throw e;
        }
        let rearmados = 0;
        if (!c.ligado) {
          // Desligar = recomeça a contar 7 dias, para cada conteúdo já Postado do tema que ainda tem arquivo no Drive.
          const s = servico();
          for (const card of await s.ler<Card>("tarefas", { ocasiao_id: id }, COLUNAS_CARD)) {
            if (card.etapa !== "postado" || !(await s.ler("arquivos", { tarefa_id: card.id }, "id")).length) continue;
            await rearmarLimpeza(card.id, false);
            rearmados++;
          }
        }
        return { ok: true, rearmados };
      }
      case "organizar_card": {
        if (!tarefaId) throw new Recusa(400, "Card não informado.");
        await podeMexer(tarefaId);
        const card = await cardDe(tarefaId);
        if (!card.empresa_id || !(await servico().ler("drive_pastas", { chave: chaves.conteudo(tarefaId) }, "chave")).length) return { ok: true, movida: false }; // sem arquivo ainda: a pasta nasce no 1º envio
        const r = await pastaDoConteudo(card);
        if (r.mudouDeLugar && card.etapa === "postado") await rearmarLimpeza(card.id, !!(await temaDe(card.ocasiao_id, card.empresa_id))?.permanente);
        return { ok: true, movida: r.mudouDeLugar };
      }
      // Documento direto na pasta de um Tema (sem card): vai para Empresa → Formato → Tema, sem pasta de conteúdo.
      case "sessao_envio_pasta": {
        const r = await pedidoDePasta(c, eu);
        const nome = nomeOk(c.nome, 200), tipo = texto(c.tipo), tamanho = Number(c.tamanho), mime = texto(c.mime) ?? "application/octet-stream";
        if (!nome || !tipo || !TIPOS.includes(tipo) || !(tamanho > 0 && tamanho <= MAX_BYTES)
          || (tipo === "imagem" && !mime.startsWith("image/")) || (tipo === "video" && !mime.startsWith("video/"))) throw new Recusa(400, "Pedido de envio inválido.");
        const pasta = await pastaDeTema(r.empresa, r.formato, r.tema);
        return { sessao_url: await d.api.abrirSessao(pasta, nome, mime, tamanho, origem, { destino: r.destino }) };
      }
      case "confirmar_envio_pasta": {
        const r = await pedidoDePasta(c, eu);
        const driveId = texto(c.drive_id), nome = nomeOk(c.nome, 200), tipo = texto(c.tipo), tamanho = Number(c.tamanho);
        if (!driveId || !nome || !tipo || !TIPOS.includes(tipo) || !(tamanho > 0)) throw new Recusa(400, "Confirmação inválida.");
        const s = servico();
        const [ja] = await s.ler<{ id: string; empresa_id: string | null }>("arquivos", { drive_id: driveId }, "id,empresa_id");
        if (ja) {
          if (ja.empresa_id !== r.empresa) throw new Recusa(409, "Este arquivo já pertence a outro lugar.");
          return { arquivo_id: ja.id };
        }
        const f = await d.api.ver(driveId).catch((e: unknown) => {
          if (e instanceof ErroDrive && e.status === 404) throw new Recusa(410, "O arquivo não existe mais no Drive.");
          throw e;
        });
        if (f.trashed) throw new Recusa(410, "O arquivo foi para a lixeira do Drive.");
        // Só confirma o envio que a sessão abriu PARA ESTE destino (a etiqueta `destino` vai no arquivo na abertura da sessão).
        if (f.mimeType === "application/vnd.google-apps.folder" || f.appProperties?.destino !== r.destino) throw new Recusa(422, "Este arquivo não foi enviado para esta pasta.");
        if (Number(f.size) !== tamanho) {
          await d.api.lixeira(driveId).catch(() => {});
          throw new Recusa(422, "O arquivo não chegou inteiro ao Drive. Tente de novo.");
        }
        const pasta = await pastaDeTema(r.empresa, r.formato, r.tema);
        if (!f.parents?.includes(pasta)) await d.api.mover(driveId, pasta, f.parents ?? []);
        try {
          const [l] = await s.inserir<{ id: string }>("arquivos", { drive_id: driveId, nome, tipo, tamanho, papel: "anexo", ordem: 0, criado_por: pessoa.id, empresa_id: r.empresa, formato: r.formato ?? null, ocasiao_id: r.tema?.id ?? null });
          return { arquivo_id: l.id };
        } catch (e) {
          const [agora] = await s.ler<{ id: string }>("arquivos", { drive_id: driveId }, "id");
          if (agora) return { arquivo_id: agora.id };
          await d.api.lixeira(driveId).catch(() => {});
          throw e;
        }
      }
      case "apagar_anexo": {
        const id = texto(c.arquivo_id);
        if (!id) throw new Recusa(400, "Anexo não informado.");
        const [a] = await eu.ler<{ id: string; tarefa_id: string | null; drive_id: string | null }>("arquivos", { id }, "id,tarefa_id,drive_id");
        if (!a?.drive_id) throw new Recusa(404, "Anexo não encontrado.");
        if (a.tarefa_id) await podeMexer(a.tarefa_id);
        else exigir(await eu.rpc("pode_mexer_pastas"), 403, "Você não pode mexer nas pastas."); // documento solto de uma pasta de Tema
        await d.api.lixeira(a.drive_id);
        await servico().apagar("arquivos", { id });
        // Último arquivo do conteúdo: a pasta vazia também sai, para o Drive e a tela Pastas não divergirem.
        if (a.tarefa_id && !(await servico().ler("arquivos", { tarefa_id: a.tarefa_id }, "id")).length) await tirarPastaDoConteudo(a.tarefa_id);
        return { ok: true };
      }
      case "apagar_tarefa": {
        if (!tarefaId) throw new Recusa(400, "Card não informado.");
        exigir(await eu.rpc("pode_apagar_tarefa", { p_tarefa: tarefaId }), 403, "Você não pode apagar este card.");
        try { await esvaziar(tarefaId); } catch { throw new Recusa(502, "Não consegui apagar no Drive, tente de novo."); }
        // por último, com a chave do USUÁRIO: se a trava recusar, nada além dos arquivos foi mexido
        if (!(await eu.apagar("tarefas", { id: tarefaId })).length) throw new Recusa(403, "O banco não deixou apagar o card.");
        return { ok: true };
      }
      case "ordenar_anexos": {
        const lista = Array.isArray(c.ordem) ? (c.ordem as { id?: unknown; ordem?: unknown }[]) : [];
        if (!tarefaId || !lista.length || lista.length > 50 || lista.some((x) => typeof x.id !== "string" || !Number.isInteger(x.ordem))) throw new Recusa(400, "Ordem inválida.");
        await podeMexer(tarefaId);
        for (const x of lista) await servico().atualizar("arquivos", { id: x.id as string, tarefa_id: tarefaId }, { ordem: x.ordem as number }); // filtra pelo card: não mexe em arquivo de outro
        return { ok: true };
      }
      case "link_video": {
        const id = texto(c.arquivo_id);
        if (!id) throw new Recusa(400, "Vídeo não informado.");
        const [a] = await eu.ler<{ id: string; drive_id: string | null; tipo: string }>("arquivos", { id }, "id,drive_id,tipo"); // a trava de leitura decide se a pessoa vê o card
        if (!a?.drive_id || a.tipo !== "video") throw new Recusa(404, "Vídeo não encontrado.");
        const ate = agora() + 10 * 60_000;
        return { url: `${url()}/functions/v1/drive?ver=${a.id}&ate=${ate}&sig=${await assinar(await segredo(), `${a.id}.${ate}`)}` };
      }
      default: {
        const r = await livres.acao(acao, c, { eu, pessoaId: pessoa.id, origem }); // pasta livre (234)
        if (r === undefined) throw new Recusa(400, "Ação desconhecida.");
        return r;
      }
    }
  }

  async function servirVideo(req: Request): Promise<Response> {
    const q = new URL(req.url).searchParams;
    const ver = q.get("ver") ?? "", ate = Number(q.get("ate")), sig = q.get("sig") ?? "";
    if (!(ate > agora()) || !(await conferir(await segredo(), `${ver}.${ate}`, sig))) return json(403, { erro: "Link vencido." });
    const [a] = await servico().ler<{ drive_id: string | null }>("arquivos", { id: ver }, "drive_id");
    if (!a?.drive_id) return json(404, { erro: "Vídeo não encontrado." });
    const r = await d.baixar(a.drive_id, limitarRange(req.headers.get("range")));
    const h = new Headers(CORS);
    for (const n of ["content-type", "content-length", "content-range"]) { const v = r.headers.get(n); if (v) h.set(n, v); }
    h.set("accept-ranges", "bytes");
    h.set("cache-control", "private, max-age=600");
    return new Response(r.body, { status: r.status, headers: h });
  }

  return async function tratar(req: Request): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    let acao = "?";
    try {
      if (req.method === "GET") return await servirVideo(req);
      if (req.method !== "POST") return json(405, { erro: "Método não aceito." });
      const c = (await req.json().catch(() => ({}))) as Corpo;
      acao = texto(c.acao) ?? "?";
      const campainha = req.headers.get("x-tarefas-segredo");
      if (campainha) {
        // só o alarme do banco; e só para limpar
        if (!(await iguais(campainha, await segredo())) || acao !== "limpar") throw new Recusa(401, "Não autorizado.");
        const id = texto(c.tarefa_id);
        if (!id) throw new Recusa(400, "Card não informado.");
        const t = await cardDe(id);
        if (t.etapa !== "postado") throw new Recusa(409, "O card não está em Postado.");
        // Tema permanente: o alarme não apaga nada. Desarma, senão o sentinela de 12 min tocaria de novo até o teto.
        // 238: quem decide é o BANCO, de forma atômica (trava de linha do tema): se o Permanente entrou antes, não limpa; se a limpeza entrou antes, ligar o Permanente espera.
        if (t.empresa_id && t.ocasiao_id && (await servico().rpc("iniciar_limpeza_tema", { p_tarefa: id })) !== true) {
          await rearmarLimpeza(id, true);
          return json(200, { ok: true, permanente: true });
        }
        // A6 (r3/r4): trava o card em Postado enquanto limpa. 039: crachá (nulo = outra limpeza rodando ou fora de Postado), solta só com ele; 038: sim/não; sem os dois: arquivo a arquivo.
        const trava = await servico().rpc<boolean | string | null>("iniciar_limpeza_card", { p_tarefa: id }).catch(semFuncao);
        if (trava === false || trava === null) throw new Recusa(409, "O card não está em Postado ou já está sendo limpo.");
        let limpou: boolean;
        try { limpou = await esvaziar(id, true); } catch (e) {
          await servico().rpc("armar_alarme_servico", { p_tipo: "limpar", p_tarefa: id, p_minutos: 60 }); // tenta de novo daqui a 1 h
          throw e;
        } finally { if (trava) await servico().rpc("terminar_limpeza_card", { p_tarefa: id, ...(typeof trava === "string" ? { p_desde: trava } : {}) }).catch(() => {}); } // falhou: vence em 10 min
        return json(200, { ok: true, ...(limpou ? {} : { parou: true }) }); // parou: o gatilho do banco já desarmou ao sair de Postado
      }
      const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1];
      if (!token) throw new Recusa(401, "Entre no sistema.");
      return json(200, await comUsuario(acao, c, token, req.headers.get("origin") ?? ""));
    } catch (e) {
      if (e instanceof Recusa) return json(e.status, { erro: e.message });
      console.error(JSON.stringify({ funcao: "drive", acao, erro: e instanceof Error ? e.message : "?" })); // só o código; nunca corpo, chave ou endereço
      if (e instanceof ErroDrive) return json(502, { erro: "O Google Drive não respondeu como esperado. Tente de novo." });
      if (e instanceof ErroRest && (e.status === 401 || e.status === 403)) return json(403, { erro: "O banco não deixou." });
      return json(500, { erro: "Algo deu errado. Tente de novo." });
    }
  };
}
