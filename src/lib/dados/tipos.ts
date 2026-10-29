// Modelo único: a tarefa. Conteúdo é um TIPO de tarefa, não uma tabela à parte.
export const TIPOS = ["ideia", "roteiro", "gravacao", "edicao", "postagem", "reuniao", "outro"] as const;
export const REDES = ["instagram", "tiktok", "youtube", "kwai"] as const;
export const ETAPAS = ["roteiro", "gravacao", "edicao", "analise", "aprovado", "postado"] as const;
/** Formato do post (item 200): escolhido em "Programar postagem"; o n8n usa para a pasta do Drive (sem formato = "Sem formato"). */
export const FORMATOS = ["reels", "post", "carrossel", "story"] as const;
/** Onde a postagem automática (196) publica. Só a You por enquanto. */
export const REDES_POST = ["instagram", "facebook"] as const;
export const RESPONSAVEIS = ["natham", "matheus", "adrian", "lucas"] as const; // as 4 pessoas do banco; Natham, Matheus e Adrian têm login (266)
/** 266: Adrian faz o que o Natham faz em aprovação e no caderno do Matheus (aprovar, consertar, "Quem aprova", ler o "Caderno de Matheus").
    Espelha private.pode_aprovar, pode_trocar_aprovador e natham_le_matheus (026). Não vale para o resto do que é do Natham. */
export const comoNatham = (eu: string | null | undefined) => eu === "natham" || eu === "adrian";
/** 269: quem aprova, programa e posta em QUALQUER card: Natham, Adrian e Matheus (aprovação presencial). Espelha private.pode_aprovar (027). */
export const aprovaSempre = (eu: string | null | undefined) => comoNatham(eu) || eu === "matheus";
export const ETIQUETAS = [
  "etiqueta-1", "etiqueta-2", "etiqueta-3", "etiqueta-4", "etiqueta-5",
  "etiqueta-6", "etiqueta-7", "etiqueta-8", "etiqueta-9", "etiqueta-10",
  "etiqueta-11", "etiqueta-12", "etiqueta-13", "etiqueta-14", "etiqueta-15", "etiqueta-16",
] as const;

export type TipoTarefa = (typeof TIPOS)[number];
export type Rede = (typeof REDES)[number];
export type Etapa = (typeof ETAPAS)[number];
export type Responsavel = (typeof RESPONSAVEIS)[number];
export type Formato = (typeof FORMATOS)[number];
export type RedePost = (typeof REDES_POST)[number];
/** Item 296: cor da LINHA inteira no Caderno (mesmo efeito da reunião, outro tom). Sem valor = sem cor (a reunião é dourada por padrão). */
export const CORES_LINHA = ["azul", "roxo", "dourado", "vermelho", "verde", "rosa"] as const;
export type CorLinha = (typeof CORES_LINHA)[number];
export type Etiqueta = (typeof ETIQUETAS)[number]; // usa var(--etiqueta-N) e var(--etiqueta-N-texto)

export type Link = { rotulo: string; url: string }; // vídeo = link do Google Drive
/** Anexo da ficha (imagem ou vídeo). Hoje url = endereço temporário na memória do navegador; guardar de verdade depende do banco (Fase 2). */
/** `caminho` = onde está no balde "arquivos" do Storage (só existe depois de guardado); `pendente` = o arquivo escolhido que ainda não subiu. */
export type Arquivo = { nome: string; url?: string; tipo?: "imagem" | "video" | "documento"; caminho?: string; pendente?: File;
  /** Depois da limpeza de 3 dias o arquivo sai do Storage: `removido` e o `driveLink` toma o lugar da `url`. `aviso` é o texto do banco (ex.: cópia no Drive falhou). */
  driveLink?: string; removido?: boolean; aviso?: string;
  /** 203: `id` = linha da tabela arquivos; `driveId` = arquivo no Drive (aí não há `caminho`); `ordem` = posição no carrossel; `papel` "capa" = capa do Reels. */
  id?: string; driveId?: string; ordem?: number; papel?: "anexo" | "capa" | "original" };
/** 270: "original" = vídeo sem legenda, guardado quando sobe o legendado num card Aprovado; não vai ao post (o 027 troca o papel no banco). */

/** Uma rede de uma postagem automática (196), escrita só pela função postar-meta. fila/enviando/processando = "Postando…". */
export type Postagem = { rede: RedePost; status: "fila" | "enviando" | "processando" | "postado" | "erro"; link?: string; erro?: string; postadoEm?: string };

export type Tarefa = {
  id: string;
  titulo: string;
  tipo: TipoTarefa;
  empresaId: string;
  rede?: Rede;
  etapa?: Etapa;
  responsavel: Responsavel;
  /** Data/hora local sem fuso: "2026-10-21T14:00" (ou "2026-10-21" se diaInteiro). Sem início = "sem data". */
  inicio?: string;
  fim?: string;
  diaInteiro: boolean;
  /** Item 292: linha do Caderno "Sem data" onde a tarefa fica (0 = primeira). Sem valor = empilha nas primeiras livres. Só vale sem `inicio`. */
  linhaCaderno?: number;
  corLinha?: CorLinha;
  cor: Etiqueta;
  /** Feita? Opcional: ausente = não concluída. */
  concluida?: boolean;
  /** Para que serve o conteúdo (só postagem usa): aparece no Mapa. */
  objetivo?: string;
  notas?: string;
  links: Link[];
  arquivos: Arquivo[];
  /** Ids das tags marcadas (ver Tag). */
  tags?: string[];
  /** Quem aprova este conteúdo (nome livre). Só vale com uma tag de aprovação marcada; fica no conteúdo, não na tag. */
  aprovador?: string;
  /** Data e hora do post (item 195), "AAAA-MM-DDTHH:mm" em Brasília. Só em Aprovado/Postado; o banco passa para Postado quando ela chega. */
  postarEm?: string;
  /** Quando o card ENTROU em Postado (o banco grava; é daqui que se contam os 7 dias da limpeza). ISO. */
  postadoEm?: string;
  /** Formato do post (item 200). Obrigatório na tela para programar; o banco aceita sem. */
  formato?: Formato;
  /** Etiqueta "Conserto" (item 195): quem aprova mandou voltar para Edição. Some quando o card sai de Edição. */
  conserto?: boolean;
  /** 271: o que o aprovador pede para editar (campo "Conserto" da ficha). Com texto, o card mostra a tag Conserto; some quando o card é aprovado. */
  consertoTexto?: string;
  /** Postagem automática (196). Depois de Aprovado, legenda, formato, redes e quadro da capa só mudam pelo Natham ou pelo aprovador (019). */
  legenda?: string;
  /** Ausente = as duas redes (padrão do banco). */
  postarRedes?: RedePost[];
  /** Quadro do vídeo usado como capa do Reels no Instagram, em ms (thumb_offset). Ausente = primeiro quadro. Capa própria vence. */
  capaQuadroMs?: number;
  /** Pasta da ocasião no Drive (203); quem cuida é o Vitral (CampoOcasiao). */
  ocasiaoId?: string;
  /** Resultado por rede, só leitura (tabela postagens). */
  postagens?: Postagem[];
  /** Só na tela, não vai ao banco: o salvar desta sessão tirou a data (carrossel com vídeo só para o Facebook). Nunca programado não conta. */
  programacaoCancelada?: boolean;
  /** A1 (040): número de edição do card. O salvar manda o que a tela viu; se o banco já tem outro, recusa (o card mudou). Sem a coluna, undefined. */
  versao?: number;
  /** Vêm do banco, só leitura. dono = de quem é o caderno; enviadaPor = quem mandou (só se foi enviada). */
  dono?: Responsavel;
  criadoPor?: Responsavel;
  enviadaPor?: Responsavel;
  /** Vai para a agenda do Google do responsável (volta da agenda, 010). Só o Calendário liga isto, ao CRIAR a tarefa; depois não muda (o banco trava). Tarefa do Caderno nunca vai. */
  vaiProGoogle?: boolean;
  /** 315: veio da pauta de postagens (calendário de postagens). Só leitura: o app nunca manda esta coluna; o banco impede que vire card (CHECK tarefas_pauta_sem_etapa). */
  planejadaId?: string;
};

/** Rótulo colorido que se cria e se marca nos conteúdos. aprovacao = marcar pede "Quem aprova". */
export type Tag = { id: string; nome: string; cor: Etiqueta; aprovacao?: boolean };
/** Quem aprova por padrão; outros nomes entram pela ficha. */
export const APROVADORES = ["Natham", "Matheus", "Adrian"] as const;

export type Empresa = { id: string; nome: string; sigla: string };

/** enviarPara (só ao criar): entrega a tarefa no caderno dessa pessoa; o banco registra quem mandou. Sem ele, fica no seu caderno. */
export type NovaTarefa = Omit<Tarefa, "id"> & { id?: string; enviarPara?: Responsavel };

/** Selo "fazendo agora": quem marcou a tarefa e desde quando (ISO). */
export type Fazendo = { quem: Responsavel; desde: string };
