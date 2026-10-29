"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { apagarDocumentoSolto, enviarDocumentoNaPasta, type DocumentoSolto, type PastaLivre } from "@/lib/dados";
import { CardFlutuante } from "./CardFlutuante";

const drive = (id: string) => `https://drive.google.com/file/d/${id}/view`;
export const mensagem = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);
export type Destino = { pasta: PastaLivre };

// Janelas da tela Pastas: nome (pasta e tema), subir arquivo na pasta livre e arquivo aberto.
export function CardNome({ titulo, coisa, botao, inicial = "", comPermanente, emUso, aoSalvar, aoFechar }: {
  titulo: string; coisa: "pasta" | "tema"; botao: string; inicial?: string; comPermanente?: boolean;
  emUso: (n: string) => boolean; aoSalvar: (n: string, permanente: boolean) => void | Promise<void>; aoFechar: () => void;
}) {
  const [erro, setErro] = useState("");
  const [permanente, setPermanente] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const indo = useRef(false); // B15: trava já no clique (o `salvando` só desliga o botão no próximo desenho); dois cliques criavam duas pastas
  const campo = useRef<HTMLInputElement>(null);
  // o <dialog> só abre depois deste efeito e leva o foco para o X: o foco no campo vem em seguida
  useEffect(() => {
    const t = setTimeout(() => { campo.current?.focus(); campo.current?.select(); });
    return () => clearTimeout(t);
  }, []);
  const enviar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const n = String(new FormData(e.currentTarget).get("nome")).trim();
    if (!n) return setErro(`Escreva um nome para ${coisa === "pasta" ? "a pasta" : "o tema"}.`);
    if (emUso(n)) return setErro(`Já existe ${coisa === "pasta" ? "uma pasta" : "um tema"} com esse nome nesta empresa.`);
    if (indo.current) return;
    indo.current = true;
    setSalvando(true);
    Promise.resolve(aoSalvar(n, permanente)).catch((x: unknown) => setErro(mensagem(x, "Não consegui salvar."))).finally(() => { indo.current = false; setSalvando(false); });
  };
  return (
    <CardFlutuante titulo={titulo} aoFechar={aoFechar}>
      <form className="ideia-form" onSubmit={enviar}>
        <label>{coisa === "pasta" ? "Nome da pasta" : "Nome do tema"}<input ref={campo} name="nome" maxLength={40} defaultValue={inicial} aria-invalid={!!erro} onChange={() => setErro("")} /></label>
        {comPermanente && (
          <label className="pasta-interruptor">
            <input type="checkbox" role="switch" checked={permanente} onChange={(e) => setPermanente(e.target.checked)} />
            <span className="pasta-trilho" aria-hidden="true" />
            <span><strong>Permanente</strong><small>Põe um cadeado: a pasta não pode ser apagada até desligar o Permanente.</small></span>
          </label>
        )}
        {erro && <p className="pasta-erro" role="alert">{erro}</p>}
        <button type="submit" className="btn" disabled={salvando}>{salvando ? "Salvando..." : botao}</button>
      </form>
    </CardFlutuante>
  );
}

export function CardSubir({ empresaId, destino, aoFechar }: { empresaId: string; destino: Destino; aoFechar: () => void }) {
  const [envio, setEnvio] = useState<{ nome: string; fracao: number } | null>(null);
  const [erro, setErro] = useState("");
  const [feito, setFeito] = useState("");
  const subir = async (arquivo: File) => {
    setErro(""); setFeito(""); setEnvio({ nome: arquivo.name, fracao: 0 });
    try {
      await enviarDocumentoNaPasta({ empresaId, pastaLivreId: destino.pasta.id }, arquivo, (fracao) => setEnvio({ nome: arquivo.name, fracao }));
      setFeito(arquivo.name);
    } catch (e) {
      setErro(mensagem(e, "Não consegui enviar o arquivo."));
    }
    setEnvio(null);
  };
  const pct = envio ? Math.round(envio.fracao * 100) : 0;
  return (
    <CardFlutuante titulo="Subir arquivo" aoFechar={aoFechar}>
      <p className="pasta-texto">Vai direto para a pasta <strong>{destino.pasta.nome}</strong> no Drive. Nada sai sozinho: o arquivo fica até alguém apagar.</p>
      <label className="btn btn-2 pasta-escolher" aria-disabled={!!envio}>
        Escolher arquivo
        <input type="file" disabled={!!envio} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void subir(f); }} />
      </label>
      {envio && (
        <div className="pasta-progresso" role="status">
          <span>{envio.nome}</span>
          <progress max={100} value={pct} aria-label={`Enviando ${envio.nome}`} />
          <small>{pct}%</small>
        </div>
      )}
      {feito && <p className="pasta-texto" role="status">“{feito}” enviado.</p>}
      {erro && <p className="pasta-erro" role="alert">{erro}</p>}
    </CardFlutuante>
  );
}

export function CardDocumento({ doc, aoFechar }: { doc: DocumentoSolto; aoFechar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const apagar = async () => {
    try { await apagarDocumentoSolto(doc.id); aoFechar(); } catch (e) { setErro(mensagem(e, "Não consegui apagar.")); }
  };
  return (
    <CardFlutuante titulo={doc.nome} aoFechar={aoFechar}>
      <p className="pasta-texto">{doc.tamanho ? `${(doc.tamanho / 1_000_000).toFixed(1).replace(".", ",")} MB · ` : ""}Arquivo na pasta; fica até alguém apagar.</p>
      {erro && <p className="pasta-erro" role="alert">{erro}</p>}
      {confirmando ? (
        <div className="ideia-acoes">
          <button type="button" className="btn pasta-perigo" onClick={apagar}>Apagar arquivo</button>
          <button type="button" className="btn btn-2" autoFocus onClick={() => setConfirmando(false)}>Manter</button>
        </div>
      ) : (
        <div className="ideia-acoes">
          <a className="btn" href={drive(doc.driveId)} target="_blank" rel="noopener noreferrer">Abrir no Drive</a>
          <button type="button" className="btn btn-2 pasta-excluir" onClick={() => setConfirmando(true)}>Apagar arquivo</button>
        </div>
      )}
    </CardFlutuante>
  );
}

