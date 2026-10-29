// "Feito" dos compromissos do Google no Caderno (item 221). O Google é só leitura: o quadradinho vale só aqui, guardado em
// agenda_feitos (supabase/_colar/020-agenda-feitos.sql), uma linha por pessoa e compromisso. Sem a tabela, o visto some ao recarregar.
"use client";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { falhou } from "./repositorio";
import { AVISOS, ligarTempoReal } from "./tempo-real";

const NADA: ReadonlySet<string> = new Set();
let feitos = NADA;
let iniciado = false;
const ouvintes = new Set<() => void>();
const trocar = (novo: ReadonlySet<string>) => { feitos = novo; ouvintes.forEach((f) => f()); };

/** Lê do banco o que esta pessoa já marcou. Se falhar (tabela ainda não criada), mantém o que está na tela. */
async function carregar() {
  const { data, error } = await supabase().from("agenda_feitos").select("evento_id");
  if (!error) trocar(new Set((data ?? []).map((l) => l.evento_id as string)));
}

let desligarTempoReal: (() => void) | undefined;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  if (!iniciado && typeof window !== "undefined") {
    iniciado = true;
    void carregar();
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void carregar(); });
  }
  desligarTempoReal ??= ligarTempoReal("agenda-feitos", AVISOS.feitos, () => void carregar()); // 274
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};

/** Ids dos compromissos que a pessoa logada marcou como feitos. */
export const useEventosFeitos = () => useSyncExternalStore(assinar, () => feitos, () => NADA);

// L4: um pedido por vez por compromisso (fila): marcar e desmarcar rápido chegam ao banco na ordem dos cliques.
const filas = new Map<string, Promise<void>>();

/** Marca ou desmarca na hora; se o banco recusar, avisa e volta ao que o banco tem. */
export function marcarEventoFeito(id: string, feito: boolean): Promise<void> {
  const novo = new Set(feitos);
  if (feito) novo.add(id); else novo.delete(id);
  trocar(novo);
  const vez = (filas.get(id) ?? Promise.resolve()).then(async () => {
    const tabela = supabase().from("agenda_feitos");
    const { error } = feito ? await tabela.insert({ evento_id: id }) : await tabela.delete().eq("evento_id", id);
    if (error && error.code !== "23505") { falhou("Não consegui guardar o feito do compromisso. Tente de novo."); void carregar(); } // 23505 = já estava marcado
  });
  filas.set(id, vez);
  return vez;
}
