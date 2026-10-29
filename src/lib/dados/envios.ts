"use client";
// Envio de vídeo em segundo plano (item 268). A fila mora aqui, fora da ficha: fechar a ficha ou trocar de tela não interrompe o envio
// (só fechar a ABA interrompe; o aviso do canto pede confirmação). Analogia: o carteiro continua a rota mesmo depois de você sair da portaria.
// Para outras telas (ex.: vídeo legendado do item 270): `enviarEmSegundoPlano(tarefaId, arquivo, { papel, ordem })`; o card recebe o vídeo sozinho ao terminar.
import { useSyncExternalStore } from "react";
import { apagarAnexoDrive, enviarParaDrive } from "./drive";
import { recarregarTarefas } from "./repositorio";
import { marcarPendente } from "./subindo";

export type Envio = { id: string; nome: string; fracao: number; estado: "fila" | "enviando" | "enviado" | "falhou" | "interrompido"; erro?: string; tarefaId?: string };
type Entrada = { tarefaId: string; arquivo: File; papel: "anexo" | "capa"; ordem: number; marca?: Promise<string | null>; /** r2 B3: ids a apagar quando este chegar */ apagarDepois?: string[] };

// Só o NOME e o card ficam guardados no navegador (nunca o arquivo): se a aba recarrega no meio do envio, o aviso volta como "interrompido" e manda escolher o vídeo de novo.
// M7: guardado POR ABA (sessionStorage). Antes era um só para todas: a aba nova mostrava como "interrompido" o envio vivo da outra, e o vídeo subia 2 vezes.
// Aba DUPLICADA (ou aberta a partir de outra) ganha uma cópia da lista da aba de origem: por isso cada aba com envio no ar dá um sinal de vida
// a cada 10 s (VIVOS, no navegador todo), e o envio que ainda dá sinal não aparece como "interrompido" na cópia (conferência do Codex).
const GUARDA = "grade:envios-abertos";
const VIVOS = "grade:envios-vivos"; // id do envio -> último sinal de vida (ms); negativo = acabou (enviado, falhou ou descartado) naquela hora
const VIVO_MS = 30_000, ACABOU_MS = 5 * 60_000, CICLO_MS = 10_000; // CICLO_MS: de quanto em quanto o envio no ar renova o sinal
const lerVivos = (): Record<string, number> => { try { return JSON.parse(localStorage.getItem(VIVOS) ?? "{}"); } catch { return {}; } };
const vivoAgora = (v: number | undefined, agora: number) => v !== undefined && v > 0 && agora - v < VIVO_MS;
// r3 N6: guardado com sinal de vida recente pode ser de OUTRA aba (cópia da lista) ou DESTA mesma, que acabou de recarregar no meio do envio.
// Não dá para saber na hora: fica de lado ("suspeito") e vira "interrompido" quando o sinal vence (no máximo 30 s). Antes sumia de vez.
// Se a outra aba avisar que acabou (sinal negativo), some sem aviso.
let suspeitos: Envio[] = [];
const lerGuarda = (): Envio[] => {
  const vivos = lerVivos(), agora = Date.now();
  try {
    const todos = (JSON.parse(sessionStorage.getItem(GUARDA) ?? "[]") as Envio[]).map((e) => ({ id: e.id, nome: e.nome, tarefaId: e.tarefaId, fracao: 0, estado: "interrompido" as const }));
    suspeitos = todos.filter((e) => vivoAgora(vivos[e.id], agora));
    return todos.filter((e) => !suspeitos.includes(e) && !((vivos[e.id] ?? 0) < 0));
  } catch { return []; }
};
/** Sinal de vida dos envios no ar nesta aba (e aviso de "acabou" dos que pararam); apaga sinais velhos de qualquer aba. */
export function sinalDeVida(agora = Date.now()) {
  try {
    const v = lerVivos();
    for (const e of envios) v[e.id] = e.estado === "fila" || e.estado === "enviando" ? agora : -agora;
    for (const id of acabados.splice(0)) v[id] = -agora;
    for (const k of Object.keys(v)) if (v[k] > 0 ? agora - v[k] >= VIVO_MS : agora + v[k] >= ACABOU_MS) delete v[k];
    localStorage.setItem(VIVOS, JSON.stringify(v));
  } catch { /* sem armazenamento: a cópia da aba pode mostrar "interrompido" */ }
}
const acabados: string[] = []; // descartados desde o último sinal (saem da lista, mas as cópias precisam saber)
/** r3 N6: suspeito cujo sinal venceu vira "interrompido"; o que a outra aba disse que acabou some. */
export function reavaliarSuspeitos(agora = Date.now()) {
  if (!suspeitos.length) return;
  const vivos = lerVivos();
  const resolvidos = suspeitos.filter((e) => !vivoAgora(vivos[e.id], agora));
  if (!resolvidos.length) return;
  suspeitos = suspeitos.filter((e) => !resolvidos.includes(e));
  envios = [...envios, ...resolvidos.filter((e) => !((vivos[e.id] ?? 0) < 0))];
  avisar();
}
let envios: Envio[] = typeof window === "undefined" ? [] : lerGuarda();
if (typeof window !== "undefined") setInterval(() => { sinalDeVida(); reavaliarSuspeitos(); }, CICLO_MS);
const guardar = () => { try { sessionStorage.setItem(GUARDA, JSON.stringify([...envios.filter((e) => e.estado !== "enviado"), ...suspeitos].map(({ id, nome, tarefaId }) => ({ id, nome, tarefaId })))); } catch { /* sem armazenamento: só não lembra */ } };
const entradas = new Map<string, Entrada>();
const ouvintes = new Set<() => void>();
let cauda: Promise<void> = Promise.resolve(); // um envio por vez: vários vídeos grandes juntos brigariam pela mesma internet

const avisar = () => { guardar(); sinalDeVida(); ouvintes.forEach((f) => f()); };
const mudar = (id: string, p: Partial<Envio>) => { envios = envios.map((e) => (e.id === id ? { ...e, ...p } : e)); avisar(); };

async function rodar(id: string) {
  const e = entradas.get(id);
  if (!e) return;
  mudar(id, { estado: "enviando", fracao: 0, erro: undefined });
  try {
    // Achado 5: vídeo de anexo: o banco confirma a marca "vídeo novo pendente" ANTES de o primeiro byte sair. A marca não sai ao falhar (só ao chegar ou com "Postar com o vídeo atual").
    // A7: a marca já foi pedida ao ENFILEIRAR (vídeo esperando atrás de outro também segura o post); "tentar de novo" pede outra.
    // r3 A7 (038): a marca leva o id DESTE envio; o banco guarda a lista dos envios do card e só tira a marca quando o último chega.
    if (ehVideoAnexo(e)) { const recusa = await (e.marca ?? marcarPendente(e.tarefaId, id)); e.marca = undefined; if (recusa) throw new Error(recusa); }
    await enviarParaDrive(e.tarefaId, e.arquivo, e.papel, e.ordem, (fracao) => mudar(id, { fracao }), undefined, ehVideoAnexo(e) ? id : undefined);
    entradas.delete(id);
    // r2 B3: o vídeo velho que a pessoa tirou da ficha só sai agora, com o novo já no card. Se não sair, sobra no card (nada se perde).
    for (const velho of e.apagarDepois ?? []) await apagarAnexoDrive(velho).catch(() => {});
    // Bug novo 2 do Codex: sem o 038, o vídeo que chegou tira a marca do card inteiro; o outro vídeo do MESMO card que ainda espera marca de novo
    // na hora, com o id dele. Com o 038 o id já está na lista do card (repetir não duplica) e a marca nem chegou a sair: nada sobra.
    if (ehVideoAnexo(e)) for (const [outro, x] of entradas) if (x.tarefaId === e.tarefaId && ehVideoAnexo(x)) x.marca = marcarPendente(x.tarefaId, outro);
    mudar(id, { estado: "enviado", fracao: 1 });
    void recarregarTarefas(); // o card passa a mostrar o vídeo
  } catch (erro) {
    mudar(id, { estado: "falhou", erro: erro instanceof Error ? erro.message : "O envio falhou." }); // a entrada fica: "tentar de novo" continua de onde parou
  }
}
const enfileirar = (id: string) => { cauda = cauda.then(() => rodar(id)); };
const ehVideoAnexo = (e: Entrada) => e.papel === "anexo" && e.arquivo.type.startsWith("video/");

// r4 (novo 3): o envio interrompido deixou o id dele na lista de vídeos pendentes do card (038). Escolher o vídeo de novo REUSA esse id:
// a confirmação tira o id da lista. Antes saía um id novo, o velho ficava lá e a postagem continuava travada mesmo com o vídeo no card.
// O id fica guardado nesta aba mesmo depois de o aviso sair ("Abrir o card" tira o aviso e manda escolher o vídeo de novo).
const RETOMAR = "grade:envios-retomar"; // card -> ids interrompidos
const lerRetomar = (): Record<string, string[]> => { try { return JSON.parse(sessionStorage.getItem(RETOMAR) ?? "{}"); } catch { return {}; } };
const guardarRetomar = (r: Record<string, string[]>) => { try { sessionStorage.setItem(RETOMAR, JSON.stringify(r)); } catch { /* sem armazenamento: sai um id novo, como antes */ } };
function idParaRetomar(tarefaId: string): string | undefined {
  const parado = envios.find((x) => x.estado === "interrompido" && x.tarefaId === tarefaId);
  if (parado) { envios = envios.filter((x) => x !== parado); return parado.id; }
  // r4 (correção final): nos primeiros 30 s depois de recarregar, o envio velho ainda está entre os suspeitos (N6): reusa esse também.
  // r4 (abas, Ferreiro): só se o sinal dele parou há mais de um ciclo (10 s). Se ainda bate, é o envio vivo de uma aba duplicada:
  // reusar juntaria dois vídeos no mesmo id (o primeiro a chegar soltaria o post com o outro ainda subindo).
  const vivos = lerVivos(), parou = (id: string) => Date.now() - (vivos[id] ?? 0) > CICLO_MS + 2_000;
  const suspeito = suspeitos.find((x) => x.tarefaId === tarefaId && parou(x.id));
  if (suspeito) { suspeitos = suspeitos.filter((x) => x !== suspeito); return suspeito.id; }
  const r = lerRetomar(), id = r[tarefaId]?.shift();
  if (id) guardarRetomar(r);
  return id;
}

/** Põe o vídeo (ou qualquer arquivo) do card `tarefaId` na fila de envio ao Drive e devolve na hora. */
export function enviarEmSegundoPlano(tarefaId: string, arquivo: File, { papel = "anexo", ordem = 0, apagarDepois }: { papel?: "anexo" | "capa"; ordem?: number; apagarDepois?: string[] } = {}): string {
  const e: Entrada = { tarefaId, arquivo, papel, ordem, apagarDepois };
  const id = (ehVideoAnexo(e) && idParaRetomar(tarefaId)) || crypto.randomUUID();
  if (ehVideoAnexo(e)) e.marca = marcarPendente(tarefaId, id);
  entradas.set(id, e);
  envios = [...envios, { id, nome: arquivo.name, fracao: 0, estado: "fila", tarefaId }];
  avisar();
  enfileirar(id);
  return id;
}
/** r3 (Ferreiro 3): o vídeo `arquivo` ainda está na fila (ou subindo)? Então os `ids` (vídeos velhos tirados da ficha) saem só quando ele chegar.
    Devolve false se ele já chegou (ou não está aqui): quem chamou apaga na hora. */
export function apagarQuandoChegar(arquivo: File, ids: string[]): boolean {
  const e = [...entradas.values()].find((x) => x.arquivo === arquivo);
  if (!e) return false;
  e.apagarDepois = [...new Set([...(e.apagarDepois ?? []), ...ids])];
  return true;
}
/** "Falhou" + "Tentar de novo": volta para o fim da fila. */
export function tentarEnvioDeNovo(id: string) {
  if (!entradas.has(id)) return;
  mudar(id, { estado: "fila", fracao: 0, erro: undefined });
  enfileirar(id);
}
/** Tira o aviso de um envio. Só ESCONDE: a pendência do vídeo novo continua no banco (r4, correção final: regra de ouro dos vídeos; só o clique
    em "Postar com o vídeo atual" libera o antigo). O id do interrompido ou do que falhou fica guardado para o próximo envio do card reusar. */
export function descartarEnvio(id: string) {
  const e = envios.find((x) => x.id === id), entrada = entradas.get(id);
  if (e?.tarefaId && (e.estado === "interrompido" || (e.estado === "falhou" && entrada && ehVideoAnexo(entrada)))) { const r = lerRetomar(); r[e.tarefaId] = [...(r[e.tarefaId] ?? []), id]; guardarRetomar(r); }
  entradas.delete(id);
  acabados.push(id);
  envios = envios.filter((e) => e.id !== id);
  avisar();
}

/** A lista de agora (fora de componente; os testes usam). */
export const lerEnvios = () => envios;
const SEM_ENVIOS: Envio[] = [];
/** Envios em segundo plano (reativo). */
export const useEnvios = () => useSyncExternalStore((f) => (ouvintes.add(f), () => void ouvintes.delete(f)), () => envios, () => SEM_ENVIOS);
