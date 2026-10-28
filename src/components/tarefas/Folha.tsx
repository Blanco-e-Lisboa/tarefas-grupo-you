"use client";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import type { CorLinha, Responsavel } from "@/lib/dados";
import { Selecao } from "@/components/ui/Selecao";
import { SeloEmpresa } from "@/components/ui/Marca";
import type { OpcaoLetra } from "./fontes";
import { horaDoSlot, SLOTS } from "./grade";
import { ETIQUETAS, MenuTarefa, type Acoes } from "./MenuTarefa";
import "./caderno.css";

export type LinhaFolha = { id: string; /** Item 296: cor da linha inteira. */ corLinha?: CorLinha; titulo: string; detalhe: string; feita: boolean; /** Tarefa com nome de reunião (item 188): destaque âmbar. */ reuniao?: boolean;
  /** Compromisso do Google (item 221): só leitura, mas com quadradinho de feito. "continua" = linha de baixo de um compromisso longo, só pintada. */ compromisso?: "primeira" | "continua"; cor?: string; responsavel?: Responsavel; /** Vazio = tarefa sem empresa: não mostra logo. */ empresa?: Opcao;
  /** Nome de quem mandou a tarefa (selo "enviada por"). Vazio = não foi enviada. */ enviadaPor?: string;
  /** Nome de quem recebeu, no caderno de quem enviou (selo "enviada →"). Vale no lugar de enviadaPor. */ enviadaPara?: string;
  /** 315: tarefa gerada pela pauta de postagens: selo "da pauta" na linha. */ daPauta?: boolean;
  /** Item 275: linhas que o bloco da tarefa ocupa (1 = comum; 2 ou mais = tarefa longa, sem pauta no meio). */ bloco?: number;
  /** Sobreposição antiga: horário gravado (ex.: "09:00–11:00") que passa do começo de outra tarefa. Só aviso; nada é gravado sozinho. */ conflito?: string;
  /** Item 283: "13:30–14:30" de todo bloco de mais de 30 min, discreto ao lado do nome. */ intervalo?: string;
  /** Linha de baixo de uma tarefa longa: não desenha nada, só reserva o lugar. */ ocupada?: boolean;
  /** Minutos da tarefa e o máximo que cabe até o fim das linhas (0 = sem hora, o menu não oferece duração). */ duracao?: number; duracaoMax?: number; /** Item 279: maior duração oferecida (até 6h, até o fim do dia) e onde começa o que bloqueia as maiores que cabem. */ duracaoLimite?: number; ocupadoAs?: string;
  /** false = só leitura para quem está olhando (trava do banco). Vazio = pode. */ podeAlterar?: boolean; podeApagar?: boolean;
  /** 031: quem recebeu a tarefa enviada marca feita mesmo sem poder alterar. Vazio = segue o podeAlterar. */ podeMarcar?: boolean };
export type Opcao = { id: string; nome: string };
const NENHUMA = "nenhuma"; // valor do seletor; a tarefa sem empresa guarda empresaId ""
const HORAS = Array.from({ length: SLOTS }, (_, k) => horaDoSlot(k));

type Props = {
  letra: OpcaoLetra;
  titulo: string;
  subtitulo?: string;
  /** Uma entrada por linha da folha; null = linha vazia (onde se escreve). */
  linhas: (LinhaFolha | null)[];
  /** Compromissos de dia inteiro: faixa acima das linhas de horário. */
  faixa?: LinhaFolha[];
  /** Texto da margem, por linha (o horário). */
  rotulos?: string[];
  vazio: string;
  /** Empresas do seletor "Nova tarefa em" (respeitam o filtro de cima). */
  empresas: Opcao[];
  /** Todas as empresas, para trocar a empresa de uma tarefa pelo ⋮. */
  empresasMenu?: Opcao[];
  empresaPadrao: string;
  /** Sem estes a folha é só para olhar (página de escolha da letra). */
  aoMarcar?: (id: string) => void;
  aoApagar?: (id: string) => void;
  aoAbrir?: (id: string) => void;
  /** Alça de arrastar: leva a tarefa para a linha de horário `linha`. Sem isto não há alça. */
  aoMover?: (id: string, linha: number) => void;
  /** Menu ⋮ de cada tarefa. Sem isto fica só o × de apagar. */
  acoes?: Acoes;
  aoEscrever?: (titulo: string, empresaId: string, responsavel: Responsavel, linha: number) => void;
  /** Quem vem marcado em "Responsável" ao escrever (quem está logado). */
  responsavelPadrao?: Responsavel;
  /** Caderno aberto: a lista corre pela página da esquerda e CONTINUA na da direita (mesmo papel, linha e margem). No celular vira uma folha só. */
  continua?: boolean;
};

// Giro mínimo e fixo por tarefa: a mão nunca escreve duas linhas idênticas.
const giro = (id: string) => (([...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 7) - 3) * 0.12;

// Estouro do check (mesmas posições do CRM): 12 pontos de tinta e 4 riscos, só ao marcar.
const PONTOS = [[25, -25], [-25, -25], [25, 25], [-25, 25], [35, 0], [-35, 0], [0, 35], [0, -35], [20, -30], [-20, 30], [30, 20], [-30, -20]];

// Quadradinho de feito (o mesmo da tarefa e do compromisso do Google): quadro, visto e o estouro de pontos.
function Caixa({ l, estourando, desabilitada, aoClicar }: { l: LinhaFolha; estourando: boolean; desabilitada: boolean; aoClicar: () => void }) {
  return (
    <button
      type="button" className={`caixa${estourando ? " estourando" : ""}`} disabled={desabilitada} aria-pressed={l.feita}
      aria-label={`${l.feita ? "Desmarcar" : "Marcar como feita"}: ${l.titulo}`}
      onClick={aoClicar}
    >
      <span className="caixa-brilho" aria-hidden="true" />
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <path className="caixa-quadro" d="M5 6.5 L22.5 5 L23.2 22.6 L6 23.4 Z" />
        <path className="caixa-visto" d="M8 14.5 L13 20 L25 4.5" />
      </svg>
      <span className="caixa-fx" aria-hidden="true">
        {PONTOS.map(([x, y], i) => <i key={i} className="ponto" style={{ "--x": `${x}px`, "--y": `${y}px` } as CSSProperties} />)}
        {[0, 90, 180, 270].map((r) => <i key={r} className="faisca" style={{ "--r": `${r}deg` } as CSSProperties} />)}
      </span>
    </button>
  );
}

export function Folha({ letra, titulo, subtitulo, linhas, faixa, rotulos, vazio, empresas, empresasMenu, empresaPadrao, aoMarcar, aoApagar, aoAbrir, aoMover, acoes, aoEscrever, responsavelPadrao = "natham", continua }: Props) {
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [estourando, setEstourando] = useState<string | null>(null);
  const [texto, setTexto] = useState<{ linha: number; valor: string }>({ linha: -1, valor: "" });
  const [empresa, setEmpresa] = useState<string | null>(null);
  const [escolhido, setResp] = useState<Responsavel | null>(null);
  const resp = escolhido ?? responsavelPadrao; // o login chega depois da 1ª pintura
  const empresaAtual = empresa === NENHUMA ? NENHUMA : empresa && empresas.some((e) => e.id === empresa) ? empresa : empresaPadrao;
  const primeiraVazia = linhas.findIndex((l) => !l);

  // Caderno aberto: quantas linhas cabem em cada página (as duas têm a mesma altura e o mesmo vão de cima). No celular tudo fica na primeira.
  const miolo = useRef<HTMLDivElement>(null);
  const quem = useRef<HTMLDivElement>(null);
  const [cabe, setCabe] = useState({ linhas: 15, vao: 60, uma: false });
  useLayoutEffect(() => {
    const el = miolo.current;
    if (!continua || !el) return;
    const medir = () => {
      const vao = quem.current?.offsetHeight ?? 0, passo = parseFloat(getComputedStyle(el).getPropertyValue("--passo")) || 36;
      const uma = matchMedia("(max-width: 767px)").matches;
      const n = Math.max(1, Math.floor((el.clientHeight - vao) / passo));
      setCabe((c) => (c.linhas === n && c.vao === vao && c.uma === uma ? c : { linhas: n, vao, uma }));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [continua, aoEscrever]);
  const nEsq = continua && !cabe.uma ? cabe.linhas : linhas.length;
  const esquerda = continua ? Array.from({ length: nEsq }, (_, k) => linhas[k] ?? null) : linhas;
  const direita = continua && !cabe.uma ? Array.from({ length: Math.max(cabe.linhas, linhas.length - nEsq) }, (_, k) => linhas[nEsq + k] ?? null) : null;

  // Arrastar pela alça (vertical): a linha acompanha o ponteiro e a linha de horário sob ele fica marcada; soltar move.
  const lista = useRef<HTMLUListElement>(null);
  const refoco = useRef<string | null>(null);
  // Item 297: o brilho (menu-brilho) de TODAS as linhas coloridas e da reunião anda no mesmo compasso. Cada animação nasce numa hora
  // diferente (cor nova, troca de página, recarregar), então depois de cada pintura todas voltam a ter o mesmo ponto de partida: o relógio da página.
  useEffect(() => { for (const a of document.getAnimations()) if (a instanceof CSSAnimation && a.animationName === "menu-brilho" && a.startTime !== 0) a.startTime = 0; });
  const [arrasto, setArrasto] = useState<{ id: string; de: number; alvo: number; y0: number; dy: number } | null>(null);
  useEffect(() => { // depois de mover pelo teclado a linha troca de lugar: a alça volta a ter o foco
    if (refoco.current) document.querySelector<HTMLElement>(`[data-alca="${CSS.escape(refoco.current)}"]`)?.focus();
    refoco.current = null;
  });
  const comecar = (e: PointerEvent<HTMLButtonElement>, id: string, k: number) => {
    if (e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setArrasto({ id, de: k, alvo: k, y0: e.clientY, dy: 0 });
  };
  const mover = (e: PointerEvent<HTMLButtonElement>) => {
    if (!arrasto || !lista.current) return;
    // Posição de LAYOUT (offsetTop): a linha arrastada tem transform e o getBoundingClientRect dela anda com o ponteiro,
    // o que fazia o alvo ser sempre ela mesma (item 87).
    if (continua) { // Sem data (292/294): vale a linha sob o ponteiro nas DUAS páginas; fora de qualquer linha (ou na própria) = fica onde está
      const sob = document.elementsFromPoint(e.clientX, e.clientY).find((x): x is HTMLElement => x instanceof HTMLElement && x.matches("li.linha[data-k]") && x.dataset.k !== String(arrasto.de));
      return setArrasto({ ...arrasto, dy: e.clientY - arrasto.y0, alvo: sob ? Number(sob.dataset.k) : arrasto.de });
    }
    const topo = lista.current.getBoundingClientRect().top, y = e.clientY - topo;
    const linhasLi = [...lista.current.children] as HTMLElement[];
    const i = y < 0 ? 0 : linhasLi.findIndex((li) => y >= li.offsetTop && y < li.offsetTop + li.offsetHeight);
    setArrasto({ ...arrasto, dy: e.clientY - arrasto.y0, alvo: Math.min(SLOTS - 1, i < 0 ? linhasLi.length - 1 : i) });
  };
  const soltar = (e: PointerEvent<HTMLButtonElement>) => {
    if (!arrasto) return;
    if (e.type === "pointerup" && arrasto.alvo !== arrasto.de) aoMover?.(arrasto.id, arrasto.alvo);
    setArrasto(null);
  };
  const teclar = (e: KeyboardEvent<HTMLButtonElement>, id: string, k: number) => {
    const alvo = e.key === "ArrowUp" ? k - 1 : e.key === "ArrowDown" ? k + 1 : -1;
    if (alvo < 0 && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    if (alvo < 0 || alvo > (continua ? nEsq + (direita?.length ?? 0) : SLOTS) - 1) return;
    refoco.current = id;
    aoMover?.(id, alvo);
  };

  const lista_ = (ls: (LinhaFolha | null)[], base: number, principal: boolean) => (
        <ul ref={principal ? lista : undefined} className="folha-linhas" data-arrastando={!!arrasto}>
      {ls.map((l, i) => { const k = base + i; if (l?.ocupada) return <li key={l.id} hidden />; const n = l?.bloco ?? 1; return (
        <li
          key={l?.id ?? `v${k}`} className="linha" data-k={k} data-cor-linha={l?.corLinha} data-feita={l?.feita} data-faixa={l && (l.compromisso || l.reuniao) ? (l.reuniao ? "reuniao" : "comum") : undefined}
          data-bloco={n > 1 || undefined} data-arrastada={arrasto?.id === l?.id && !!l || undefined} data-alvo={arrasto && arrasto.alvo === k && arrasto.alvo !== arrasto.de ? (!continua && linhas[k] && linhas[k]!.id !== arrasto.id ? "ocupado" : "livre") : undefined}
          style={{ ...(n > 1 ? { "--n": n } : null), ...(arrasto && arrasto.id === l?.id ? { transform: `translateY(${arrasto.dy}px)` } : null) } as CSSProperties}
        >
          <span className="linha-hora">
            {n > 1 ? Array.from({ length: n }, (_, j) => <span key={j} className="linha-hora-txt">{rotulos?.[k + j]}</span>) : <span className="linha-hora-txt">{rotulos?.[k]}</span>}
            {l && aoMover && l.podeAlterar !== false && (
              <button
                type="button" className="alca" data-alca={l.id} title="Arrastar para mudar o horário"
                aria-label={`Mudar o horário de ${l.titulo}: setas para cima e para baixo movem meia hora`}
                onPointerDown={(e) => comecar(e, l.id, k)} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
                onKeyDown={(e) => teclar(e, l.id, k)}
              >
                <svg viewBox="0 0 10 16" aria-hidden="true">{[3, 8, 13].flatMap((y) => [2.5, 7.5].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />))}</svg>
              </button>
            )}
          </span>
          {l?.compromisso === "continua" ? (
            <span className="linha-miolo" aria-hidden="true" />
          ) : l ? (
            <div className="linha-miolo" data-reuniao={l.reuniao || undefined} style={{ transform: `rotate(${giro(l.id)}deg)` }}>
              <Caixa l={l} estourando={estourando === l.id} desabilitada={!aoMarcar || ((l.podeMarcar ?? l.podeAlterar) === false && !l.compromisso)} aoClicar={() => marcar(l)} />
              <span className="linha-texto">
                {/* O espaço da logo é reservado mesmo sem empresa: os títulos ficam todos alinhados na mesma coluna (item 164). */}
                <span className="linha-empresa">{l.empresa && <SeloEmpresa empresaId={l.empresa.id} nome={l.empresa.nome} tamanho={20} />}</span>
                <button type="button" className="abrir" disabled={!aoAbrir || !!l.compromisso} title="Abrir a ficha" onClick={() => aoAbrir?.(l.id)}>
                  <span className="folha-tinta risco">{l.titulo}</span>
                </button>
                <span className="folha-lapis detalhe">{l.detalhe}</span>
                {l.intervalo && !l.conflito && <span className="linha-intervalo">{l.intervalo}</span>}
                {l.conflito && <span className="linha-conflito" title={l.podeAlterar === false ? "O horário gravado passa do começo de outra tarefa. Só quem é dono da tarefa muda a duração." : "O horário gravado passa do começo de outra tarefa. Mude a duração pelo ⋮."}>⚠ {l.conflito}</span>}
                {l.enviadaPara ? <span className="linha-selo">enviada → {l.enviadaPara}</span> : l.enviadaPor && <span className="linha-selo">enviada por {l.enviadaPor}</span>}
                {l.daPauta && <span className="linha-selo linha-selo--pauta" title="Veio do calendário de postagens">da pauta</span>}
                {(() => { const e = ETIQUETAS.find((x) => x.cor && x.valor === l.cor); return e && (
                  <span className="linha-etq" style={{ "--e": `var(--${e.valor})`, "--et": `var(--${e.valor}-texto)` } as CSSProperties}>{e.rotulo}</span>
                ); })()}
              </span>
              {aoApagar && l.podeAlterar !== false && (confirmando === l.id ? (
                <span className="confirmar folha-lapis">
                  Some do calendário também.
                  <button type="button" className="confirmar-sim folha-tinta" onClick={() => { aoApagar(l.id); setConfirmando(null); }}>Apagar</button>
                  <button type="button" className="confirmar-nao" autoFocus onClick={() => setConfirmando(null)}>Manter</button>
                </span>
              ) : acoes ? (
                <MenuTarefa id={l.id} titulo={l.titulo} cor={l.cor ?? ""} corLinha={l.corLinha} responsavel={l.responsavel ?? "natham"} empresaId={l.empresa?.id ?? ""} empresas={empresasMenu ?? empresas} horas={HORAS} duracao={l.duracao ?? 30} duracaoMax={l.duracaoMax ?? 0} duracaoLimite={l.duracaoLimite ?? 0} ocupadoAs={l.ocupadoAs} ocupadas={new Set(linhas.flatMap((x, j) => (x && x.id !== l.id && !x.id.startsWith(`${l.id}#`) ? [j] : [])))} acoes={acoes} aoExcluir={() => aoApagar(l.id)} semExcluir={l.podeApagar === false} />
              ) : l.podeApagar === false ? null : (
                <button type="button" className="apagar" aria-label={`Apagar: ${l.titulo}`} onClick={() => setConfirmando(l.id)}>
                  <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
                </button>
              ))}
            </div>
          ) : aoEscrever ? (
            <form
              className="linha-miolo"
              onSubmit={(e) => {
                e.preventDefault();
                const t = texto.valor.trim();
                if (!t || !empresaAtual) return;
                aoEscrever(t, empresaAtual === NENHUMA ? "" : empresaAtual, resp, k);
                setTexto({ linha: -1, valor: "" });
              }}
            >
              <span className="caixa caixa-vazia" aria-hidden="true" />
              <input
                className="folha-tinta campo" value={texto.linha === k ? texto.valor : ""} maxLength={140}
                onChange={(e) => setTexto({ linha: k, valor: e.target.value })}
                placeholder={k === primeiraVazia ? (linhas.some(Boolean) ? "escreva e aperte Enter" : vazio) : undefined}
                aria-label={`Nova tarefa${rotulos?.[k] ? `, ${rotulos[k]}` : ""}`}
              />
            </form>
          ) : (
            <span className="linha-miolo linha-vazia">{k === primeiraVazia && !linhas.some(Boolean) ? <span className="folha-lapis">{vazio}</span> : null}</span>
          )}
        </li>
      ); })}
    </ul>
  );

  const marcar = (l: LinhaFolha) => {
    aoMarcar?.(l.id);
    if (!l.feita) { setEstourando(l.id); setTimeout(() => setEstourando(null), 700); }
  };

  return (
    <>
    <section className={`pag folha ${letra.fonte.className}`} data-continua={continua || undefined} style={{ "--escala": letra.escala } as CSSProperties}>
      <header className="pag-faixa">
        <h2 className="pag-faixa-titulo">{titulo}</h2>
        {subtitulo && <p className="pag-faixa-sub">{subtitulo}</p>}
      </header>

      <div ref={miolo} className="pag-miolo">
        {aoEscrever && (
          <div ref={quem} className="folha-quem">
            <span className="folha-quem-rotulo">Nova tarefa em</span>
            <Selecao
              rotulo="Empresa" soIcone multipla={false} valor={[empresaAtual]} aoMudar={([v]) => v && setEmpresa(v)}
              opcoes={[...empresas.map((e) => ({ valor: e.id, rotulo: e.nome, antes: <SeloEmpresa empresaId={e.id} nome={e.nome} tamanho={18} /> })), { valor: NENHUMA, rotulo: "Nenhuma", separar: true }]}
            />
            <Selecao
              rotulo="Responsável" multipla={false} valor={[resp]} aoMudar={([v]) => v && setResp(v as Responsavel)}
              opcoes={[{ valor: "natham", rotulo: "Natham" }, { valor: "matheus", rotulo: "Matheus" }, { valor: "adrian", rotulo: "Adrian" }]}
            />
          </div>
        )}

        {!!faixa?.length && (
          <ul className="folha-linhas">
            {faixa.map((l) => (
              <li key={l.id} className="linha" data-feita={l.feita} data-faixa={l.reuniao ? "reuniao" : "comum"}>
                <span className="linha-hora"><span className="linha-hora-txt linha-hora-dia">dia</span></span>
                <div className="linha-miolo">
                  <Caixa l={l} estourando={estourando === l.id} desabilitada={!aoMarcar} aoClicar={() => marcar(l)} />
                  <span className="linha-texto"><span className="linha-empresa" /><span className="folha-tinta risco">{l.titulo}</span></span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {lista_(esquerda, 0, true)}
      </div>
    </section>
    {direita && (
      <section className={`pag folha ${letra.fonte.className}`} data-continua style={{ "--escala": letra.escala } as CSSProperties}>
        <header className="pag-faixa">
          <h2 className="pag-faixa-titulo">{titulo}</h2>
          <p className="pag-faixa-sub">continuação</p>
        </header>
        <div className="pag-miolo">
          <div style={{ height: cabe.vao }} aria-hidden="true" />
          {lista_(direita, nEsq, false)}
        </div>
      </section>
    )}
    </>
  );
}
