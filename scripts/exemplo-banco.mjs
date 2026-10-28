// Banco FALSO com cards de exemplo (item 218). Responde como o Supabase, com dados inventados, só na memória deste processo.
// Nada vai ao banco real: o app de exemplo (porta 3101) é ligado a este endereço pelo `npm run exemplo` (scripts/exemplo.mjs).
// Datas contam a partir de HOJE (domingo desta semana = dia 0), para o Calendário e o Mapa sempre abrirem cheios.
// GET /entrar = "login" sem senha: grava a sessão de mentira do Natham no cookie e volta para o app.
import { createReadStream, statSync } from "node:fs"; import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { funcaoDrive } from "./exemplo-funcao-drive.mjs"; import { storageDePrints } from "./exemplo-storage-prints.mjs"; import { postagensExemplo } from "./exemplo-postagens.mjs";

export const PORTA_BANCO = Number(process.env.EXEMPLO_PORTA_BANCO ?? 3201);
const PORTA_APP = Number(process.env.EXEMPLO_PORTA_APP ?? 3101);

const P = { natham: "p-natham", matheus: "p-matheus", adrian: "p-adrian", lucas: "p-lucas" };
const USUARIOS = { natham: "u-natham", matheus: "u-matheus" };
const pessoas = [
  { id: P.natham, slug: "natham", user_id: USUARIOS.natham },
  { id: P.matheus, slug: "matheus", user_id: USUARIOS.matheus },
  { id: P.adrian, slug: "adrian", user_id: null },
  { id: P.lucas, slug: "lucas", user_id: null },
];
const empresas = [{ id: "you", nome: "You", sigla: "YO" }, { id: "beec", nome: "Beec", sigla: "BE" }, { id: "tu-ecom", nome: "Tu Ecom", sigla: "TE" }];
const TAG = "tag-esperando-aprovacao";
const tags = [{ id: TAG, nome: "Esperando aprovação", cor: "etiqueta-1", aprovacao: true }];

// ---- datas: dia 0 = domingo desta semana (o Calendário começa no domingo), 7 = domingo da próxima
const pad = (n) => String(n).padStart(2, "0");
const hoje = new Date();
const domingo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - (hoje.getDay()));
const em = (dia, hora = "") => {
  const d = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + dia);
  const data = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return hora ? `${data}T${hora}` : data;
};
const diaHoje = hoje.getDay();
/** "há n dias" a partir de agora, no formato das tarefas (para os Postados contarem 7 dias de verdade). */
const haDias = (n, hora) => { const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hora}`; };

// Temas (item 229): "Reunião de outubro" é PERMANENTE (cadeado); "Natal" está vazio (nenhum conteúdo em lugar nenhum).
const ocasioes = [
  { id: "tema-reuniao", empresa_id: "you", nome: "Reunião de outubro", permanente: true, desligado_em: null, criado_por: P.natham },
  { id: "tema-mei", empresa_id: "you", nome: "Dia do MEI", permanente: false, desligado_em: null, criado_por: P.natham },
  { id: "tema-natal", empresa_id: "you", nome: "Natal", permanente: false, desligado_em: null, criado_por: P.matheus },
  { id: "tema-beec", empresa_id: "beec", nome: "Lançamento da Beec", permanente: false, desligado_em: null, criado_por: P.natham },
];
// Pastas livres (item 234, a "+ Nova pasta"): ficam na empresa ao lado das de formato; "Logos e marca" tem cadeado.
const pastasLivres = [
  { id: "livre-logos", empresa_id: "you", nome: "Logos e marca", permanente: true, criado_por: P.natham },
  { id: "livre-referencias", empresa_id: "you", nome: "Referências", permanente: false, criado_por: P.matheus },
];
let n = 0;
const tarefa = (titulo, extra = {}) => ({
  id: `t${++n}`, titulo, tipo: "outro", empresa_id: null, rede: null, etapa: null, responsavel_id: P.natham, inicio: null, fim: null,
  dia_inteiro: false, cor: "etiqueta-5", concluida: false, objetivo: null, notas: null, links: [], aprovador: null,
  dono_id: P.natham, criado_por: P.natham, enviada_por: null, tarefa_tags: [], legenda: null, postar_redes: null, postar_em: null,
  conserto: false, conserto_texto: null, formato: null, capa_quadro_ms: null, ocasiao_id: null, created_at: `2026-10-${pad(10 + (n % 10))}T10:00:00Z`, ...extra,
});
const TIPO = { roteiro: "roteiro", gravacao: "gravacao", edicao: "edicao" };
const card = (titulo, empresa, rede, formato, etapa, quem, dia, hora, extra = {}) => tarefa(titulo, {
  tipo: TIPO[etapa] ?? "postagem", empresa_id: empresa, rede, formato, etapa, responsavel_id: P[quem],
  inicio: dia === null ? null : em(dia, hora), aprovador: etapa === "analise" || etapa === "aprovado" ? "Natham" : null, ...extra,
});
const esperando = { tarefa_tags: [{ tag_id: TAG }] };
const programado = (dia, hora, redes) => ({ postar_em: em(dia, hora), postar_redes: redes });
const IG_FB = ["instagram", "facebook"];

const tarefas = [
  // Roteiro
  card("Reels: 5 erros ao abrir MEI", "you", "instagram", "reels", "roteiro", "natham", 3, "10:00", { cor: "etiqueta-3", objetivo: "Educar quem está abrindo MEI e levar ao direct" }),
  card("Carrossel: o que é o DAS", "you", "instagram", "carrossel", "roteiro", "matheus", 8, "09:00", { cor: "etiqueta-4" }),
  card("Carrossel: quando emitir nota fiscal", "beec", "instagram", "carrossel", "roteiro", "natham", 11, "10:00", { cor: "etiqueta-6" }),
  card("Dica do dia: prazo da declaração", "beec", "tiktok", "reels", "roteiro", "adrian", null, "", { cor: "etiqueta-2" }),
  // Gravação
  card("Reels: bastidores do escritório", "you", "instagram", "reels", "gravacao", "matheus", diaHoje, "11:00", { cor: "etiqueta-7", objetivo: "Mostrar o time e gerar contato no direct" }),
  card("Vídeo institucional da Beec", "beec", "youtube", "reels", "gravacao", "adrian", Math.min(diaHoje + 2, 6), "14:00", { cor: "etiqueta-8", objetivo: "Apresentar a Beec para quem ainda não conhece" }),
  card("Reels: dúvidas de quem é MEI", "you", "tiktok", "reels", "gravacao", "natham", null, "", { cor: "etiqueta-9" }),
  // Edição
  card("Carrossel: 3 impostos que o MEI paga", "you", "instagram", "carrossel", "edicao", "matheus", diaHoje, "16:00", { cor: "etiqueta-10", links: [{ rotulo: "Roteiro", url: "https://docs.google.com/document/d/exemplo" }] }),
  card("Reels: depoimento de cliente", "you", "instagram", "reels", "edicao", "matheus", 3, "15:00", { cor: "etiqueta-11", conserto: true, notas: "Voltou da aprovação: cortar a pausa do começo e trocar a música." }),
  card("Post: plano Beec de novembro", "beec", "instagram", "post", "edicao", "adrian", 7, "10:00", { cor: "etiqueta-12" }),
  // Análise (esperando o Natham aprovar)
  card("Reels: contabilidade sem mistério", "you", "instagram", "reels", "analise", "matheus", diaHoje, "08:30", { cor: "etiqueta-13", objetivo: "Tirar o medo de falar com contador", ...esperando, links: [{ rotulo: "Vídeo", url: "https://drive.google.com/file/d/exemplo" }] }),
  card("Carrossel: guia do pró-labore", "you", "instagram", "carrossel", "analise", "matheus", 3, "12:00", { cor: "etiqueta-14", ...esperando }),
  card("Post: a Beec está contratando", "beec", "instagram", "post", "analise", "adrian", 4, "09:00", { cor: "etiqueta-15", ...esperando }),
  // Aprovado (programado)
  card("Reels: dica rápida de IR", "you", "instagram", "reels", "aprovado", "natham", 4, "18:00", { cor: "etiqueta-16", legenda: "Antes de entregar a declaração, confira estes 3 pontos. Salva o post!", ...programado(4, "18:00", IG_FB) }),
  card("Carrossel: calendário fiscal de novembro", "you", "instagram", "carrossel", "aprovado", "natham", 8, "08:00", { cor: "etiqueta-1", legenda: "Todas as datas de novembro num lugar só.", ...programado(8, "08:00", IG_FB) }),
  card("Post: bem-vindo à Beec", "beec", "instagram", "post", "aprovado", "matheus", 5, "12:00", { cor: "etiqueta-2", legenda: "Prazer, somos a Beec.", ...programado(5, "12:00", ["instagram"]) }),
  card("Reels: bastidores da Beec", "beec", "youtube", "reels", "aprovado", "adrian", 9, "17:00", { cor: "etiqueta-3", ...programado(9, "17:00", ["instagram"]) }),
  // Postado
  card("Reels: depoimento da Maria", "you", "instagram", "reels", "postado", "matheus", 0, "18:00", { cor: "etiqueta-4", concluida: true, ...programado(0, "18:00", IG_FB) }),
  card("Carrossel: 5 dicas de MEI", "you", "instagram", "carrossel", "postado", "natham", 1, "10:00", { cor: "etiqueta-6", concluida: true, ...programado(1, "10:00", IG_FB) }),
  card("Post: aviso de feriado", "beec", "instagram", "post", "postado", "matheus", -3, "09:00", { cor: "etiqueta-7", concluida: true, ...programado(-3, "09:00", IG_FB) }),
  card("TikTok: o que é pró-labore", "you", "tiktok", "reels", "postado", "natham", -1, "19:00", { cor: "etiqueta-8", concluida: true, ...programado(-1, "19:00", IG_FB) }),
  // Item 225: Reels da You com vídeo de verdade (scripts/exemplo-midia/), capa = quadro escolhido
  card("Reels: bastidores da You", "you", "instagram", "reels", "analise", "matheus", diaHoje + 1, "11:00", { cor: "etiqueta-13", objetivo: "Mostrar o dia a dia do time da You", ...esperando, capa_quadro_ms: 4500, legenda: "Um dia com o time da You. Salva para ver de novo!" }),
  card("Reels: cliente da You conta como foi", "you", "instagram", "reels", "postado", "natham", Math.max(diaHoje - 1, 0), "18:00", { cor: "etiqueta-4", concluida: true, capa_quadro_ms: 6000, ...programado(Math.max(diaHoje - 1, 0), "18:00", IG_FB) }),
  card("Edição final: vídeo da Black Friday", "you", "youtube", "reels", "postado", "matheus", -2, "10:00", { tipo: "edicao", cor: "etiqueta-9", concluida: true }),
  card("Post antigo: retrospectiva do trimestre", "you", "instagram", "post", "postado", "natham", -50, "10:00", { cor: "etiqueta-11", concluida: true }), // 278: além do teto do recuo, fica só na Esteira
  card("Roteiro antigo: série de MEI", "beec", "", "reels", "postado", "adrian", null, "", { tipo: "roteiro", cor: "etiqueta-10", concluida: true }),
  // Caderno do Natham (sem etapa): tarefas e 2 reuniões
  tarefa("Ligar para o contador", { inicio: em(diaHoje, "09:00"), cor: "etiqueta-5" }),
  tarefa("Revisar proposta da Beec", { inicio: em(diaHoje, "10:30"), empresa_id: "beec", cor: "etiqueta-12" }),
  tarefa("Reunião de pauta de novembro", { inicio: em(diaHoje, "14:00"), fim: em(diaHoje, "15:00"), cor: "etiqueta-3" }),
  tarefa("Aprovar os conteúdos da semana", { inicio: em(diaHoje, "17:00"), cor: "etiqueta-1" }),
  tarefa("Pagar a ferramenta de edição", { inicio: em(diaHoje, "12:00"), concluida: true, cor: "etiqueta-5" }),
  tarefa("Reunião com a Beec: metas do mês", { inicio: em(Math.min(diaHoje + 1, 6), "10:00"), fim: em(Math.min(diaHoje + 1, 6), "11:00"), empresa_id: "beec", cor: "etiqueta-6" }),
  tarefa("Mandar a logo nova ao Matheus", { inicio: em(Math.min(diaHoje + 1, 6), "15:30"), cor: "etiqueta-5" }),
  tarefa("Separar fotos do evento", { inicio: em(7, "11:00"), cor: "etiqueta-5" }),
  tarefa("Pensar em ideias para dezembro", { cor: "etiqueta-5" }),
  tarefa("Editar vídeos do Matheus", { inicio: em(diaHoje, "10:00"), dono_id: P.matheus, responsavel_id: P.matheus, enviada_por: P.natham, cor: "etiqueta-5" }), // 031: enviada pelo Natham
];
const idDe = (titulo) => tarefas.find((t) => t.titulo === titulo).id;
// Conteúdos Postados: uns há menos de 7 dias (aparecem nas Pastas e dizem quando vencem), outros há 8 (os arquivos já foram limpos, só o card fica no Mapa)
// e um há 8 dias no tema PERMANENTE (continua nas Pastas).
tarefas.push(card("Reels: MEI em 1 minuto", "you", "instagram", "reels", "postado", "matheus", 0, "18:00", { cor: "etiqueta-9", concluida: true }));
const colocar = (titulo, extra) => Object.assign(tarefas.find((t) => t.titulo === titulo), extra);
const postadoHa = (titulo, dias, hora, tema) => colocar(titulo, { inicio: haDias(dias, hora), postar_em: haDias(dias, hora), postado_em: new Date(`${haDias(dias, hora)}:00-03:00`).toISOString(), postar_redes: IG_FB, ...(tema && { ocasiao_id: tema }) });
postadoHa("Reels: depoimento da Maria", 3, "18:00", "tema-mei");
postadoHa("Carrossel: 5 dicas de MEI", 2, "10:00", "tema-mei");
postadoHa("TikTok: o que é pró-labore", 1, "19:00");
postadoHa("Post: aviso de feriado", 8, "09:00", "tema-beec");
postadoHa("Reels: MEI em 1 minuto", 8, "18:00", "tema-mei");
postadoHa("Reels: cliente da You conta como foi", 8, "18:00", "tema-reuniao");
colocar("Reels: bastidores da You", { ocasiao_id: "tema-reuniao" });
colocar("Reels: contabilidade sem mistério", { ocasiao_id: "tema-reuniao" });
colocar("Post: bem-vindo à Beec", { ocasiao_id: "tema-beec" });
const fazendoAgora = [{ pessoa_id: P.matheus, tarefa_id: idDe("Reels: bastidores do escritório"), desde: new Date(Date.now() - 25 * 60_000).toISOString() }];

// ---- anexos e capas (imagens de mentira que este servidor mesmo desenha)
const anexo = (titulo, nome, papel = "anexo", ordem = 0) => ({
  id: `a${++n}`, tarefa_id: idDe(titulo), caminho: `exemplo/${idDe(titulo)}-${nome}`, drive_id: null, ordem, papel, nome, tipo: "imagem", created_at: "2026-10-18T10:00:00Z",
});
const video = (titulo, nome) => ({ id: `a${++n}`, tarefa_id: idDe(titulo), caminho: `exemplo/${nome}`, drive_id: null, ordem: 0, papel: "anexo", nome: `${nome}`, tipo: "video", created_at: "2026-10-18T10:00:00Z" });
const arquivos = [
  video("Reels: bastidores da You", "bastidores.mp4"),
  video("Reels: cliente da You conta como foi", "depoimento.mp4"),
  anexo("Reels: contabilidade sem mistério", "capa.png", "capa"),
  anexo("Reels: contabilidade sem mistério", "frame-1.png", "anexo", 1),
  anexo("Carrossel: guia do pró-labore", "capa.png", "capa"),
  anexo("Carrossel: guia do pró-labore", "slide-1.png", "anexo", 1),
  anexo("Carrossel: guia do pró-labore", "slide-2.png", "anexo", 2),
  anexo("Carrossel: guia do pró-labore", "slide-3.png", "anexo", 3),
  anexo("Carrossel: 3 impostos que o MEI paga", "slide-1.png"),
  anexo("Carrossel: 3 impostos que o MEI paga", "slide-2.png", "anexo", 1),
  anexo("Reels: dica rápida de IR", "capa.png", "capa"),
  anexo("Post: bem-vindo à Beec", "arte.png"),
  { ...video("Reels: dica rápida de IR", "bastidores.mp4"), nome: "ir-sem-legenda.mp4", papel: "original" }, // 270: o sem legenda, guardado
  { ...video("Reels: dica rápida de IR", "depoimento.mp4"), nome: "ir-legendado.mp4" },
  anexo("Reels: depoimento da Maria", "capa.png", "capa"),
  anexo("Carrossel: 5 dicas de MEI", "capa.png", "capa"),
  anexo("Carrossel: 5 dicas de MEI", "slide-2.png", "anexo", 1),
];
// Arquivos que moram no Drive (drive_id): são eles que põem o conteúdo na árvore da tela Pastas. Os anexos antigos (Storage, acima) ficam só na ficha.
const noDrive = (titulo, nome, tipo = "documento", ordem = 0) => ({ id: `a${++n}`, tarefa_id: idDe(titulo), caminho: null, drive_id: `drive-${n}`, ordem, papel: "anexo", nome, tipo, tamanho: 1_200_000, created_at: "2026-10-18T10:00:00Z" });
arquivos.push(
  noDrive("Reels: bastidores da You", "bastidores-final.mp4", "video"), noDrive("Reels: bastidores da You", "roteiro.pdf", "documento", 1),
  noDrive("Reels: contabilidade sem mistério", "contabilidade.mp4", "video"),
  noDrive("Reels: cliente da You conta como foi", "depoimento.mp4", "video"), noDrive("Reels: cliente da You conta como foi", "autorizacao-de-imagem.pdf", "documento", 1),
  noDrive("Reels: depoimento da Maria", "maria.mp4", "video"),
  noDrive("Carrossel: 5 dicas de MEI", "slide-1.png", "imagem"), noDrive("Carrossel: 5 dicas de MEI", "slide-2.png", "imagem", 1), noDrive("Carrossel: 5 dicas de MEI", "slide-3.png", "imagem", 2),
  noDrive("Carrossel: guia do pró-labore", "guia.pdf", "documento"),
  noDrive("TikTok: o que é pró-labore", "prolabore.mp4", "video"),
  noDrive("Reels: dica rápida de IR", "ir.mp4", "video"),
  noDrive("Post: bem-vindo à Beec", "boas-vindas.png", "imagem"),
  noDrive("Vídeo institucional da Beec", "institucional-v1.mp4", "video"),
);
// Documentos soltos: postos direto numa pasta pela tela Pastas, sem card (não vencem em 7 dias)
const solto = (nome, tipo, empresa_id, formato, ocasiao_id) => ({ id: `a${++n}`, tarefa_id: null, caminho: null, drive_id: `drive-${n}`, ordem: 0, papel: "anexo", nome, tipo, tamanho: 300_000, empresa_id, formato, ocasiao_id, criado_por: P.matheus, created_at: "2026-10-19T09:00:00Z" });
arquivos.push(
  solto("ata-da-reuniao.pdf", "documento", "you", "reels", "tema-reuniao"), solto("referencias.pdf", "documento", "you", "reels", "tema-reuniao"),
  solto("paleta-de-cores.png", "imagem", "you", "carrossel", "tema-mei"),
  solto("briefing-lancamento.pdf", "documento", "beec", "post", "tema-beec"),
);
// Arquivos das pastas livres (qualquer tipo; nada sai sozinho, com ou sem cadeado)
const naLivre = (nome, tipo, pasta, empresa = "you") => ({ ...solto(nome, tipo, empresa, null, null), pasta_livre_id: pasta });
arquivos.push(
  naLivre("logo-you.png", "imagem", "livre-logos"), naLivre("logo-you-branca.png", "imagem", "livre-logos"), naLivre("manual-da-marca.pdf", "documento", "livre-logos"),
  naLivre("referencias-instagram.pdf", "documento", "livre-referencias"), naLivre("video-de-inspiracao.mp4", "video", "livre-referencias"),
);
const postagens = ["Reels: cliente da You conta como foi", "Reels: depoimento da Maria", "Carrossel: 5 dicas de MEI", "Post: aviso de feriado", "TikTok: o que é pró-labore", "Reels: MEI em 1 minuto"].flatMap((titulo, i) =>
  IG_FB.map((rede) => ({ tarefa_id: idDe(titulo), rede, status: "postado", link: `https://www.${rede}.com/exemplo/${i}`, erro: null, postado_em: new Date(`${tarefas.find((t) => t.id === idDe(titulo)).inicio}:00-03:00`).toISOString() })));
const hojeTexto = em(diaHoje);
const anotacoesDia = [{ dono_id: P.natham, dia: hojeTexto, texto: "Gravar o Reels das 11h com o Matheus.\nConferir a legenda do carrossel do pró-labore." }];
const naoEsquecer = [{ dono_id: P.natham, dia: hojeTexto, texto: "Ligar para o contador antes das 10h." }];

// 256: ideias de conteúdo no banco (os exemplos de antes, já com as 2 da You em Ganchos). seq = ordem dos cards e das colunas.
const IG = "https://www.instagram.com/explore/", TT = "https://www.tiktok.com/discover";
const ideias = [], ideiasCategorias = [];
for (const e of ["you", "beec"]) {
  const perfis = e === "beec" ? "Perfis - Empresários sellers" : "Perfis - Contabilidade";
  [["Formatos de conteúdo", "X regras para não perder [TEMA]", "Lista curta e direta. Exemplo: 5 regras pra não tomar bloqueio na sua loja.", IG],
   ["Formatos de conteúdo", "Explicando assunto na lousa", "Fala para a câmera e desenha o passo a passo. Funciona bem para imposto e fluxo de caixa.", TT],
   ["Formatos de conteúdo", "Rankeando o melhor e o pior", "Tier list de erros comuns do assunto da semana, do mais perigoso ao mais bobo.", IG],
   ["Formatos de conteúdo", "React em tela verde", "Reage a uma notícia ou a um vídeo de concorrente, com a opinião do especialista.", TT],
   ["Ganchos", "Você está pagando imposto a mais", "Abertura de 3 segundos para vídeos de economia tributária.", null],
   ["Ganchos", "Ninguém te conta isso sobre [TEMA]", "Gancho de curiosidade para carrossel ou reels.", null],
   ["Ganchos", "O erro que custou R$ 10 mil", "História real (sem citar o cliente) que termina numa dica prática.", IG],
   [perfis, "Perfis para acompanhar", "Contas que postam bem sobre o nosso público. Olhar toda segunda e anotar o que está funcionando.", IG],
   [perfis, "Referência de edição", "Perfil com cortes rápidos e legenda grande, bom modelo para os reels.", TT],
   ["Datas e sazonais", "Calendário fiscal do mês", "Um post por mês com os vencimentos principais. Serve de lembrete e de gancho de conversa.", null],
  ].forEach(([categoria, titulo, texto, link]) => {
    ideias.push({ id: `5eed${String(ideias.filter((x) => x.empresa_id === e).length + 1).padStart(4, "0")}-0000-4000-8000-${e === "you" ? "796f75000000" : "626565630000"}`, empresa_id: e, categoria, titulo, texto, link, seq: ideias.length + 1 });
    if (!ideiasCategorias.some((c) => c.empresa_id === e && c.nome === categoria)) ideiasCategorias.push({ empresa_id: e, nome: categoria, seq: ideiasCategorias.length + 1 });
  });
}

const tabelas = { ideias, ideias_categorias: ideiasCategorias, pastas_livres: pastasLivres, ocasioes, pessoas, empresas, tags, tarefas, fazendo_agora: fazendoAgora, arquivos, postagens, anotacoes_dia: anotacoesDia, nao_esquecer: naoEsquecer };

// ---- imagem de mentira (SVG colorido com o nome do arquivo)
const imagem = (caminho) => {
  const h = [...caminho].reduce((s, c) => (s * 31 + c.charCodeAt(0)) % 360, 7);
  const nome = caminho.split("/").pop().replace(/^t\d+-/, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 70% 62%)"/><stop offset="1" stop-color="hsl(${(h + 50) % 360} 65% 38%)"/></linearGradient></defs><rect width="800" height="800" fill="url(#g)"/><circle cx="600" cy="200" r="120" fill="#fff" fill-opacity=".22"/><rect x="90" y="480" width="460" height="40" rx="20" fill="#fff" fill-opacity=".5"/><rect x="90" y="550" width="320" height="40" rx="20" fill="#fff" fill-opacity=".3"/><text x="90" y="400" font-family="sans-serif" font-size="56" font-weight="700" fill="#fff">${nome}</text></svg>`;
};

// ---- servidor
const b64 = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const EXP = 1893456000; // 2030
const sessaoDe = (uid) => {
  const jwt = [b64({ alg: "HS256", typ: "JWT" }), b64({ sub: uid, exp: EXP, role: "authenticated", aud: "authenticated" }), b64("assinatura")].join(".");
  return { access_token: jwt, refresh_token: "x", expires_in: 3600, expires_at: EXP, token_type: "bearer", user: { id: uid, aud: "authenticated", role: "authenticated", email: `${uid}@exemplo.invalid`, app_metadata: {}, user_metadata: {}, created_at: "2026-10-19T00:00:00Z" } };
};
const sub = (req) => {
  try { return JSON.parse(Buffer.from((req.headers.authorization ?? "").split(".")[1], "base64url").toString()).sub; } catch { return undefined; }
};
const corpoDe = (req) => new Promise((ok) => { let c = ""; req.on("data", (x) => (c += x)).on("end", () => ok(c ? JSON.parse(c) : {})); });
const igual = (url) => [...url.searchParams].filter(([, v]) => v.startsWith("eq.")).map(([k, v]) => [k, v.slice(3)]);
const naoNulos = (url) => [...url.searchParams].filter(([, v]) => v === "not.is.null").map(([k]) => k);

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/entrar") {
    const cookie = `sb-127-auth-token=base64-${b64(sessaoDe(USUARIOS[url.searchParams.get("quem")] ?? USUARIOS.natham))}; Path=/; Max-Age=31536000; SameSite=Lax`;
    return res.writeHead(302, { "set-cookie": cookie, location: `http://127.0.0.1:${PORTA_APP}/` }).end();
  }
  res.setHeader("access-control-allow-origin", req.headers.origin ?? "*");
  res.setHeader("access-control-allow-credentials", "true");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("access-control-allow-methods", "GET,POST,PATCH,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-expose-headers", "content-range");
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  if (url.pathname === "/auth/v1/user") {
    const id = sub(req);
    if (!Object.values(USUARIOS).includes(id)) return res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ msg: "sem sessão" }));
    return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(sessaoDe(id).user));
  }
  // Storage: endereços assinados (POST) e a própria imagem (GET)
  if (await storageDePrints(req, res, url)) return;
  if (url.pathname === "/storage/v1/object/sign/arquivos" && req.method === "POST") {
    const { paths = [] } = await corpoDe(req);
    return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(paths.map((path) => ({ error: null, path, signedURL: `/object/sign/arquivos/${path}?token=exemplo` }))));
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/arquivos/") && url.pathname.endsWith(".mp4")) {
    const arquivo = fileURLToPath(new URL(`./exemplo-midia/${url.pathname.split("/").pop()}`, import.meta.url));
    const total = statSync(arquivo).size, faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    const ini = faixa?.[1] ? Number(faixa[1]) : 0, fim = faixa?.[2] ? Number(faixa[2]) : total - 1;
    res.writeHead(faixa ? 206 : 200, { "content-type": "video/mp4", "accept-ranges": "bytes", "content-length": fim - ini + 1, ...(faixa && { "content-range": `bytes ${ini}-${fim}/${total}` }) });
    return createReadStream(arquivo, { start: ini, end: fim }).pipe(res);
  }
  if (url.pathname.startsWith("/storage/v1/object/sign/arquivos/")) {
    return res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "max-age=3600" }).end(imagem(decodeURIComponent(url.pathname.split("/arquivos/")[1])));
  }
  res.setHeader("content-type", "application/json");

  // Envio "para o Drive" de mentira: a sessão é este endereço mesmo; aceita as partes e devolve um id (nada sai do PC).
  const sessao = url.pathname.match(/^\/upload\/sessao\/(\w+)$/)?.[1];
  if (sessao && req.method === "PUT") { req.resume(); return req.on("end", () => res.writeHead(200).end(JSON.stringify({ id: `drive-up-${sessao}` }))); }
  // 239: a postar-meta de mentira só diz se publica de verdade (EXEMPLO_POSTAR_DE_VERDADE=1; padrão: modo de teste)
  if (url.pathname === "/functions/v1/postar-meta" && req.method === "POST") return res.writeHead(200).end(JSON.stringify({ deVerdade: process.env.EXEMPLO_POSTAR_DE_VERDADE === "1" }));
  // Função `drive` de mentira (item 229/234), em exemplo-funcao-drive.mjs
  if (url.pathname === "/functions/v1/drive" && req.method === "POST") {
    return funcaoDrive(await corpoDe(req), { res, ocasioes, pastasLivres, arquivos, tarefas, P, porta: PORTA_BANCO, novoId: () => ++n });
  }
  const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)/)?.[1];
  if (rpc === "salvar_tarefa" && req.method === "POST") {
    const { p, p_tags = [] } = await corpoDe(req);
    const nova = { ...tarefa(p.titulo), ...p, tarefa_tags: p_tags.map((tag_id) => ({ tag_id })) };
    const i = tarefas.findIndex((x) => x.id === p.id);
    if (i >= 0) tarefas[i] = { ...tarefas[i], ...nova }; else tarefas.push(nova);
    return res.writeHead(204).end();
  }
  if (rpc === "marcar_feita") { const { p_tarefa, p_feita } = await corpoDe(req); const t = tarefas.find((x) => x.id === p_tarefa); if (t) t.concluida = p_feita; return res.writeHead(204).end(); } // 031
  // 238: o interruptor da postagem automática (a cópia de exemplo fica DESLIGADA; para ver ligada: EXEMPLO_POSTAGEM_AUTOMATICA=1 npm run exemplo)
  if (rpc === "marcar_video_pendente" || rpc === "liberar_video_pendente" || rpc === "video_pendente") { // 270 achado 5 (027, passo 8): marca "vídeo novo pendente"
    const { p_tarefa } = await corpoDe(req), t = tarefas.find((x) => x.id === p_tarefa);
    if (rpc === "video_pendente") return res.writeHead(200).end(JSON.stringify(!!t?.video_pendente_desde));
    if (t) t.video_pendente_desde = rpc === "marcar_video_pendente" && t.etapa === "aprovado" ? t.video_pendente_desde ?? new Date().toISOString() : null;
    return res.writeHead(204).end();
  }
  if (rpc === "postagem_automatica_ligada") return res.writeHead(200).end(JSON.stringify(process.env.EXEMPLO_POSTAGEM_AUTOMATICA === "1"));
  if (await postagensExemplo({ res, url, rpc, metodo: req.method, corpo: () => corpoDe(req) })) return; // 315: calendário de postagens (exemplo-postagens.mjs)
  if (rpc) return res.writeHead(200).end("[]"); // tarefas_no_google, postar_agora etc.: nada a fazer

  const tabela = url.pathname.match(/^\/rest\/v1\/(\w+)/)?.[1];
  if (!tabela) return res.writeHead(404).end("{}");
  if (req.method === "GET") {
    const filtros = igual(url), nn = naoNulos(url);
    return res.writeHead(200).end(JSON.stringify((tabelas[tabela] ?? []).filter((l) => filtros.every(([k, v]) => String(l[k]) === v) && nn.every((k) => l[k] != null)).sort((a, b) => (tabela === "ideias_categorias" ? (a.ordem ?? 1e9) - (b.ordem ?? 1e9) : 0) || 0))); // 298: colunas na ordem guardada
  }
  const id = url.searchParams.get("id")?.replace(/^eq\./, "");
  if ((tabela === "ideias" && req.method === "PATCH") || (tabela === "ideias_categorias" && ["PATCH", "DELETE"].includes(req.method))) { const f = igual(url), l = tabelas[tabela], c = req.method === "PATCH" ? await corpoDe(req) : null; for (let i = l.length; i--;) if (f.every(([k, v]) => String(l[i][k]) === v)) c ? Object.assign(l[i], c) : l.splice(i, 1); return res.writeHead(204).end(); } // 298: renomear e apagar coluna
  if (tabela === "tarefas" && req.method === "DELETE") {
    const i = tarefas.findIndex((x) => x.id === id);
    const apagada = i >= 0 ? tarefas.splice(i, 1) : [];
    return res.writeHead(200).end(JSON.stringify(apagada.map((x) => ({ id: x.id }))));
  }
  if (tabela === "tarefas" && req.method === "PATCH") {
    const campos = await corpoDe(req);
    const alvo = tarefas.find((x) => x.id === id);
    if (alvo) Object.assign(alvo, campos);
    return res.writeHead(200).end(JSON.stringify(alvo ? [{ id }] : []));
  }
  // 242: editar e excluir tag pela ficha (excluir tira a tag dos cards, como o on delete cascade do banco)
  if (tabela === "tags" && req.method === "PATCH") {
    const alvo = tags.find((x) => x.id === id);
    if (alvo && !alvo.aprovacao) Object.assign(alvo, await corpoDe(req));
    return res.writeHead(200).end(JSON.stringify(alvo ? [{ id }] : []));
  }
  if (tabela === "tags" && req.method === "DELETE") {
    const i = tags.findIndex((x) => x.id === id && !x.aprovacao);
    if (i >= 0) { tags.splice(i, 1); for (const t of tarefas) t.tarefa_tags = t.tarefa_tags.filter((x) => x.tag_id !== id); }
    return res.writeHead(204).end();
  }
  if (tabela === "fazendo_agora" && req.method === "DELETE") {
    const quem = url.searchParams.get("pessoa_id")?.replace(/^eq\./, "");
    for (let i = fazendoAgora.length; i--;) if (fazendoAgora[i].pessoa_id === quem) fazendoAgora.splice(i, 1);
    return res.writeHead(204).end();
  }
  const corpo = req.method === "DELETE" ? {} : await corpoDe(req);
  if (tabela === "fazendo_agora") {
    const i = fazendoAgora.findIndex((x) => x.pessoa_id === corpo.pessoa_id);
    if (i >= 0) fazendoAgora[i] = corpo; else fazendoAgora.push(corpo);
  } else if (tabela === "tags" && req.method === "POST") tags.push(corpo);
  else if (tabela === "empresas") { const i = empresas.findIndex((x) => x.id === corpo.id); if (i >= 0) empresas[i] = corpo; else empresas.push(corpo); }
  else if ((tabela === "anotacoes_dia" || tabela === "nao_esquecer") && req.method === "POST") {
    const lista = tabelas[tabela], i = lista.findIndex((x) => x.dono_id === corpo.dono_id && x.dia === corpo.dia);
    if (i >= 0) lista[i] = corpo; else lista.push(corpo);
  }
  // 256: ideias e colunas do mural. on_conflict + "ignore-duplicates" como o banco de verdade; DELETE por id.
  else if ((tabela === "ideias" || tabela === "ideias_categorias") && req.method === "POST") {
    const lista = tabelas[tabela], chaves = (url.searchParams.get("on_conflict") ?? "id").split(","), ignora = (req.headers.prefer ?? "").includes("ignore-duplicates");
    for (const l of [].concat(corpo)) {
      const i = lista.findIndex((x) => chaves.every((k) => x[k] === l[k]));
      if (i < 0) lista.push({ ...l, seq: Math.max(0, ...lista.map((x) => x.seq)) + 1 }); else if (!ignora) lista[i] = { ...lista[i], ...l };
    }
  } else if (tabela === "ideias" && req.method === "DELETE") { const i = ideias.findIndex((x) => x.id === id); if (i >= 0) ideias.splice(i, 1); }
  // Qualquer outra escrita: aceita e não guarda (esta é só uma cópia para olhar).
  res.writeHead(req.method === "POST" ? 201 : 200).end(JSON.stringify([{ id: "x" }]));
}).listen(PORTA_BANCO, "127.0.0.1", () => console.log(`banco falso de exemplo em 127.0.0.1:${PORTA_BANCO}`));
