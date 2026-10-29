// Pastas do Drive do item 229 (Empresa → Formato → Tema → pasta do conteúdo): criar, mover, renomear, tirar. Separado de acoes.ts só para caber no limite de linhas.
import { chaves, MINUTOS_PARA_LIMPAR, nomeFormato, nomePastaConteudo, SEM_TEMA } from "../_shared/pastas.ts";
import { Recusa } from "./comum.ts";
import { ErroDrive, type ArquivoDrive, type DriveApi } from "./drive-api.ts";
import { ErroRest, type Linha, type Rest } from "./rest.ts";

export type Tema = { id: string; empresa_id: string; nome: string; permanente: boolean };
export type Card = { id: string; titulo: string; empresa_id: string | null; ocasiao_id: string | null; etapa: string | null; formato: string | null };
export const COLUNAS_CARD = "id,titulo,empresa_id,ocasiao_id,etapa,formato";
const LIMITE_RENOMEAR = 40; // pastas de conteúdo renomeadas por chamada (uma ida ao Drive cada)

export function criarPastas(d: { api: DriveApi; env: (n: string) => string | undefined }, servico: () => Rest) {
  // ---- pastas no Drive ----
  async function pastaFixa(chave: string, criar: () => Promise<string>): Promise<string> {
    const s = servico();
    const [x] = await s.ler<{ drive_id: string }>("drive_pastas", { chave }, "drive_id");
    if (x) return x.drive_id;
    const id = await criar();
    if ((await s.inserir("drive_pastas", { chave, drive_id: id }, "chave")).length) return id;
    await d.api.lixeira(id); // outra chamada criou ao mesmo tempo: fica a dela
    return (await s.ler<{ drive_id: string }>("drive_pastas", { chave }, "drive_id"))[0].drive_id;
  }
  const pastaRaiz = () => pastaFixa("raiz", async () => {
    const id = await d.api.criarPasta("Tarefas · Conteúdos");
    const email = d.env("DRIVE_COMPARTILHAR_COM"); // e-mail do Matheus (D3); sem ele, a pasta fica só do Natham
    if (email) await d.api.compartilhar(id, email);
    return id;
  });
  async function pastaEmpresa(empresaId: string) {
    const [e] = await servico().ler<{ nome: string }>("empresas", { id: empresaId }, "nome");
    if (!e) throw new Recusa(404, "Empresa não encontrada.");
    const raiz = await pastaRaiz();
    return pastaFixa(`empresa:${empresaId}`, () => d.api.criarPasta(e.nome, raiz));
  }
  /** O tema do card (tem de ser da empresa dele). Sem tema = undefined = pasta "Sem tema". */
  async function temaDe(id: string | null | undefined, empresaId: string): Promise<Tema | undefined> {
    if (!id) return undefined;
    const [o] = await servico().ler<Tema>("ocasioes", { id });
    if (!o) return undefined;
    if (o.empresa_id !== empresaId) throw new Recusa(409, "O tema deste card é de outra empresa. Escolha um tema da empresa do card.");
    return o;
  }
  /** Cria o tema: só a linha. As pastas do Drive nascem quando chega o 1º arquivo (nenhuma pasta vazia fica pelo Drive). */
  async function novoTema(empresaId: string, nome: string, pessoaId: string, permanente: boolean): Promise<Linha> {
    const s = servico();
    const igual = (await s.ler("ocasioes", { empresa_id: empresaId })).find((o) => String(o.nome).trim().toLowerCase() === nome.toLowerCase());
    if (igual) throw new Recusa(409, "Já existe um tema com esse nome.");
    try {
      return (await s.inserir("ocasioes", { empresa_id: empresaId, nome, permanente, criado_por: pessoaId }))[0];
    } catch (e) {
      if (e instanceof ErroRest && e.status === 409) throw new Recusa(409, "Já existe um tema com esse nome.");
      throw e;
    }
  }
  // Empresa → Formato → Tema (cada uma criada uma vez só, guardada em drive_pastas)
  async function pastaDeFormato(empresaId: string, formato: unknown) {
    const empresa = await pastaEmpresa(empresaId);
    return pastaFixa(chaves.formato(empresaId, formato), () => d.api.criarPasta(nomeFormato(formato), empresa));
  }
  async function pastaDeTema(empresaId: string, formato: unknown, tema: Tema | undefined) {
    const formatoPasta = await pastaDeFormato(empresaId, formato);
    return pastaFixa(chaves.tema(tema?.id, empresaId, formato), () => d.api.criarPasta(tema?.nome ?? SEM_TEMA, formatoPasta));
  }
  const cardDe = async (id: string): Promise<Card> => {
    const [t] = await servico().ler<Card>("tarefas", { id }, COLUNAS_CARD);
    if (!t) throw new Recusa(404, "Card não encontrado.");
    return t;
  };
  /** Pasta do conteúdo ("<Formato> <tema> - <título>"). Se já existe, MOVE para o lugar certo e RENOMEIA (pelo id: link, player e capa não quebram). */
  async function pastaDoConteudo(t: Card): Promise<{ id: string; mudouDeLugar: boolean }> {
    if (!t.empresa_id) throw new Recusa(400, "Escolha a empresa para anexar arquivo.");
    const s = servico();
    const tema = await temaDe(t.ocasiao_id, t.empresa_id);
    const pai = await pastaDeTema(t.empresa_id, t.formato, tema);
    const nome = nomePastaConteudo(t.formato, tema?.nome, t.titulo), chave = chaves.conteudo(t.id);
    const [x] = await s.ler<{ drive_id: string }>("drive_pastas", { chave }, "drive_id");
    if (!x) {
      const id = await d.api.criarPasta(nome, pai);
      if ((await s.inserir("drive_pastas", { chave, drive_id: id }, "chave")).length) return { id, mudouDeLugar: false };
      await d.api.lixeira(id); // outra chamada criou ao mesmo tempo: fica a dela
      return { id: (await s.ler<{ drive_id: string }>("drive_pastas", { chave }, "drive_id"))[0].drive_id, mudouDeLugar: false };
    }
    let f: ArquivoDrive | undefined;
    try { f = await d.api.ver(x.drive_id); } catch (e) { if (!(e instanceof ErroDrive && e.status === 404)) throw e; }
    if (!f || f.trashed) { await s.apagar("drive_pastas", { chave }); return pastaDoConteudo(t); } // alguém tirou a pasta do Drive: refaz
    const mudouDeLugar = !f.parents?.includes(pai);
    if (mudouDeLugar) await d.api.mover(x.drive_id, pai, f.parents ?? []);
    if (f.name !== nome) await d.api.renomear(x.drive_id, nome);
    return { id: x.drive_id, mudouDeLugar };
  }
  /** Rearma (ou desarma) a contagem de 7 dias de um card Postado: o alarme de serviço é o mesmo do gatilho do banco. */
  const rearmarLimpeza = (tarefa: string, permanente: boolean) =>
    servico().rpc(permanente ? "desarmar_alarme_servico" : "armar_alarme_servico", permanente ? { p_tipo: "limpar", p_tarefa: tarefa } : { p_tipo: "limpar", p_tarefa: tarefa, p_minutos: MINUTOS_PARA_LIMPAR });

  /** Manda a pasta do conteúdo para a lixeira e esquece a chave. Repetir é seguro (pasta que já não existe conta como feita). */
  async function tirarPastaDoConteudo(tarefaId: string) {
    const s = servico(), chave = chaves.conteudo(tarefaId);
    const [x] = await s.ler<{ drive_id: string }>("drive_pastas", { chave }, "drive_id");
    if (!x) return;
    await d.api.lixeira(x.drive_id);
    await s.apagar("drive_pastas", { chave });
  }
  /** Apaga os arquivos do card. `soDrive` (a limpeza dos 7 dias): só o que está no DRIVE; anexo antigo do Supabase (sem drive_id) NUNCA é tocado, fica só na ficha.
      Apagar o card de propósito (soDrive falso) leva também os anexos do Supabase. Devolve false se a limpeza parou porque o card saiu de Postado. */
  async function esvaziar(tarefaId: string, soDrive = false): Promise<boolean> {
    const s = servico();
    // A6 (pente fino r1): a limpeza reconfere a etapa antes de CADA exclusão e antes da pasta; card que voltou para Edição fica com o que sobrou.
    // shortcut: entre conferir e apagar sobra uma janela de milissegundos (o Drive não tem trava); o arquivo vai para a lixeira, que guarda 30 dias.
    const segue = async () => !soDrive || (await cardDe(tarefaId)).etapa === "postado";
    const linhas = await s.ler<{ id: string; drive_id: string | null; caminho: string | null }>("arquivos", { tarefa_id: tarefaId }, "id,drive_id,caminho");
    // cada linha sai logo depois do seu arquivo: se algo falhar no meio, o que sobra no banco é exatamente o que ainda está no Drive (e dá para tentar de novo)
    for (const l of linhas) if (l.drive_id) {
      if (!(await segue())) return false;
      await d.api.lixeira(l.drive_id); await s.apagar("arquivos", { id: l.id });
    }
    const sup = soDrive ? [] : linhas.flatMap((l) => (l.caminho ? [l.caminho] : []));
    await s.removerObjetos("arquivos", sup);
    if (sup.length) await s.apagar("arquivos", { tarefa_id: tarefaId });
    if (!(await segue())) return false;
    await tirarPastaDoConteudo(tarefaId);
    return true;
  }
  /** Renomeia as pastas dos conteúdos de um tema (o nome delas leva o tema), até LIMITE_RENOMEAR por chamada, a partir do `cursor` (id do último card visto).
      Devolve `cursor` (para a próxima chamada) e `restantes` (só pastas que existem) quando ainda falta; sem cursor = terminou. */
  async function renomearConteudos(temaId: string, depois = ""): Promise<{ restantes: number; cursor?: string }> {
    const s = servico();
    const cards = (await s.ler<Card>("tarefas", { ocasiao_id: temaId }, COLUNAS_CARD)).sort((x, y) => x.id.localeCompare(y.id));
    const temPasta = async (card: Card) => (await s.ler("drive_pastas", { chave: chaves.conteudo(card.id) }, "chave")).length > 0;
    let feitos = 0, ultimo = depois;
    for (const card of cards.filter((x) => x.id > depois)) {
      if (!(await temPasta(card))) { ultimo = card.id; continue; }
      if (feitos >= LIMITE_RENOMEAR) {
        let restantes = 0;
        for (const r of cards.filter((x) => x.id > ultimo)) if (await temPasta(r)) restantes++;
        return { restantes, cursor: ultimo };
      }
      await pastaDoConteudo(card);
      ultimo = card.id;
      feitos++;
    }
    return { restantes: 0 };
  }
  return { pastaEmpresa, renomearConteudos, temaDe, novoTema, pastaDeFormato, pastaDeTema, cardDe, pastaDoConteudo, rearmarLimpeza, tirarPastaDoConteudo, esvaziar };
}
