"use client";

import { CabecalhoColuna } from "@/components/ui/CabecalhoColuna";
import { useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent } from "react";
import { FiltroEmpresa } from "@/components/casca/FiltroEmpresa";
import { Ficha, NOMES, tarefaEmBranco } from "@/components/ficha/Ficha";
import { Aprovacao, SeloConserto } from "@/components/ficha/Aprovacao";
import { IconeRede, SeloEmpresa, temLogo } from "@/components/ui/Marca";
import { TagChip } from "@/components/ui/Tag";
import { Pessoa } from "@/components/ui/Pessoa";
import { ehConteudo } from "@/components/tarefas/grade";
import { useFichaDaUrl } from "./ficha-da-url";
import { ETAPAS, podeAlterar, salvarTarefa, useEmpresas, useEu, useFazendo, usePostagemAutomatica, useTags, useTarefas, type Etapa, type NovaTarefa, type Tarefa } from "@/lib/dados";
import { tomDaEmpresa } from "@/lib/cores-empresa";
import { useFiltroEmpresa } from "@/lib/filtro-empresa";
import { diasDeAtraso } from "@/lib/atraso";
import { ConfirmarPostado } from "./ConfirmarPostado";
import { confirmarPostado } from "./confirmar";
import { tipoDaColuna } from "./tipo";
import { quandoPostou } from "@/components/ficha/postagem";
import "./conteudos.css";

const nomes: Record<Etapa, string> = {
  roteiro: "Roteiro", gravacao: "Gravação", edicao: "Edição",
  analise: "Em análise", aprovado: "Aprovado", postado: "Postado",
};

type Arraste = { id: string; x: number; y: number; w: number; h: number };
// B12: confere o dia a cada minuto (só re-desenha quando o texto muda), para a aba aberta de um dia para o outro virar o "hoje"
const aCadaMinuto = (f: () => void) => { const i = setInterval(f, 60_000); return () => clearInterval(i); };
const hojeTexto = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const diaNumero = (texto: string) => { const [a, m, d] = texto.split("-").map(Number); return Date.UTC(a, m - 1, d) / 86_400_000; };

/** Quanto falta para a postagem. Conteúdo já postado ou sem data não tem contagem.
    Com a postagem automática desligada (238) o texto não promete que o sistema posta: "post hoje / amanhã / em N dias". */
export function prazo(tarefa: Tarefa, hoje: string, automatica = true): { texto: string; tom: "atrasado" | "perto" | "normal" } | null {
  if (!tarefa.inicio || !hoje || tarefa.etapa === "postado") return null;
  if (diasDeAtraso(tarefa, hoje)) return { texto: "atrasado", tom: "atrasado" };
  const dias = diaNumero(tarefa.inicio.slice(0, 10)) - diaNumero(hoje);
  const verbo = automatica ? "posta" : "post";
  if (dias === 0) return { texto: automatica ? "hoje" : "post hoje", tom: "perto" };
  return { texto: dias === 1 ? `${verbo} amanhã` : `${verbo} em ${dias} dias`, tom: dias <= 2 ? "perto" : "normal" };
}
const linkDrive = (tarefa: Tarefa) => {
  const url = tarefa.links.find((l) => /^(https?:\/\/)?drive\.google\.com\//i.test(l.url.trim()))?.url.trim();
  return url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null;
};

/** 309b: em Postado o rodapé mostra a data de postagem (quandoPostou); nas outras etapas, a hora agendada como sempre. */
const dataDoRodape = (t: Tarefa) => (t.etapa === "postado" ? quandoPostou(t) : undefined) ?? t.postarEm ?? t.inicio;

function dataLegivel(inicio?: string) {
  if (!inicio) return "Sem data";
  const [data, hora] = inicio.split("T");
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}${ano === String(new Date().getFullYear()) ? "" : `/${ano}`}${hora ? ` · ${hora.slice(0, 5)}` : ""}`;
}

export function TelaConteudos() {
  const tarefas = useTarefas();
  const eu = useEu();
  const { ligada } = usePostagemAutomatica();
  const empresas = useEmpresas();
  const tags = useTags();
  const fazendo = useFazendo();
  const { aplicar } = useFiltroEmpresa();
  const [aberta, setAberta] = useState<NovaTarefa | null>(null);
  useFichaDaUrl(tarefas, setAberta);
  const [arraste, setArraste] = useState<Arraste | null>(null);
  const [destino, setDestino] = useState<Etapa | null>(null);
  const [pendentePostado, setPendentePostado] = useState<Tarefa | null>(null);
  const pegada = useRef<{ id: string; px: number; py: number; caixa: DOMRect; ativo: boolean } | null>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const hoje = useSyncExternalStore(aCadaMinuto, hojeTexto, () => ""); // servidor: "" até hidratar (fuso)
  const [erro, setErro] = useState("");
  const conteudos = aplicar(tarefas).filter((t): t is Tarefa & { etapa: Etapa } => ehConteudo(t));
  const nomesEmpresas = new Map(empresas.map((e) => [e.id, e.nome]));

  async function mudarEtapa(tarefa: Tarefa, etapa: Etapa) {
    if (tarefa.etapa === etapa || !podeAlterar(tarefa, eu)) return;
    try {
      setErro("");
      await salvarTarefa({ ...tarefa, etapa });
      if (aberta?.id === tarefa.id) setAberta({ ...tarefa, etapa });
    } catch {
      setErro("Não foi possível salvar a etapa. Tente novamente.");
    }
  }

  // Arraste por ponteiro (mouse e dedo): o card só "pega" depois de andar 6px, para o clique no título continuar abrindo a ficha.
  function colunaEm(x: number, y: number) {
    for (const el of document.querySelectorAll<HTMLElement>("[data-etapa]")) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return el.dataset.etapa as Etapa;
    }
    return null;
  }

  function pegar(evento: PointerEvent<HTMLElement>, tarefa: Tarefa) {
    if (!podeAlterar(tarefa, eu) || evento.button !== 0 || (evento.target as HTMLElement).closest("a")) return;
    pegada.current = { id: tarefa.id, px: evento.clientX, py: evento.clientY, caixa: evento.currentTarget.getBoundingClientRect(), ativo: false };
  }

  function mover(evento: PointerEvent<HTMLElement>) {
    const p = pegada.current;
    if (!p) return;
    if (!p.ativo) {
      if (Math.hypot(evento.clientX - p.px, evento.clientY - p.py) < 6) return;
      p.ativo = true;
      evento.currentTarget.setPointerCapture(evento.pointerId);
    }
    setArraste({ id: p.id, x: p.caixa.left + evento.clientX - p.px, y: p.caixa.top + evento.clientY - p.py, w: p.caixa.width, h: p.caixa.height });
    setDestino(colunaEm(evento.clientX, evento.clientY));
    const q = quadro.current?.getBoundingClientRect(); // perto da borda, o quadro rola sozinho
    if (q && quadro.current) quadro.current.scrollLeft += evento.clientX > q.right - 48 ? 14 : evento.clientX < q.left + 48 ? -14 : 0;
  }

  function soltar(evento: PointerEvent<HTMLElement>, cancelado = false) {
    const p = pegada.current;
    pegada.current = null;
    if (!p?.ativo) return;
    const etapa = cancelado ? null : colunaEm(evento.clientX, evento.clientY);
    const tarefa = tarefas.find((item) => item.id === p.id);
    if (tarefa && etapa) {
      if (confirmarPostado(tarefa.etapa, etapa)) setPendentePostado(tarefa);
      else void mudarEtapa(tarefa, etapa);
    }
    setArraste(null);
    setDestino(null);
  }

  return (
    <section className="conteudos-tela">
      <header className="conteudos-cabecalho">
        <div>
          <div className="conteudos-quem">
            <h1>Esteira</h1>
            <FiltroEmpresa />
          </div>
          <p>Acompanhe cada conteúdo do roteiro à publicação.</p>
        </div>
        <div className="conteudos-total bloco-destaque"><strong className="bloco-numero">{conteudos.length}</strong><span className="bloco-fraco">conteúdos</span></div>
      </header>
      {erro && <p className="conteudos-erro" role="alert">{erro}</p>}
      <div className="conteudos-quadro" ref={quadro} aria-label="Quadro de conteúdos por etapa">
        {ETAPAS.map((etapa, indice) => {
          // Mais novo no topo (item 134): a lista chega na ordem de criação, então a coluna a mostra de trás para frente.
          // 307: só em Postado, o último a entrar fica no topo (postadoEm, gravado pelo banco); sem ele (card antigo) vai para baixo, na ordem de antes (sort é estável).
          const quandoEntrou = (t: Tarefa) => Date.parse(t.postadoEm ?? "") || 0;
          const itens = conteudos.filter((t) => t.etapa === etapa).reverse();
          if (etapa === "postado") itens.sort((a, b) => quandoEntrou(b) - quandoEntrou(a));
          return (
            <section
              className="conteudos-coluna"
              data-destino={destino === etapa}
              data-etapa={etapa}
              key={etapa}
              style={{ "--etapa": `var(--etapa-${etapa})` } as CSSProperties}
            >
              <CabecalhoColuna numero={indice + 1} titulo={nomes[etapa]} total={itens.length} rotuloNovo={`Novo conteúdo em ${nomes[etapa]}`} aoNovo={() => {
                if (!eu) return setErro("Aguarde a identificação da sua conta para criar um conteúdo.");
                setErro("");
                setAberta(tarefaEmBranco({ etapa, tipo: tipoDaColuna(etapa), responsavel: eu }));
              }} />
              <div className="conteudos-pilha">
                {itens.length === 0 && <p className="conteudos-vazio">Solte um conteúdo aqui.</p>}
                {itens.map((tarefa) => {
                  const levantado = arraste?.id === tarefa.id ? arraste : null;
                  // aprovado: conta até a hora do post (item 195); postando ou com erro (196) a contagem sai, senão um texto contradiz o outro
                  const falta = tarefa.postagens?.some((p) => p.status !== "postado") ? null : prazo({ ...tarefa, inicio: tarefa.postarEm ?? tarefa.inicio }, hoje, ligada);
                  const drive = linkDrive(tarefa);
                  const quemFazAgora = fazendo[tarefa.id]?.quem;
                  const nomeEmpresa = tarefa.empresaId ? nomesEmpresas.get(tarefa.empresaId) : undefined;
                  return (
                  <div className="conteudos-cartao-sombra" data-vazio={!!levantado} data-fazendo={!!quemFazAgora} data-conserto={!!(tarefa.conserto || tarefa.consertoTexto)} style={levantado ? { height: levantado.h } : undefined} key={tarefa.id}>
                  <article
                    className="conteudos-cartao"
                    data-arrastando={!!levantado}
                    data-editavel={podeAlterar(tarefa, eu)}
                    style={levantado ? { left: levantado.x, top: levantado.y, width: levantado.w } : undefined}
                    onPointerDown={(evento) => pegar(evento, tarefa)}
                    onPointerMove={mover}
                    onPointerUp={(evento) => soltar(evento)}
                    onPointerCancel={(evento) => soltar(evento, true)}
                  >
                    {quemFazAgora && (
                      <span className="conteudos-fazendo" role="status" aria-label={`${NOMES.responsavel[quemFazAgora]} está fazendo agora`} title={`${NOMES.responsavel[quemFazAgora]} está fazendo agora`}>
                        <Pessoa quem={quemFazAgora} tamanho={26} />
                      </span>
                    )}
                    <SeloConserto tarefa={tarefa} />
                    {/* Card do conteúdo (item 156): de quem é e onde sai, o quê, para quê, em que etapa está, quem faz e quando */}
                    <div className="conteudos-cartao-topo">
                      {tarefa.empresaId && (
                        <span className="conteudos-empresa" style={{ "--marca": tomDaEmpresa(tarefa.empresaId).r } as CSSProperties}>
                          {nomeEmpresa ? (
                            <>
                              <SeloEmpresa empresaId={tarefa.empresaId} nome={nomeEmpresa} tamanho={20} />
                              {temLogo(tarefa.empresaId) && <span className="conteudos-empresa-nome">{nomeEmpresa}</span>}
                            </>
                          ) : <span className="conteudos-empresa-nome">Empresa removida</span>}
                        </span>
                      )}
                      {tarefa.arquivos.length > 0 && (
                        <span className="conteudos-clipe" title={`${tarefa.arquivos.length} anexo${tarefa.arquivos.length > 1 ? "s" : ""}`} aria-label={`${tarefa.arquivos.length} anexo${tarefa.arquivos.length > 1 ? "s" : ""}`}>
                          <svg viewBox="0 0 24 24" aria-hidden><path d="M21 12.5l-8.5 8.5a5.5 5.5 0 01-7.8-7.8L13.2 4.7a3.7 3.7 0 015.2 5.2l-8.5 8.5a1.9 1.9 0 01-2.6-2.6L14.6 7.5" /></svg>
                        </span>
                      )}
                      {tarefa.rede && <span className="conteudos-rede" title={NOMES.rede[tarefa.rede]}><IconeRede rede={tarefa.rede} tamanho={18} /></span>}
                    </div>
                    {tarefa.tipo !== "outro" && <span className="conteudos-tipo">{NOMES.tipo[tarefa.tipo]}</span>}
                    {/* Item 166b: título com a barra da etapa; a cor vem de --etapa na coluna. */}
                    <button className="conteudos-titulo" type="button" onClick={() => setAberta(tarefa)}>{tarefa.titulo}</button>
                    {tarefa.objetivo && <p className="conteudos-objetivo">{tarefa.objetivo}</p>}
                    <div className="conteudos-trilha" role="img" aria-label={`Etapa ${ETAPAS.indexOf(tarefa.etapa) + 1} de ${ETAPAS.length}: ${nomes[tarefa.etapa]}`}>
                      {ETAPAS.map((e, i) => <i key={e} data-feita={i <= ETAPAS.indexOf(tarefa.etapa)} />)}
                      <span>{ETAPAS.indexOf(tarefa.etapa) + 1}/{ETAPAS.length}</span>
                    </div>
                    {tarefa.tags?.some((id) => tags.some((g) => g.id === id)) && (
                      <div className="conteudos-tags">
                        {tags.filter((g) => tarefa.tags?.includes(g.id)).map((g) => <TagChip key={g.id} tag={g} aprovador={tarefa.aprovador} />)}
                      </div>
                    )}
                    <div className="conteudos-cartao-rodape">
                      <span className="conteudos-quem-faz"><Pessoa quem={tarefa.responsavel} tamanho={24} />{NOMES.responsavel[tarefa.responsavel]}</span>
                      <time dateTime={dataDoRodape(tarefa)?.slice(0, 10)}>{tarefa.formato && `${NOMES.formato[tarefa.formato]} · `}{dataLegivel(dataDoRodape(tarefa))}</time>
                    </div>
                    {(falta || drive) && (
                      <div className="conteudos-prazo">
                        {falta && <span className="conteudos-contagem-dias" data-tom={falta.tom}>{falta.texto}</span>}
                        {drive && <a className="conteudos-drive" href={drive} target="_blank" rel="noopener noreferrer" title="Abrir no Drive">Drive</a>}
                      </div>
                    )}
                    <Aprovacao tarefa={tarefa} />
                  </article>
                  </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {/* r3 (Ferreiro 1): key = o card. Trocar de card com a ficha aberta montava a ficha nova com o rascunho da velha */}
      {aberta && <Ficha key={aberta.id ?? "nova"} tarefa={aberta} tipos={["roteiro", "gravacao", "edicao", "postagem"]} aoFechar={() => setAberta(null)} soLer={!!aberta.id && !podeAlterar(aberta as Tarefa, eu)} />}
      {pendentePostado && <ConfirmarPostado titulo={pendentePostado.titulo} aoCancelar={() => setPendentePostado(null)} aoConfirmar={() => {
        void mudarEtapa(pendentePostado, "postado");
        setPendentePostado(null);
      }} />}
    </section>
  );
}
