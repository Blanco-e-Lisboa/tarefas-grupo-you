import { useEffect, useRef } from "react";
import type { Tarefa } from "@/lib/dados";

export const EVENTO_FICHA = "grade:ficha";

// 268: o aviso de envio interrompido leva a /conteudos?ficha=<id>. Abre a ficha desse card ao carregar a tela (vindo de outra) ou
// quando o aviso avisa (já estando nela, o endereço muda mas a tela não recarrega), e limpa o endereço.
// r3 (Ferreiro 1): o endereço é lido UMA vez, ao abrir a tela, e o pedido vale até o card chegar. Antes, toda mudança na contagem de cards
// relia o endereço e reabria o card dele, até por cima de outra ficha aberta (a ficha misturava dois cards).
export function useFichaDaUrl(tarefas: Tarefa[], abrir: (t: Tarefa) => void) {
  const pedido = useRef<string | null | undefined>(undefined); // undefined = ainda não leu o endereço; null = nada pedido (ou já abriu)
  useEffect(() => {
    if (pedido.current === undefined) {
      pedido.current = new URLSearchParams(window.location.search).get("ficha");
      if (pedido.current) window.history.replaceState(null, "", window.location.pathname);
    }
    const t = pedido.current ? tarefas.find((x) => x.id === pedido.current) : undefined;
    if (t) { pedido.current = null; abrir(t); }
  }, [tarefas, abrir]);
  const vivas = useRef(tarefas);
  useEffect(() => { vivas.current = tarefas; });
  useEffect(() => {
    const aoAvisar = (e: Event) => { const t = vivas.current.find((x) => x.id === (e as CustomEvent<string>).detail); if (t) abrir(t); };
    window.addEventListener(EVENTO_FICHA, aoAvisar);
    return () => window.removeEventListener(EVENTO_FICHA, aoAvisar);
  }, [abrir]);
}
