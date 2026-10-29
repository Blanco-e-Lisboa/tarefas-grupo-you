// Anotações da página da direita do Caderno (item 193): "Anotações do dia" (anotacoes_dia) e "Não esquecer" (nao_esquecer), uma por pessoa e dia.
// Moram no banco: cada um lê e escreve as suas; o Natham só LÊ as do Matheus (014). Quem manda é a trava (RLS), a tela só pede.
"use client";
import { useEffect, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/cliente";
import { falhou } from "./repositorio";
import { AVISOS, ligarTempoReal } from "./tempo-real";
import type { Responsavel } from "./tipos";

export type CampoNota = "notas" | "lembrar";
const TABELA = { notas: "anotacoes_dia", lembrar: "nao_esquecer" } as const;
const chave = (c: CampoNota, quem: string, dia: string) => `${c}|${quem}|${dia}`;
const chaveAntiga = (c: CampoNota, dia: string) => `grade:caderno:${dia}:${c}`; // onde ficava, no navegador, antes do banco

let textos = new Map<string, string>(); // troca o mapa a cada mudança (exigência do useSyncExternalStore)
const sujas = new Set<string>(); // digitado e ainda não confirmado pelo banco: a leitura não pisa por cima
const atrasos = new Map<string, ReturnType<typeof setTimeout>>();
const ouvintes = new Set<() => void>();
let iniciado = false;
let desligarTempoReal: (() => void) | undefined;
const assinar = (f: () => void) => {
  ouvintes.add(f);
  if (!iniciado && typeof window !== "undefined") {
    iniciado = true;
    // ao esconder a aba, grava já o que ainda esperava o atraso (não perde o final da frase)
    document.addEventListener("visibilitychange", () => { if (document.hidden) [...atrasos.keys()].forEach((k) => { clearTimeout(atrasos.get(k)); void gravar(k); }); });
  }
  desligarTempoReal ??= ligarTempoReal("caderno", AVISOS.caderno, () => [...textos.keys()].forEach((k) => { const [c, quem, dia] = k.split("|") as [CampoNota, Responsavel, string]; void carregar(c, quem, dia); })); // 274
  return () => { ouvintes.delete(f); if (!ouvintes.size) { desligarTempoReal?.(); desligarTempoReal = undefined; } };
};
const definir = (k: string, v: string) => { textos = new Map(textos).set(k, v); ouvintes.forEach((f) => f()); };

let ids: Promise<Map<string, string>> | undefined;
const idDe = async (quem: string) => {
  ids ??= (async () => new Map(((await supabase().from("pessoas").select("id, slug")).data ?? []).map((p) => [p.slug as string, p.id as string])))();
  const mapa = await ids;
  if (!mapa.size) ids = undefined; // não carregou: tenta de novo na próxima
  return mapa.get(quem);
};

async function carregar(c: CampoNota, quem: Responsavel, dia: string) {
  const k = chave(c, quem, dia), id = await idDe(quem);
  if (!id) return;
  const { data, error } = await supabase().from(TABELA[c]).select("texto").eq("dono_id", id).eq("dia", dia).maybeSingle();
  if (!error && !sujas.has(k)) definir(k, (data?.texto as string | undefined) ?? "");
}

// M6: uma gravação por vez por nota (fila): duas pausas seguidas chegam ao banco na ordem, e cada uma lê o texto na hora em que sai.
const filas = new Map<string, Promise<void>>();
const ESPERA_NOVA_TENTATIVA = 5000, MAX_TENTATIVAS = 3; // r4 (economizar execuções): sem o limite, banco fora do ar = uma chamada a cada 5 s para sempre
const tentativas = new Map<string, number>();
function gravar(k: string) {
  atrasos.delete(k);
  const vez = (filas.get(k) ?? Promise.resolve()).then(() => enviar(k));
  filas.set(k, vez);
  return vez;
}

async function enviar(k: string) {
  const [c, quem, dia] = k.split("|") as [CampoNota, Responsavel, string], id = await idDe(quem), texto = textos.get(k) ?? "";
  if (!id) return;
  const { error } = await supabase().from(TABELA[c]).upsert({ dono_id: id, dia, texto }, { onConflict: "dono_id,dia" });
  if (error) {
    // M6: o texto fica na tela, a pessoa é avisada e a gravação volta sozinha (a próxima digitação ou a saída da aba também gravam)
    const n = tentativas.get(k) ?? 0;
    falhou(n < MAX_TENTATIVAS ? "Não consegui guardar a anotação. Ela continua na tela e eu tento de novo sozinho; não feche a página ainda."
      : "Não consegui guardar a anotação. Ela continua na tela: confira a internet e digite de novo para gravar.");
    if (!atrasos.has(k) && n < MAX_TENTATIVAS) { tentativas.set(k, n + 1); atrasos.set(k, setTimeout(() => void gravar(k), ESPERA_NOVA_TENTATIVA)); }
    return;
  }
  tentativas.delete(k);
  if (!atrasos.has(k) && textos.get(k) === texto) sujas.delete(k);
}

/** Muda o texto na tela na hora e grava 600 ms depois da última tecla. */
export function escreverNota(c: CampoNota, quem: Responsavel, dia: string, valor: string) {
  const k = chave(c, quem, dia);
  sujas.add(k);
  tentativas.delete(k); // digitou de novo: volta a ter as novas tentativas
  definir(k, valor);
  clearTimeout(atrasos.get(k));
  atrasos.set(k, setTimeout(() => void gravar(k), 600));
}

/** Anotação de `quem` no `dia`. `mudar` só existe para a própria pessoa; caderno de outra pessoa é só leitura (o banco também barra). */
export function useNotaDia(c: CampoNota, quem: Responsavel | null, dia: string, editavel: boolean) {
  const k = chave(c, quem ?? "", dia);
  const texto = useSyncExternalStore(assinar, () => textos.get(k) ?? "", () => "");
  useEffect(() => { if (quem) void carregar(c, quem, dia); }, [c, quem, dia]);
  const mudar = (valor: string) => { if (quem && editavel) escreverNota(c, quem, dia, valor); };
  return [texto, mudar] as const;
}

let subiu = false;
/** Uma vez por abertura: o que esta pessoa já tinha guardado no navegador sobe para o banco, sem pisar no que já está lá.
 *  Só some do navegador o que o banco confirmou (igual ao que subiu, ou já igual). Texto diferente do que está no banco fica no navegador. */
export async function subirNotasDoNavegador(quem: Responsavel) {
  if (subiu) return;
  subiu = true;
  try {
    const id = await idDe(quem);
    if (!id) { subiu = false; return; }
    for (const c of ["notas", "lembrar"] as const) {
      const achadas = new Map<string, string>(); // dia -> texto
      for (let i = 0; i < localStorage.length; i++) {
        const m = localStorage.key(i)?.match(/^grade:caderno:(\d{4}-\d{2}-\d{2}):(notas|lembrar)$/);
        const texto = m && m[2] === c ? localStorage.getItem(m[0]) : null;
        if (m && texto?.trim()) achadas.set(m[1], texto.slice(0, 4000));
      }
      if (!achadas.size) continue;
      const dias = [...achadas.keys()], tabela = supabase().from(TABELA[c]);
      const { data, error } = await tabela.select("dia, texto").eq("dono_id", id).in("dia", dias);
      if (error) continue;
      const no_banco = new Map((data ?? []).map((l) => [l.dia as string, l.texto as string]));
      const novas = dias.filter((d) => !no_banco.has(d));
      if (novas.length) {
        const { error: falha } = await tabela.upsert(novas.map((dia) => ({ dono_id: id, dia, texto: achadas.get(dia)! })), { onConflict: "dono_id,dia", ignoreDuplicates: true });
        if (falha) continue;
      }
      for (const d of dias) if (!no_banco.has(d) || no_banco.get(d) === achadas.get(d)) localStorage.removeItem(chaveAntiga(c, d));
    }
  } catch { subiu = false; }
}
