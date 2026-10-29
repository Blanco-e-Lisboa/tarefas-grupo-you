"use client";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { avisarFalha, podeAlterar, salvarTarefa, useAgendaEventos, useEu, usePostagensCalendario, useTarefas, type NovaTarefa, type Tarefa } from "@/lib/dados";
import { useFiltroEmpresa } from "@/lib/filtro-empresa";
import { Ficha, tarefaEmBranco } from "@/components/ficha/Ficha";
import { Ano } from "./Ano";
import { Evento, useSoltar, type Acoes } from "./Evento";
import { BarraFiltros, passa, passaEvento, SEM_FILTROS, type Filtros } from "./Filtros";
import { Grade } from "./Grade";
import { agendaPorDia, avisoProgramado, comMinuto, diasDaSemana, diasDoMes, esperarFimDoArraste, mover, paraHora, porDia, postProgramado, tituloPeriodo, VISOES, type Destino, type Visao } from "./logica";
import { Mes } from "./Mes";
import { Navegar } from "./Navegar";
import { periodoDe, temPostagens } from "./postagens/logica";
import { Postagens } from "./postagens/Postagens";
import { modoSalvo, TrocaVisao, type ModoCalendario } from "./postagens/TrocaVisao";
import { FiltroEmpresa } from "@/components/casca/FiltroEmpresa";
import { daMinhaLista } from "@/components/tarefas/grade";
import { CampoData } from "@/components/ui/CampoData";
import { Selecao } from "@/components/ui/Selecao";
import "./calendario.css";

// Relógio local, atualizado a cada 30s. No servidor é null: a tela só desenha no navegador (o "hoje" é o do computador).
const assinarRelogio = (f: () => void) => { const id = setInterval(f, 30_000); return () => clearInterval(id); };
const lerRelogio = () => paraHora(new Date());
const useAgora = () => useSyncExternalStore(assinarRelogio, lerRelogio, () => null);

export function TelaCalendario() {
  const agora = useAgora();
  return agora ? <Corpo agora={agora} /> : <section className="cal" aria-busy="true" />;
}

/** 315: o botão "Tarefas | Postagens". Só aparece quando o banco já tem o calendário de postagens (antes do SQL colado a tela é a de sempre). */
function Corpo({ agora }: { agora: string }) {
  const [modo, setModo] = useState<ModoCalendario>(modoSalvo);
  const semana = periodoDe("semana", agora.slice(0, 10));
  const { itens, ausente } = usePostagensCalendario(semana.de, semana.ate);
  const [jaTeve, setJaTeve] = useState(false);
  if (itens !== undefined && !jaTeve) setJaTeve(true);
  const tem = temPostagens(jaTeve, itens, ausente); // L3
  const trocador = tem ? <TrocaVisao modo={modo} aoMudar={setModo} /> : null;
  return tem && modo === "postagens" ? <Postagens agora={agora} trocador={trocador} /> : <Calendario agora={agora} trocador={trocador} />;
}

/** Data/hora de uma tarefa nova criada clicando num lugar vazio. */
function quando(d: Destino): Partial<NovaTarefa> {
  if (!d) return {};
  if (d.minuto === undefined) return { inicio: d.dia, diaInteiro: true };
  return { inicio: comMinuto(d.dia, d.minuto) }; // nasce sem fim (item 159): bloco de 30 min
}

function Calendario({ agora, trocador }: { agora: string; trocador: ReactNode }) {
  const hoje = agora.slice(0, 10);
  const [visao, setVisao] = useState<Visao>("semana");
  const [cursor, setCursor] = useState(hoje);
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const [aberta, setAberta] = useState<NovaTarefa | null>(null);
  const eu = useEu();
  // A mesma regra do Caderno, compartilhada com Conteúdos e Mapa.
  const todas = useTarefas();
  const tarefas = useMemo(() => todas.filter((t) => daMinhaLista(t, eu)), [todas, eu]);
  const { aplicar, todas: semFiltro } = useFiltroEmpresa();
  // Lupa 215 (achado 3): com o filtro de empresa ligado, a tarefa salva sem empresa some da tela; o aviso diz onde ela está.
  const [semEmpresa, setSemEmpresa] = useState(false);
  useEffect(() => {
    if (!semEmpresa || aberta) return; // ficha ainda aberta (anexo que falhou): o aviso espera ela fechar para contar o tempo
    const id = setTimeout(() => setSemEmpresa(false), 8000);
    return () => clearTimeout(id);
  }, [semEmpresa, aberta]);

  const visiveis = useMemo(() => aplicar(tarefas).filter(passa(filtros)), [aplicar, tarefas, filtros]);
  const mapa = useMemo(() => porDia(visiveis), [visiveis]);
  const semData = visiveis.filter((t) => !t.inicio);
  // Compromissos do Google (item 190), só leitura. O banco já entrega só as agendas que a pessoa pode ver.
  const eventos = useAgendaEventos();
  const agenda = useMemo(() => agendaPorDia(eventos.filter(passaEvento(filtros))), [eventos, filtros]);

  const acoes: Acoes = {
    abrir: setAberta,
    criar: (d) => setAberta(tarefaEmBranco({
      empresaId: "", // item 217: nasce sem empresa, nem com o filtro ligado; só vira card da Esteira se a pessoa escolher a empresa
      responsavel: filtros.responsavel.length === 1 ? (filtros.responsavel[0] as Tarefa["responsavel"]) : eu ?? "natham", // quem está logado, como no Caderno (item 155)
      ...quando(d),
      vaiProGoogle: true, // item 192: nasceu no Calendário; ao salvar, a Ficha só mantém se tiver data e a regra do R5-3 deixar (vaiProGoogle da logica)
    })),
    soltar: (id, d) => {
      const t = tarefas.find((x) => x.id === id);
      if (t && postProgramado(t)) return avisarFalha(avisoProgramado(t)); // A9: o post sairia no dia antigo
      if (t && podeAlterar(t, eu)) void salvarTarefa(mover(t, d));
    },
    irPara: (v, dia) => { setVisao(v); setCursor(dia); },
  };

  const periodo = visao === "dia" ? [cursor] : visao === "semana" ? diasDaSemana(cursor)
    : visao === "mes" ? diasDoMes(cursor).filter((d) => d.startsWith(cursor.slice(0, 7))) : null;
  const noPeriodo = new Set(
    [...mapa].filter(([d]) => (periodo ? periodo.includes(d) : d.startsWith(cursor.slice(0, 4)))).flatMap(([, l]) => l.map((t) => t.id)),
  ).size;
  const [titulo, ano] = tituloPeriodo(visao, cursor);

  return (
    <section className="cal">
      {/* Item 224 (como o Google Agenda): uma faixa só. O título abre o calendário de data (o mesmo do Caderno);
          Hoje ‹ › ficam ao lado da Visão. Sem atalhos de teclado (pedido do Natham). */}
      <header className="cal-barra">
        <div className="cal-titulo">
          <h1>
            <CampoData rotulo="Ir para a data" valor={cursor} aoMudar={(d) => d && setCursor(d)} semLimpar
              titulo={titulo ? <span>{titulo} <span className="cal-titulo-ano">{ano}</span></span> : <span>{ano}</span>} />
          </h1>
          <p>{noPeriodo ? `${noPeriodo} ${noPeriodo === 1 ? "tarefa" : "tarefas"}` : "Nenhuma tarefa"}</p>
        </div>
        <FiltroEmpresa />
        <BarraFiltros filtros={filtros} mudar={setFiltros} />
        <div className="cal-acoes">
          {trocador}
          <SemData lista={semData} acoes={acoes} />
          <Navegar visao={visao} cursor={cursor} hoje={hoje} aoMudar={setCursor} />
          <Selecao
            rotulo="Visão"
            multipla={false}
            opcoes={VISOES.map(({ v, rotulo }) => ({ valor: v, rotulo }))}
            valor={[visao]}
            aoMudar={(n) => n[0] && setVisao(n[0] as Visao)}
          />
          <button type="button" className="btn cal-nova" onClick={() => acoes.criar(null)}>+ Nova tarefa</button>
        </div>
      </header>

      <div className="cal-painel-pai">
        <div className="cal-painel" data-visao={visao}>
          {(visao === "dia" || visao === "semana") && (
            <Grade key={visao} dias={visao === "dia" ? [cursor] : diasDaSemana(cursor)} mapa={mapa} agenda={agenda} agora={agora} acoes={acoes} />
          )}
          {visao === "mes" && <Mes cursor={cursor} mapa={mapa} agenda={agenda} hoje={hoje} acoes={acoes} />}
          {visao === "ano" && <Ano cursor={cursor} hoje={hoje} irPara={acoes.irPara} mapa={mapa} soltar={acoes.soltar} />}
        </div>
      </div>

      {aberta && <Ficha key={aberta.id ?? "nova"} tarefa={aberta} aoFechar={() => setAberta(null)} aoSalvar={(s) => setSemEmpresa(!semFiltro && !s.empresaId)} soLer={!!aberta.id && !podeAlterar(aberta as Tarefa, eu)} />}
      {semEmpresa && (
        // Mesma faixa do aviso de falha (casca), em tom neutro: é informação, não erro
        <div className="aviso-erro aviso-info" role="status">
          <span>Salva sem empresa. Ela aparece com o filtro em Todas.</span>
          <button type="button" className="aviso-erro-fechar" onClick={() => setSemEmpresa(false)} aria-label="Fechar aviso">×</button>
        </div>
      )}
    </section>
  );
}

/** "Sem data" (item 39): botão com contador que abre a lista por cima do calendário. Mesmo visual do botão de seleção
    da base (reaproveita as classes de ui/selecao.css), com a lista em vidro como a da seleção.
    Soltar uma tarefa NO BOTÃO tira a data dela. */
function SemData({ lista, acoes }: { lista: Tarefa[]; acoes: Acoes }) {
  const id = useId();
  const pop = useRef<HTMLDivElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const { marcado, alvo } = useSoltar(acoes.soltar);
  const ancora = `--semdata-${id.replace(/[^\w-]/g, "")}`;

  // Arrastar da lista: ela fica transparente e deixa o mouse passar, para soltar no calendário que está embaixo.
  // Fecha quando a tarefa cai (drop) ou o arrasto é cancelado (dragend); os dois chegam na janela.
  // Se a tela sair no meio do arraste, para de esperar (os ouvintes não ficam presos na janela).
  const parar = useRef<() => void>(undefined);
  useEffect(() => () => parar.current?.(), []);
  const comecar = () => {
    setTimeout(() => setArrastando(true)); // depois do navegador tirar a "foto" da tarefa arrastada
    parar.current?.();
    parar.current = esperarFimDoArraste(window, () => {
      setArrastando(false);
      pop.current?.hidePopover();
    });
  };

  return (
    <>
      <button
        type="button"
        className="selecao-botao cal-semdata-botao"
        popoverTarget={`${id}-lista`}
        data-alvo={marcado === "sem-data"}
        title="Tarefas sem data. Solte aqui uma tarefa do calendário para tirar a data dela."
        style={{ anchorName: ancora } as CSSProperties}
        {...alvo("sem-data", null)}
      >
        <span>Sem data</span>
        {lista.length > 0 && <span className="selecao-contador">{lista.length}</span>}
        <svg className="selecao-seta" viewBox="0 0 24 24" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div
        ref={pop}
        id={`${id}-lista`}
        popover="auto"
        className="selecao-pop cal-semdata-pop"
        data-arrastando={arrastando}
        style={{ positionAnchor: ancora } as CSSProperties}
        onDragStart={comecar}
      >
        <section className="cal-semdata" aria-label="Tarefas sem data">
          <h2>Sem data</h2>
          <p>Arraste uma tarefa para um dia ou horário. Para tirar a data, solte a tarefa no botão Sem data.</p>
          <div className="cal-semdata-lista">
            {lista.map((t) => <Evento key={t.id} t={t} modo="cartao" abrir={acoes.abrir} />)}
            {!lista.length && <p className="cal-semdata-vazio">Nada sem data com estes filtros.</p>}
          </div>
          <button type="button" className="btn btn-2 cal-semdata-nova" onClick={() => acoes.criar(null)}>+ Tarefa sem data</button>
        </section>
      </div>
    </>
  );
}
