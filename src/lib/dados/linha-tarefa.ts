// Linha da tabela tarefas <-> Tarefa da tela, e as recusas do banco em frase que se entende. Sem estado: saiu do repositorio.ts
// para ele caber no limite de linhas (pente fino r1). Quem importa continua importando de ./repositorio, que reexporta.
import type { Postagem, Responsavel, Tarefa } from "./tipos";

export type LinhaTarefa = {
  id: string; titulo: string; tipo: Tarefa["tipo"]; empresa_id: string | null; rede: Tarefa["rede"] | null; etapa: Tarefa["etapa"] | null;
  responsavel_id: string; inicio: string | null; fim: string | null; dia_inteiro: boolean; cor: Tarefa["cor"]; concluida: boolean;
  objetivo: string | null; notas: string | null; links: Tarefa["links"]; aprovador: string | null;
  dono_id: string; criado_por: string; enviada_por: string | null; vai_pro_google?: boolean; planejada_id?: string | null; /* 315: só existe depois do SQL da pauta */ postar_em?: string | null; conserto?: boolean; conserto_texto?: string | null; formato?: Tarefa["formato"] | null;
  postado_em?: string | null; legenda?: string | null; postar_redes?: Tarefa["postarRedes"] | null; capa_quadro_ms?: number | null; ocasiao_id?: string | null;
  tarefa_tags?: { tag_id: string }[]; linha_caderno?: number | null; cor_linha?: Tarefa["corLinha"] | null; /* 292/296: só existem depois do SQL colado */ versao?: number; /* A1: só depois do 040 */
};

/** Linha do banco -> Tarefa da tela. `arquivos` vem da tabela arquivos (ver carregarAnexos); `postagens`, da tabela postagens (019). `quem`: id da pessoa -> slug. */
export function daLinha(l: LinhaTarefa, arquivos: Tarefa["arquivos"] = [], quem: (id: string | null) => Responsavel | undefined, postagens?: Postagem[]): Tarefa {
  const ids = l.tarefa_tags?.map((x) => x.tag_id);
  return {
    id: l.id, titulo: l.titulo, tipo: l.tipo, empresaId: l.empresa_id ?? "", rede: l.rede ?? undefined, etapa: l.etapa ?? undefined,
    responsavel: quem(l.responsavel_id) ?? "natham", inicio: l.inicio ?? undefined, fim: l.fim ?? undefined, diaInteiro: l.dia_inteiro,
    cor: l.cor, concluida: l.concluida || undefined, objetivo: l.objetivo ?? undefined, notas: l.notas ?? undefined,
    links: l.links ?? [], arquivos, tags: ids?.length ? ids : undefined, aprovador: l.aprovador ?? undefined,
    dono: quem(l.dono_id), criadoPor: quem(l.criado_por), enviadaPor: quem(l.enviada_por), vaiProGoogle: l.vai_pro_google || undefined, planejadaId: l.planejada_id ?? undefined,
    postarEm: l.postar_em ?? undefined, postadoEm: l.postado_em ?? undefined, conserto: l.conserto || undefined, consertoTexto: l.conserto_texto === undefined ? undefined : l.conserto_texto ?? "", formato: l.formato ?? undefined,
    legenda: l.legenda ?? undefined, postarRedes: l.postar_redes ?? undefined, capaQuadroMs: l.capa_quadro_ms ?? undefined, ocasiaoId: l.ocasiao_id ?? undefined,
    postagens: postagens?.length ? postagens : undefined, linhaCaderno: l.linha_caderno ?? undefined, corLinha: l.cor_linha ?? undefined, versao: l.versao ?? undefined,
  };
}

export const semAcesso = "O banco não deixou salvar (sem permissão ou o item não existe mais).";
/** A1 (040): o card mudou desde que a ficha abriu. A ficha continua aberta com o que a pessoa escreveu. */
export const MUDOU = "Este card mudou enquanto você editava (outra pessoa ou a postagem automática). O que você escreveu continua aqui: copie o que quiser guardar, feche e abra o card de novo.";
/** r2 F1: o card foi apagado (por outra pessoa) com a ficha aberta. O salvar não o recria. */
export const APAGADO = "Este card foi apagado enquanto você editava. O que você escreveu continua aqui: copie o que quiser guardar e feche a ficha.";
/** Recusas do banco que a pessoa entende (015/019): quem aprova, e Aprovado/Postado só para Postagem. */
export function motivoDoBanco(e: unknown, padrao: string) {
  const { code, message } = (e ?? {}) as { code?: string; message?: string };
  if (code === "40001") return MUDOU;
  if (code === "P0002" && message?.includes("card apagado")) return APAGADO; // r2 F1
  if (message?.includes("sem permissao para alterar")) return "Essa tarefa é só para olhar: você não pode mexer nela."; // r2 F7/B8 (antes vinha "chave duplicada")
  if (code === "55000" && message?.includes("já foi postado")) return message; // r4 F2 (b), 039 do Bussola: a frase do banco vai como está
  if (code === "55000" && message?.includes("Escolha a data")) return "Escolha a data e a hora do post antes de tentar de novo."; // r2 B1 (037)
  if (code === "55006") return "Os arquivos deste card estão sendo apagados do Drive agora. Tente de novo em alguns minutos."; // r3 A6 (Bussola): tirar de Postado durante a limpeza
  if (code === "22023" && message?.includes("so para a You")) return "Postagem automática só para a You: card de outra empresa vai para Postado à mão."; // M1 (trava do banco)
  if (code === "42501") return "Só o Natham ou quem aprova o card pode fazer isso.";
  if (code === "23514" && message?.includes("tarefas_pauta_sem_etapa")) return "Tarefa da pauta de postagens fica no Caderno: ela não vira card da Esteira. O post sai pela Esteira.";
  if (code === "23514" && message?.includes("Postagem")) return "Só card de Postagem vai para Aprovado e Postado. Para terminar, use Concluir.";
  return e instanceof Error && e.message === semAcesso ? e.message : padrao;
}

/** A função chamada ainda não existe no banco. PGRST202 = a API não a encontrou (42883 = o Postgres não a achou). */
export const funcaoAusente = (e: { code?: string } | null) => e?.code === "PGRST202" || e?.code === "42883";
