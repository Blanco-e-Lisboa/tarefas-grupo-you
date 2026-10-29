"use client";
import { ETAPAS, REDES, RESPONSAVEIS, TIPOS, useAgendasVisiveis, type EventoAgenda, type Rede, type Responsavel, type Tarefa } from "@/lib/dados";
import { IconeRede } from "@/components/ui/Marca";
import { NOMES } from "@/components/ficha/Ficha";
import { Pessoa } from "@/components/ui/Pessoa";
import { Selecao } from "@/components/ui/Selecao";
import { nomeAgenda, pessoaDaAgenda } from "./Compromisso";

// Filtros SÓ do calendário (pessoa, rede, etapa, tipo, agendas). Somam com o filtro global de empresa, que a casca desenha.
// Grupo vazio = sem filtro naquele grupo. Pessoa, Rede, Etapa e Tipo valem para as tarefas; Agendas, para os compromissos do Google (item 190).
export type Filtros = { responsavel: string[]; rede: string[]; etapa: string[]; tipo: string[]; agenda: string[] };
export const SEM_FILTROS: Filtros = { responsavel: [], rede: [], etapa: [], tipo: [], agenda: [] };

export const passa = (f: Filtros) => (t: Tarefa) => GRUPOS.every(({ g }) => !f[g].length || f[g].includes(t[g] ?? ""));
export const passaEvento = (f: Filtros) => (e: EventoAgenda) => !f.agenda.length || e.fontes.some((x) => f.agenda.includes(x));

const GRUPOS = [
  { g: "responsavel", rotulo: "Pessoa", valores: RESPONSAVEIS },
  { g: "rede", rotulo: "Rede", valores: REDES },
  { g: "etapa", rotulo: "Etapa", valores: ETAPAS },
  { g: "tipo", rotulo: "Tipo", valores: TIPOS },
] as const;

// Cada grupo é um botão de seleção (item 42, componente da base).
export function BarraFiltros({ filtros, mudar }: { filtros: Filtros; mudar: (f: Filtros) => void }) {
  const ativos = Object.values(filtros).flat().length;
  const agendas = useAgendasVisiveis();
  return (
    <div className="cal-filtros" role="group" aria-label="Filtros do calendário">
      {GRUPOS.map(({ g, rotulo, valores }) => (
        <Selecao
          key={g}
          rotulo={rotulo}
          soIcone={g === "rede"}
          valor={filtros[g]}
          aoMudar={(v) => mudar({ ...filtros, [g]: v })}
          opcoes={valores.map((v) => ({
            valor: v,
            rotulo: (NOMES[g] as Record<string, string>)[v],
            antes: g === "responsavel" ? <Pessoa quem={v as Responsavel} tamanho={18} /> : g === "rede" ? <IconeRede rede={v as Rede} tamanho={16} /> : undefined,
          }))}
        />
      ))}
      {agendas.length > 0 && (
        <Selecao
          rotulo="Agendas"
          valor={filtros.agenda}
          aoMudar={(v) => mudar({ ...filtros, agenda: v })}
          opcoes={agendas.map((f) => ({ valor: f, rotulo: nomeAgenda(f), antes: pessoaDaAgenda(f) ? <Pessoa quem={pessoaDaAgenda(f)!} tamanho={18} /> : undefined }))}
        />
      )}
      {ativos > 0 && (
        <button type="button" className="lnk cal-limpar" onClick={() => mudar(SEM_FILTROS)}>
          <span className="sub">Limpar {ativos === 1 ? "1 filtro" : `${ativos} filtros`}</span>
        </button>
      )}
    </div>
  );
}
