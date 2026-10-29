// FICHA DA TAREFA (modal na ID Nevoa). Usada pelo Calendário, Tarefas e Conteúdos. Como usar:
//
//   import { Ficha, tarefaEmBranco, NOMES } from "@/components/ficha/Ficha";
//   const [aberta, setAberta] = useState<NovaTarefa | null>(null);
//   <button onClick={() => setAberta(tarefa)}>…</button>                       // editar uma tarefa existente
//   <button onClick={() => setAberta(tarefaEmBranco({ etapa: "roteiro" }))}>…</button>  // criar (sem id = nova)
//   {aberta && <Ficha tarefa={aberta} aoFechar={() => setAberta(null)} />}
//
// - Renderize só quando houver tarefa (o estado interno nasce da tarefa recebida).
// - A ficha salva sozinha (salvarTarefa / removerTarefa) e chama aoFechar. Esc e clique fora fecham sem salvar.
// - soLer: só para olhar (Caderno de outra pessoa): campos travados, sem Salvar nem lixeira; links do Drive e das notas seguem abrindo.
//   Lixeira no pé (item 179) só para quem podeApagar: clicar troca o pé por Apagar (vermelho) e Cancelar; Esc também cancela.
// - Fazendo agora (item 170): tarefa já salva mostra Começar/Parar no topo e quem está nela desde quando (todos veem de todos).
// - Postagem em "Em análise" (item 208): Consertar e Aprovar no fim da ficha, depois de Notas (item 219), para quem aprova. Gravam a ficha
//   inteira com a etapa nova (Lupa 215, como a Publicação) e a ficha continua aberta já no novo estado.
// - aoSalvar: chamado com o que foi gravado quando o banco aceita (o Calendário avisa da tarefa salva sem empresa com o filtro ligado).
// - Sem campo Etapa (item 205): a etapa muda arrastando na Esteira; card novo com empresa entra em Roteiro (etapaAoSalvar).
// - tipos: limita o menu Tipo (a Esteira passa só os tipos que são colunas, item 194); sem ele, todos.
// - NOMES traz o texto de tela de cada valor: NOMES.tipo.gravacao = "Gravação", NOMES.rede.kwai = "Kwai", etc.
"use client";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ehConteudo } from "@/components/tarefas/grade";
import {
  FORMATOS, REDES, duplicarCard, RESPONSAVEIS, TIPOS, arquivosDoDrive, lerErro, organizarCard, recarregarTags, limparErro, podeAlterar, podeApagar, removerTarefa, salvarTarefa, useEmpresas, useErroDados, useEu, useTags, useTarefas, useTarefasNoGoogle,
  type Etapa, type Formato, type Link as LinkDrive, type NovaTarefa, type Rede, type Responsavel, type Tarefa, type TipoTarefa,
} from "@/lib/dados";
import Link from "next/link";
import { vaiProGoogle } from "@/components/calendario/logica";
import { tomDaEmpresa } from "@/lib/cores-empresa";
import { Pessoa } from "@/components/ui/Pessoa";
import { Selecao } from "@/components/ui/Selecao";
import { IconeRede, SeloEmpresa } from "@/components/ui/Marca";
import { Agora } from "./Agora";
import { podeAprovar } from "./Aprovacao";
import { Anexos } from "./Anexos";
import { Confirmar } from "./Confirmar";
import { TituloFicha } from "./TituloFicha";
import { useSaidaFicha } from "./saida-ficha";
import { useArquivosQueChegam } from "./anexos-vivos";
import { CamposPost } from "./CamposPost";
import { Publicacao } from "./Publicacao";
import { TagsFicha } from "./TagsFicha";
import { LINK_VALIDO, LinksDrive } from "./LinksDrive";
import { AvisosVideo, CampoConserto } from "./Conserto";
import { arrumar, ehQuemAprova, etapaAoSalvar, fimValido, mudouPasta, podeTrocarAprovador, soTagsQueExistem, trocarEmpresa } from "./arrumar";
import { CampoOcasiao, PrazoDrive } from "./CampoOcasiao";
import { TextoComLinks } from "@/components/pastas/links";
import "./ficha.css";

export const NOMES = {
  tipo: { ideia: "Ideia", roteiro: "Roteiro", gravacao: "Gravação", edicao: "Edição", postagem: "Postagem", reuniao: "Reunião", outro: "Outro" },
  rede: { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", kwai: "Kwai" },
  formato: { reels: "Reels", post: "Post", carrossel: "Carrossel", story: "Story" },
  etapa: { roteiro: "Roteiro", gravacao: "Gravação", edicao: "Edição", analise: "Em análise", aprovado: "Aprovado", postado: "Postado" },
  responsavel: { natham: "Natham", matheus: "Matheus", adrian: "Adrian", lucas: "Lucas" },
} as const satisfies {
  tipo: Record<TipoTarefa, string>; formato: Record<Formato, string>; rede: Record<Rede, string>; etapa: Record<Etapa, string>; responsavel: Record<Responsavel, string>;
};

/** Tarefa nova com valores padrão. empresaId vazio: com etapa (o + de uma coluna da Esteira), a ficha escolhe a primeira empresa
    cadastrada; sem etapa (Calendário), fica sem empresa e só vira card se a pessoa escolher uma (item 217). */
export const tarefaEmBranco = (parcial: Partial<NovaTarefa> = {}): NovaTarefa => ({
  titulo: "", tipo: "outro", empresaId: "", responsavel: "natham", diaInteiro: false,
  cor: "etiqueta-1", links: [], arquivos: [], ...parcial,
});

const NENHUMA = "nenhuma"; // valor do seletor Empresa; a tarefa sem empresa guarda empresaId ""

export function Ficha({ tarefa, aoFechar, aoSalvar, soLer, tipos = TIPOS }: {
  tarefa: NovaTarefa; aoFechar: () => void; aoSalvar?: (salva: NovaTarefa) => void; soLer?: boolean; tipos?: readonly TipoTarefa[];
}) {
  const empresas = useEmpresas();
  const tags = useTags();
  const todas = useTarefas();
  const eu = useEu();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [t, setT] = useState<NovaTarefa>(() => ({ ...tarefa, empresaId: tarefa.id || !tarefa.etapa ? tarefa.empresaId : tarefa.empresaId || empresas[0]?.id || "" })); // tarefa já existente sem empresa continua sem empresa (item 125)
  // 308: a ficha não tem mais campo Começa nem Termina. O início e o fim que a tarefa já tinha ficam como estão (o salvar devolve o mesmo valor);
  // tarefa nova sem início continua sem início ("Sem data"), sem data inventada.
  const data = tarefa.inicio?.slice(0, 10) ?? "";
  const horaIni = tarefa.inicio?.slice(11, 16) || "09:00";
  const horaFim = tarefa.id ? tarefa.fim?.slice(11, 16) ?? "" : "";
  const dataFim = tarefa.id ? tarefa.fim?.slice(0, 10) ?? "" : "";
  const [links, setLinks] = useState<LinkDrive[]>(tarefa.links);
  const [arquivos, setArquivos] = useState(tarefa.arquivos);
  const [editandoNotas, setEditandoNotas] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [duplicando, setDuplicando] = useState(false); // 313: confirmação antes de criar a cópia
  const [recusa, setRecusa] = useState(""); // Aprovar/Consertar que o banco recusou
  // Só fecha depois que o banco aceitou: se recusar, a ficha fica aberta com o aviso e nada do que foi escrito se perde.
  // (O aviso geral da casca fica atrás da ficha, então o erro aparece também no pé dela.)
  const erro = useErroDados();
  const [salvando, setSalvando] = useState(false);
  const gravando = useRef(false); // trava na hora do clique: o `salvando` só desliga os botões no próximo desenho
  const [decidindo, setDecidindo] = useState<"aprovado" | "edicao" | null>(null);
  const [enviou, setEnviou] = useState(false);
  useEffect(() => { if (enviou && !erro) aoFechar(); }, [enviou, erro, aoFechar]);
  const nova = !tarefa.id;
  // Selo do Google (item 192, Lupa R5-5): "Na agenda" só depois que o n8n confirmou; antes, "Indo" se a regra do banco deixa ir.
  const noGoogle = useTarefasNoGoogle().has(tarefa.id ?? "");
  const vai = vaiProGoogle(t, !!data, nova ? eu : tarefa.criadoPor);
  const dono = tarefa.dono ?? tarefa.responsavel;
  const fica = !nova && !soLer && !ehConteudo(t) && t.responsavel !== dono ? dono : undefined; // o banco não deixa mudar o dono
  const lixeira = !nova && podeApagar({ ...tarefa, id: tarefa.id! }, eu); // vale o que está no banco, não o que foi mudado na ficha
  const podeDuplicar = !nova && !soLer && !!tarefa.empresaId && !!tarefa.etapa; // só card da Esteira (empresa + etapa)
  const marcadas = t.tags ?? [];
  const pedeAprovador = tags.some((g) => g.aprovacao && marcadas.includes(g.id));
  const aprovadorTravado = !nova && !podeTrocarAprovador(tarefa.aprovador, eu);
  // 019: depois de Aprovado, o que vai para a rede (descrição do post, formato, arquivos, capa) só muda pelo Natham ou por quem aprova.
  const postTravado = !nova && (tarefa.etapa === "aprovado" || tarefa.etapa === "postado") && !(podeAlterar(tarefa as Tarefa, eu) && ehQuemAprova(tarefa.aprovador, eu));
  const fora = arquivos.filter((a) => a.papel === "capa" || a.papel === "original"); // não entram em Anexos: a capa (campo próprio) e o vídeo sem legenda guardado (270)
  const viva = todas.find((x) => x.id === tarefa.id); // a ficha nasce de uma cópia; a Publicação lê o card vivo (postando, erro, links)
  useArquivosQueChegam(viva?.arquivos, tarefa.arquivos, setArquivos); // 268
  const saida = useSaidaFicha([t, data, horaIni, horaFim, dataFim, links, arquivos.map((a) => a.id ?? a.nome)], !!soLer, () => dialogo.current?.close()); // 281
  const temEmpresa = empresas.some((x) => x.id === t.empresaId);
  const empresaOk = !t.empresaId || temEmpresa; // "" = sem empresa
  const mudar = <K extends keyof NovaTarefa>(campo: K, valor: NovaTarefa[K]) => setT((x) => ({ ...x, [campo]: valor }));
  // Enquanto grava a decisão, os botões ficam (desligados, "Aprovando…"): a escrita otimista já tirou o card de Em análise
  const decide = !soLer && viva?.tipo === "postagem" && (viva.etapa === "analise" || !!decidindo) && podeAprovar(viva, eu);
  // Lupa 215 (achados 1 e 2): grava a ficha inteira com a etapa nova, numa gravação só, sem fechar; o gravar põe a etapa nova
  // no rascunho (também quando só o anexo falhou), então um Salvar seguinte não desfaz a decisão.
  async function decidir(mudanca: { etapa: "aprovado" | "edicao"; conserto?: boolean }) {
    setRecusa("");
    setDecidindo(mudanca.etapa);
    const ok = await gravar(mudanca, false);
    setDecidindo(null);
    if (!ok) setRecusa(lerErro());
  }

  useEffect(() => {
    const d = dialogo.current;
    if (d && !d.open) d.showModal();
  }, []);

  /** Salva a ficha inteira (`extra` por cima: a Publicação manda redes e data); true = tudo gravado, anexos inclusive. `fechar` false: a ficha fica aberta.
      Card gravado com anexo que falhou (Lupa 215 v2) conta como salvo: o rascunho passa a ser o que foi gravado (com id e etapa nova,
      para um Salvar seguinte não criar outra tarefa nem desfazer a decisão) e aoSalvar é chamado; devolve false por causa do anexo. */
  async function gravar(extra: Partial<NovaTarefa> = {}, fechar = true): Promise<boolean> {
    if (soLer || !t.titulo.trim() || !empresaOk || gravando.current) return false; // dois cliques em Salvar criavam a tarefa duas vezes
    gravando.current = true;
    const quando: Pick<NovaTarefa, "inicio" | "fim" | "diaInteiro"> = !data
      ? { inicio: undefined, fim: undefined, diaInteiro: false }
      : t.diaInteiro
        ? { inicio: data, fim: undefined, diaInteiro: true }
        : { inicio: `${data}T${horaIni}`, fim: fimValido(data, horaIni, dataFim || data, horaFim), diaInteiro: false };
    limparErro();
    setEnviou(false);
    setSalvando(true);
    // Tarefa nova para outra pessoa vai para o caderno dela (achado 2, igual ao Caderno). Conteúdo com empresa todos já veem: fica de quem criou.
    const etapa = etapaAoSalvar(t);
    const enviarPara = nova && t.responsavel !== eu && !ehConteudo({ ...t, etapa }) ? t.responsavel : undefined;
    const existem = t.tags?.length ? await recarregarTags() : []; // 243: tag excluída enquanto a ficha estava aberta não vai
    const pronta = arrumar(t, pedeAprovador || t.etapa === "aprovado" || t.etapa === "postado", { // 272: sem a tag, o aprovador do card aprovado continua
      ...quando, etapa, enviarPara, arquivos, tags: soTagsQueExistem(t.tags, existem),
      vaiProGoogle: nova ? vai : tarefa.vaiProGoogle, // só liga na criação e se pode ir (R5-5)
      links: links.filter((l) => LINK_VALIDO.test(l.url.trim())).map((l) => ({ rotulo: l.rotulo.trim() || "Link do Drive", url: l.url.trim() })),
    });
    const salva = { ...(aprovadorTravado ? { ...pronta, aprovador: tarefa.aprovador } : pronta), ...extra }; // só Natham, Matheus ou quem aprova muda o aprovador (015, 223), mesmo tirando a tag
    const gravada = await salvarTarefa(salva);
    if (gravada) {
      setT((x) => ({ ...x, ...extra, id: gravada.id, etapa: gravada.etapa, conserto: gravada.conserto, consertoTexto: gravada.consertoTexto, tags: gravada.tags, versao: gravada.versao })); // etapa como ficou (Roteiro do 205, decisão); A1: a versão que este salvar deixou
      aoSalvar?.(salva);
      saida.salvou();
    }
    // 229: a pasta do conteúdo no Drive acompanha título, formato, tema e empresa. Se o Drive falhar, a ficha fica aberta com o aviso (o salvar vale).
    const aviso = gravada && viva && arquivosDoDrive(viva).length && mudouPasta(tarefa, salva)
      ? await organizarCard(gravada.id).then(() => "", (e) => `Salvo, mas a pasta no Drive não mudou: ${e instanceof Error ? e.message : "salve de novo."}`) : "";
    gravando.current = false; // r4 N3: os campos só voltam depois do Drive (organizarCard); antes, o texto digitado nessa espera se perdia
    setSalvando(false);
    if (aviso) setRecusa(aviso);
    if (fechar && !aviso) setEnviou(true);
    return !!gravada && !lerErro();
  }

  // 310: cópia de planejamento na Esteira ("<título> - Cópia N"); a ficha fecha e a cópia aparece na coluna
  async function duplicar() {
    if (!tarefa.id) return;
    setDuplicando(false);
    limparErro();
    const salvou = await salvarTarefa(duplicarCard(tarefa as Tarefa, todas, tags));
    if (salvou) setEnviou(true); else setRecusa(lerErro());
  }

  async function excluir() {
    if (!tarefa.id) return;
    limparErro();
    await removerTarefa(tarefa.id);
    setEnviou(true);
  }

  const dona = empresas.find((e) => e.id === t.empresaId);
  const corAtual = { "--etiqueta-atual": dona ? tomDaEmpresa(dona.id).r : t.etapa ? `var(--etapa-${t.etapa})` : "var(--borda)" } as CSSProperties;

  return (
    <dialog
      ref={dialogo}
      className="ficha"
      aria-label={nova ? "Nova tarefa" : `Tarefa ${tarefa.titulo}`}
      onClose={aoFechar} onCancel={(e) => { e.preventDefault(); if (apagando) setApagando(false); else saida.pedir(); }}
      onClick={(e) => e.target === e.currentTarget && saida.pedir()}
    >
      <form className="ficha-cartao" onSubmit={(e) => { e.preventDefault(); void gravar(); }} style={corAtual}>
        <header className="ficha-faixa">
          <div className="ficha-faixa-topo">
            <span className="ficha-rotulo"><span className="ficha-cor-marca" aria-hidden />{nova ? "Nova tarefa" : NOMES.tipo[t.tipo]}
              {(noGoogle || vai) && (
                <span className={`ficha-google${noGoogle ? "" : " ficha-google-indo"}`}>
                  <svg viewBox="0 0 24 24" aria-hidden><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
                  {noGoogle ? "Na agenda do Google" : "Indo para o Google"}
                </span>
              )}
            </span>
            {!nova && <Agora tarefaId={tarefa.id!} soLer={soLer} encerrada={viva?.tipo === "postagem" && (viva.etapa === "aprovado" || viva.etapa === "postado")} nomes={NOMES.responsavel} />}
            <button type="button" className="ficha-fechar" onClick={saida.pedir}>Fechar</button>
          </div>
          <TituloFicha valor={t.titulo} aoMudar={(v) => mudar("titulo", v)} soLer={!!soLer || salvando} />
        </header>

        {/* r3 N3: enquanto grava, os campos travam. O que ia para o banco é o que estava na hora do clique; digitar no meio ficava só na tela e se perdia ao fechar */}
        <fieldset className="ficha-corpo" disabled={soLer || salvando}>
          <div className="ficha-grade">
            <div className="ficha-campo ficha-escolha">
              <Selecao rotulo="Tipo" opcoes={tipos.map((v) => ({ valor: v, rotulo: NOMES.tipo[v] }))} valor={[t.tipo]} multipla={false} aoMudar={([v]) => { if (v) mudar("tipo", v as TipoTarefa); }} />
            </div>
            <div className="ficha-campo ficha-escolha">
              {empresas.length ? (
                <Selecao rotulo="Empresa" soIcone opcoes={[...empresas.map((x) => ({ valor: x.id, rotulo: x.nome, antes: <SeloEmpresa empresaId={x.id} nome={x.nome} tamanho={18} /> })), { valor: NENHUMA, rotulo: "Nenhuma" }]} valor={t.empresaId ? (temEmpresa ? [t.empresaId] : []) : [NENHUMA]} multipla={false} aoMudar={([v]) => { if (v) setT((x) => trocarEmpresa(x, v === NENHUMA ? "" : v)); }} />
              ) : (
                <p className="ficha-aviso" role="alert">
                  Nenhuma empresa cadastrada. <Link href="/configuracoes" onClick={() => dialogo.current?.close()}>Cadastrar em Configurações</Link>
                </p>
              )}
            </div>
            <div className="ficha-campo ficha-escolha">
              <Selecao rotulo="Rede" soIcone opcoes={REDES.map((v) => ({ valor: v, rotulo: NOMES.rede[v], antes: <IconeRede rede={v} tamanho={18} /> }))} valor={t.rede ? [t.rede] : []} multipla={false} rotuloTodos="Sem rede" aoMudar={([v]) => mudar("rede", v as Rede | undefined)} />
            </div>
            {t.tipo === "postagem" && (
              // Formato já ao criar/anexar (203): é dele que sai o campo Capa do Reels. O Programar postagem do card usa o mesmo valor.
              <div className="ficha-campo ficha-escolha" inert={postTravado}>
                <Selecao rotulo="Formato" opcoes={FORMATOS.map((v) => ({ valor: v, rotulo: NOMES.formato[v] }))} valor={t.formato ? [t.formato] : []} multipla={false} rotuloTodos="Sem formato" aoMudar={([v]) => mudar("formato", v as Formato | undefined)} />
              </div>
            )}
            {/* Ocasião = pasta do Drive dentro da empresa (203, Vitral); sem empresa não existe */}
            {t.empresaId && <div className="ficha-campo ficha-escolha ficha-tema"><CampoOcasiao empresaId={t.empresaId} formato={t.formato} valor={t.ocasiaoId} aoMudar={(id) => mudar("ocasiaoId", id)} /></div>}
          </div>

          <div className="ficha-quem-quando">
            <fieldset className="ficha-campo">
              <legend>Responsável</legend>
              <div className="ficha-pessoas">
                {RESPONSAVEIS.map((r) => (
                  <button key={r} type="button" className="ficha-pessoa" aria-pressed={t.responsavel === r} onClick={() => mudar("responsavel", r)}>
                    <Pessoa quem={r} tamanho={28} />
                    {NOMES.responsavel[r]}
                  </button>
                ))}
              </div>
              {fica && <p className="ficha-dica ficha-dica-fica">Continua no caderno de {NOMES.responsavel[fica]}: trocar o responsável não entrega a tarefa a outra pessoa.</p>}
            </fieldset>

            {!data && <p className="ficha-dica">Sem data: fica na coluna &quot;Sem data&quot; do calendário.</p>}
          </div>

          {t.tipo === "postagem" && (
            <Campo rotulo="Objetivo">
              <input value={t.objetivo ?? ""} onChange={(e) => mudar("objetivo", e.target.value)} placeholder="Para que serve este conteúdo?" />
            </Campo>
          )}
          {t.tipo === "postagem" && <CamposPost t={t} arquivos={arquivos} travado={postTravado} postado={viva?.etapa === "postado"} mudar={mudar} aoMudarCapa={(v) => setArquivos([...arquivos.filter((a) => a.papel !== "capa"), ...v])} />}
          {viva && <Publicacao salvo={viva} rascunho={{ ...t, arquivos }} mudar={mudar} gravar={gravar} />}

          <div className="ficha-opcional" aria-hidden>Opcional</div>
          <TagsFicha t={t} mudar={mudar} pedeAprovador={pedeAprovador} aprovadorTravado={aprovadorTravado} />

          <LinksDrive links={links} aoMudar={setLinks} />
          <div className="ficha-anexos-trava" data-travada={postTravado || undefined}><Anexos valor={arquivos.filter((a) => !fora.includes(a))} aoMudar={(v) => setArquivos([...v, ...fora])} empresaId={t.empresaId} carrossel={t.formato === "carrossel"} /></div>
          {viva && <PrazoDrive t={viva} />}
          <AvisosVideo arquivos={arquivos} viva={viva} travado={postTravado} />

          <div className="ficha-campo ficha-notas">
            <label className="ficha-legenda" htmlFor="ficha-notas">Notas</label>
            {/* Link escrito nas notas aparece como "Ver referência" (mesmo componente das Ideias das Pastas); ao clicar no texto volta o texto cru para editar. */}
            {!editandoNotas && /https?:\/\//.test(t.notas ?? "") ? (
              <div className="ficha-notas-ver" tabIndex={0} role="textbox" aria-label="Notas (clique para editar)"
                onClick={(e) => { if (!soLer && !(e.target as HTMLElement).closest("a")) setEditandoNotas(true); }}
                onKeyDown={(e) => { if (!soLer && e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); setEditandoNotas(true); } }}>
                <TextoComLinks texto={t.notas ?? ""} />
              </div>
            ) : (
              <textarea id="ficha-notas" rows={10} value={t.notas ?? ""} autoFocus={editandoNotas} onChange={(e) => mudar("notas", e.target.value)} onBlur={() => setEditandoNotas(false)} placeholder="Ideias, roteiro, combinados..." />
            )}
          </div>

          <CampoConserto viva={viva} t={t} mudar={mudar} soLer={!!soLer} />
          {decide && (
            <div className="ficha-decidir">
              <button type="button" className="aprovacao-botao" data-acao="consertar" disabled={salvando} onClick={() => void decidir({ etapa: "edicao", conserto: true })}>{decidindo === "edicao" ? "Consertando…" : "Consertar"}</button>
              <button type="button" className="aprovacao-botao" data-acao="aprovar" disabled={salvando} onClick={() => void decidir({ etapa: "aprovado" })}>{decidindo === "aprovado" ? "Aprovando…" : "Aprovar"}</button>
            </div>
          )}
        </fieldset>

        <footer className="ficha-pe">
          {soLer && <p className="ficha-so-ler">Só para olhar: tarefa de outra pessoa.</p>}
          {apagando ? (
            <div className="ficha-apagando"><button type="button" className="btn ficha-apagar" onClick={() => void excluir()}>Apagar</button><button type="button" className="btn btn-2" autoFocus onClick={() => setApagando(false)}>Cancelar</button></div>
          ) : lixeira && (
            <button type="button" className="ficha-lixeira" aria-label="Apagar tarefa" title="Apagar tarefa" onClick={() => setApagando(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6M8.5 9v4M11.5 9v4" /></svg></button>
          )}
          {!apagando && podeDuplicar && <button type="button" className="btn btn-2 ficha-duplicar" onClick={() => setDuplicando(true)}>Duplicar</button>}
          {((enviou && erro) || recusa) && <p className="ficha-erro" role="alert">{recusa || erro}</p>}
          {!apagando && <button type="button" className="btn btn-2" onClick={saida.pedir}>{soLer ? "Fechar" : "Cancelar"}</button>}
          {!soLer && !apagando && <button type="submit" className="btn" disabled={!t.titulo.trim() || !empresaOk || salvando}>{salvando ? "Salvando..." : "Salvar"}</button>}
        </footer>
      </form>
      {duplicando && <Confirmar titulo="Duplicar este card?" texto={`A cópia vai se chamar "${duplicarCard(tarefa as Tarefa, todas, tags).titulo}".`} acao="Duplicar" aoConfirmar={() => void duplicar()} aoCancelar={() => setDuplicando(false)} />}
      {saida.perguntando && <Confirmar titulo="Descartar alterações?" texto="O que você mexeu nesta ficha ainda não foi salvo." acao="Descartar" cancelar="Continuar editando" perigo aoConfirmar={saida.descartar} aoCancelar={saida.continuar} />}
    </dialog>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return <label className="ficha-campo"><span className="ficha-legenda">{rotulo}</span>{children}</label>;
}

