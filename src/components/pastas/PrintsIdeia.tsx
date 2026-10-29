"use client";
import { useEffect, useRef, useState, type ClipboardEvent } from "react";
import { anexarPrints, subirPrint, tirarPrint, urlsDosPrints, type Ideia } from "@/lib/dados";

// Bloco "Prints" da folha (item 300): Ctrl+V de imagem com a folha em foco vira miniatura; clicar amplia (Esc, X ou fora fecham); X tira o print.
const imagensDe = (e: ClipboardEvent) => [...e.clipboardData.items].flatMap((i) => (i.kind === "file" && i.type.startsWith("image/") ? [i.getAsFile()!] : []));

/** Devolve o que a folha precisa: o que ligar no onPaste do cartão e o bloco para pôr entre Descrição e Links. */
export function usePrints(ideia: Ideia) {
  const colar = async (e: ClipboardEvent) => {
    const fotos = imagensDe(e);
    if (!fotos.length) return; // texto colado segue o caminho normal
    e.preventDefault();
    const novos = (await Promise.all(fotos.map((f) => subirPrint(ideia.empresaId, f)))).filter((c): c is string => !!c);
    // r3 N4: entra na folha como ela está AGORA, e só se ela ainda existe (apagada no meio do envio: o arquivo sai do armário)
    if (novos.length) await anexarPrints(ideia.empresaId, ideia.id, novos);
  };
  return { colar, bloco: <Prints ideia={ideia} aoTirar={(c) => void tirarPrint(ideia.empresaId, ideia, c)} /> }; // M21: o arquivo só sai depois de o banco confirmar
}

function Prints({ ideia, aoTirar }: { ideia: Ideia; aoTirar: (caminho: string) => void }) {
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [aberto, setAberto] = useState<string | null>(null);
  const [certo, setCerto] = useState<string | null>(null); // print esperando o 2º clique para sair
  const janela = useRef<HTMLDialogElement>(null);
  const chave = ideia.prints.join("|");
  useEffect(() => { let vivo = true; void urlsDosPrints(ideia.prints).then((u) => vivo && setUrls(u)); return () => { vivo = false; }; }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const j = janela.current;
    if (!aberto || !j) return;
    j.showModal();
    const teclas = (e: KeyboardEvent) => { e.stopPropagation(); if (e.key === "Escape") { e.preventDefault(); j.close(); } }; // o Esc fecha só a lupa, não o mural por trás
    j.addEventListener("keydown", teclas);
    return () => j.removeEventListener("keydown", teclas);
  }, [aberto]);
  return (
    <div className="mural-prints" data-vazio={!ideia.prints.length ? true : undefined}>
      {!ideia.prints.length && <span className="mural-prints-dica">Cole um print (Ctrl+V)</span>}
      {ideia.prints.map((c, n) => (
        <div key={c} className="mural-print">
          <button type="button" className="mural-print-ver" aria-label={`Ampliar print ${n + 1}`} onClick={() => setAberto(c)}>
            {urls.get(c) ? <img src={urls.get(c)} alt={`Print ${n + 1}`} /> : <span className="mural-print-espera" />}
          </button>
          <button type="button" className="mural-print-tirar" data-certo={certo === c ? true : undefined} aria-label={certo === c ? `Confirmar: apagar print ${n + 1}` : `Apagar print ${n + 1}`} title={certo === c ? "Clique de novo para apagar" : "Apagar este print"}
            onClick={() => (certo === c ? (setCerto(null), aoTirar(c)) : setCerto(c))} onBlur={() => setCerto(null)}>{certo === c ? "Apagar?" : "×"}</button>
        </div>
      ))}
      {aberto && (
        <dialog ref={janela} className="mural-lupa" aria-label="Print ampliado" onClose={(e) => { e.stopPropagation(); setAberto(null); }} onClick={(e) => e.target === e.currentTarget && janela.current?.close()}>
          {urls.get(aberto) && <img src={urls.get(aberto)} alt="Print ampliado" />}
          <button type="button" className="mural-lupa-x" aria-label="Fechar" onClick={() => janela.current?.close()}>×</button>
        </dialog>
      )}
    </div>
  );
}
