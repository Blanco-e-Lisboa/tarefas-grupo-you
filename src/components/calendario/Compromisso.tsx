"use client";
import { useId, type CSSProperties } from "react";
import { ROTULO_AGENDA, type EventoAgenda, type FonteAgenda, type Responsavel } from "@/lib/dados";
import { Pessoa } from "@/components/ui/Pessoa";
import { ehReuniao } from "@/components/tarefas/grade";
import { diaCurto, eventoNoTopo, horaCurta, nomeSemana } from "./logica";

// Compromisso do Google Agenda no Calendário (item 190). SÓ LEITURA: não arrasta e não abre a ficha de tarefa; o clique
// mostra um cartão com título, horário, local e agenda. Leva a marca da agenda de origem: a foto da pessoa, ou "Equipe"
// na agenda da contato@. Reunião ganha o mesmo âmbar com brilho das reuniões do item 188.

export const nomeAgenda = (f: FonteAgenda) => (f === "contato" ? "Equipe" : ROTULO_AGENDA[f]);
/** Foto da agenda: a da pessoa dona (a pessoal do Adrian leva a foto dele, M15); contato não tem pessoa. */
export const pessoaDaAgenda = (f: FonteAgenda): Responsavel | null => (f === "contato" ? null : f === "adrian_pessoal" ? "adrian" : f);

export function MarcaAgenda({ fonte, tamanho }: { fonte: FonteAgenda; tamanho: number }) {
  const quem = pessoaDaAgenda(fonte);
  return quem ? <Pessoa quem={quem} tamanho={tamanho} /> : <span className="cal-equipe">Equipe</span>;
}

/** Hora no bloco: "14:00" (curto) ou "14:00 às 15:00"; o que passa de um dia para outro diz até quando. */
function horario(e: EventoAgenda, longo: boolean) {
  if (e.diaInteiro) return "";
  if (eventoNoTopo(e)) return `${horaCurta(e.inicio)} até ${diaCurto(e.fim!)}`;
  return longo && e.fim ? `${horaCurta(e.inicio)} às ${horaCurta(e.fim)}` : horaCurta(e.inicio);
}

/** Linha do cartão: "Quinta, 22/10, 14:00 às 15:00", "Quinta, 22/10, dia inteiro" ou "De 22/10 a 24/10, dia inteiro". */
function quando(e: EventoAgenda) {
  const dia = `${nomeSemana(e.inicio, "long")}, ${diaCurto(e.inicio)}`;
  if (e.diaInteiro) return e.fim ? `De ${diaCurto(e.inicio)} a ${diaCurto(e.fim)}, dia inteiro` : `${dia}, dia inteiro`;
  if (!e.fim) return `${dia}, ${horaCurta(e.inicio)}`;
  return e.fim.slice(0, 10) === e.inicio.slice(0, 10)
    ? `${dia}, ${horaCurta(e.inicio)} às ${horaCurta(e.fim)}`
    : `${dia}, ${horaCurta(e.inicio)} até ${diaCurto(e.fim)}, ${horaCurta(e.fim)}`;
}

/** "bloco" = grade de horários, "chip" = mês e faixa de dia inteiro. curto = bloco de até 45 min, numa linha só. */
export function Compromisso({ e, modo, style, curto }: { e: EventoAgenda; modo: "bloco" | "chip"; style?: CSSProperties; curto?: boolean }) {
  const id = useId();
  const ancora = `--compromisso-${id.replace(/[^\w-]/g, "")}`;
  const hora = horario(e, modo === "bloco");
  const agendas = e.fontes.map(nomeAgenda).join(", ");
  // Bloco alto: a etiqueta "Equipe" desce para os detalhes (como o selo da empresa na tarefa) e não espreme o título
  const embaixo = modo === "bloco" && !curto;
  const marcas = (fs: FonteAgenda[]) => fs.map((f) => <MarcaAgenda key={f} fonte={f} tamanho={16} />);
  return (
    <>
      <button
        type="button"
        popoverTarget={`${id}-cartao`}
        className={`evento evento-${modo} compromisso${curto ? " evento-curto" : ""}${ehReuniao(e) ? " evento-reuniao" : ""}`}
        style={{ anchorName: ancora, ...style } as CSSProperties}
        title={`${e.titulo}\nGoogle Agenda: ${agendas}${hora ? ` · ${hora}` : ""}`}
      >
        <span className="evento-linha">
          {marcas(embaixo ? e.fontes.filter((f) => f !== "contato") : e.fontes)}
          {hora && !embaixo && <span className="evento-hora">{curto ? hora.slice(0, 5) : hora}</span>}
          <span className="evento-titulo">{e.titulo}</span>
        </span>
        {embaixo && (
          <span className="evento-detalhes">
            {marcas(e.fontes.filter((f) => f === "contato"))}
            {hora && <span>{hora}</span>}
            {e.local && <span>{e.local}</span>}
          </span>
        )}
      </button>
      <div id={`${id}-cartao`} popover="auto" className="selecao-pop cal-compromisso-pop" style={{ positionAnchor: ancora } as CSSProperties}>
        <section className="cal-compromisso" aria-label="Compromisso do Google Agenda">
          <p className="cal-compromisso-origem">Google Agenda · só leitura</p>
          <h2>{e.titulo}</h2>
          <p>{quando(e)}</p>
          {e.local && <p>{e.local}</p>}
          <ul className="cal-compromisso-agendas" aria-label="Agendas">
            {e.fontes.map((f) => (
              <li key={f}><MarcaAgenda fonte={f} tamanho={20} />{f !== "contato" && nomeAgenda(f)}</li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
