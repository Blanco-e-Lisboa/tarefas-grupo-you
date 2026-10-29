"use client";
/* eslint-disable @next/next/no-img-element -- o anexo é um endereço temporário do navegador (blob:), next/image não serve */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { tipoDe, useProgressoEnvio, type Arquivo } from "@/lib/dados";
import { avisoTaxa, duracaoDoVideo, mbps } from "./taxa-video";
import "./anexos.css";

// Anexos da tarefa (itens 129 e 203): imagem, vídeo ou documento, arrastados para cá ou escolhidos no computador.
// O arquivo escolhido espera em `pendente` (com um blob: só para mostrar); quem sobe (Drive, ou Supabase se o card não tem empresa) é o salvarTarefa, ao salvar a ficha.
// Vídeo (268) sobe em segundo plano pela fila de envios, a partir do Salvar (M11: antes subia na hora de escolher e o "Descartar" não o cancelava).
// M20: ao escolher um vídeo, a duração é lida no navegador e a ficha avisa se passa de 25 Mbps (a Meta recusa).
// `papel="capa"`: campo da capa do Reels, aceita UMA imagem (a nova troca a antiga). `carrossel`: os anexos se arrastam para mudar a ordem.
const DOCUMENTO = /^(application\/(pdf|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\..+)|text\/(plain|csv))$/;
const CLIPE = "M21 12.5l-8.5 8.5a5.5 5.5 0 01-7.8-7.8L13.2 4.7a3.7 3.7 0 015.2 5.2l-8.5 8.5a1.9 1.9 0 01-2.6-2.6L14.6 7.5";
const ROTULO = { video: "Vídeo", imagem: "Foto", documento: "Doc" } as const;

type Props = { valor: Arquivo[]; aoMudar: (v: Arquivo[]) => void; papel?: "anexo" | "capa"; carrossel?: boolean; empresaId?: string };

export function Anexos({ valor, aoMudar, papel = "anexo", carrossel, empresaId }: Props) {
  const capa = papel === "capa";
  const entrada = useRef<HTMLInputElement>(null);
  const grande = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState<Arquivo | null>(null);
  const [sobre, setSobre] = useState(false);
  const [recusa, setRecusa] = useState("");
  const [taxaAlta, setTaxaAlta] = useState<string[]>([]);
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const progresso = useProgressoEnvio();

  useEffect(() => {
    if (aberto && !grande.current?.open) grande.current?.showModal();
  }, [aberto]);

  function adicionar(lista: FileList | null) {
    setRecusa("");
    let aceitos = [...(lista ?? [])].filter((f) => (capa ? f.type.startsWith("image/") : f.type.startsWith("image/") || f.type.startsWith("video/") || DOCUMENTO.test(f.type)));
    if (capa) aceitos = aceitos.slice(0, 1);
    if (empresaId === "" && aceitos.some((f) => f.type.startsWith("video/"))) { // vídeo nunca mora no Supabase: card sem empresa não o aceita
      setRecusa("Escolha a empresa para anexar vídeo");
      aceitos = aceitos.filter((f) => !f.type.startsWith("video/"));
    }
    setTaxaAlta([]);
    aceitos.filter((f) => f.type.startsWith("video/")).forEach((f) => void duracaoDoVideo(f).then((s) => {
      const aviso = s ? avisoTaxa(f.name, mbps(f.size, s)) : "";
      if (aviso) setTaxaAlta((x) => [...x, aviso]);
    }));
    const novos = aceitos.map((f): Arquivo => ({ nome: f.name, url: URL.createObjectURL(f), tipo: tipoDe(f), pendente: f, papel }));
    if (novos.length) aoMudar(capa ? novos : [...valor, ...novos]);
  }
  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setSobre(false);
    adicionar(e.dataTransfer.files);
  };
  const reordenar = (para: number) => {
    if (arrastando !== null && arrastando !== para) {
      const nova = [...valor];
      nova.splice(para, 0, ...nova.splice(arrastando, 1));
      aoMudar(nova);
    }
    setArrastando(null);
    setAlvo(null);
  };
  const abrir = (a: Arquivo) => (a.removido ? window.open(a.driveLink, "_blank", "noopener") : a.tipo === "documento" && !a.driveId ? window.open(a.url, "_blank", "noopener") : setAberto(a));

  return (
    <div className="ficha-anexos">
      <button
        type="button"
        className="ficha-anexo-solta"
        data-sobre={sobre}
        onClick={() => entrada.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setSobre(true); }}
        onDragLeave={() => setSobre(false)}
        onDrop={soltar}
      >
        <svg viewBox="0 0 24 24" aria-hidden><path d={CLIPE} /></svg>
        {capa ? "Capa própria: arraste ou escolha uma imagem 9:16" : "Anexos: arraste ou escolha imagem, vídeo ou documento"}
      </button>
      <input ref={entrada} type="file" accept={capa ? "image/*" : "image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"} multiple={!capa} hidden onChange={(e) => { adicionar(e.target.files); e.target.value = ""; }} />
      {valor.map((a, i) => (
        <span
          key={`${a.id ?? a.url ?? a.nome}${i}`}
          className="ficha-anexo"
          data-arrastando={arrastando === i}
          data-alvo={alvo === i && arrastando !== i}
          draggable={!!carrossel && valor.length > 1}
          onDragStart={() => setArrastando(i)}
          onDragOver={(e) => { if (arrastando !== null) { e.preventDefault(); setAlvo(i); } }}
          onDrop={(e) => { if (arrastando !== null) { e.preventDefault(); e.stopPropagation(); reordenar(i); } }}
          onDragEnd={() => { setArrastando(null); setAlvo(null); }}
        >
          <button type="button" className="ficha-anexo-mini" aria-label={a.removido ? `Abrir ${a.nome} no Drive` : `Abrir ${a.nome} em tamanho grande`} title={a.aviso ? `${a.nome}: ${a.aviso}` : a.nome} onClick={() => abrir(a)}>
            {a.removido ? <span className="ficha-anexo-doc">Drive</span>
              : a.url && a.tipo === "video" ? <video src={`${a.url}#t=0.1`} muted preload="metadata" />
              : a.url && a.tipo === "imagem" ? <img src={a.url} alt="" />
              : a.tipo === "documento" && !a.driveId ? <span className="ficha-anexo-doc">{a.nome.split(".").pop()?.slice(0, 4).toUpperCase()}</span>
              : <span className="ficha-anexo-doc">{ROTULO[a.tipo ?? "documento"]}</span>}
          </button>
          {a.url && progresso[a.url] !== undefined && <span className="ficha-anexo-progresso" role="progressbar" aria-label={`Enviando ${a.nome}`} aria-valuenow={Math.round(progresso[a.url] * 100)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progresso[a.url] * 100}%` }} /></span>}
          {carrossel && valor.length > 1 && <span className="ficha-anexo-ordem" aria-hidden>{i + 1}</span>}
          <button type="button" className="ficha-anexo-tirar" aria-label={`Tirar ${a.nome}`} onClick={() => aoMudar(valor.filter((_, j) => j !== i))}>×</button>
        </span>
      ))}
      {recusa && <small className="ficha-anexo-recusa" role="alert">{recusa}</small>}
      {taxaAlta.map((t) => <small key={t} className="ficha-anexo-recusa" role="alert">{t}</small>)}
      {valor.filter((a) => a.aviso).map((a) => <small key={a.caminho ?? a.id ?? a.nome} className="ficha-anexo-aviso">{a.nome}: {a.aviso}</small>)}
      {aberto && (
        <dialog ref={grande} className="ficha-grande" aria-label={aberto.nome} onClose={(e) => { e.stopPropagation(); setAberto(null); }} onClick={(e) => e.target === e.currentTarget && grande.current?.close()}>
          {aberto.driveId ? <iframe src={`https://drive.google.com/file/d/${aberto.driveId}/preview`} title={aberto.nome} allow="autoplay; fullscreen" />
            : aberto.tipo === "video" ? <video src={aberto.url} controls autoPlay /> : <img src={aberto.url} alt={aberto.nome} />}
          <button type="button" className="ficha-fechar" onClick={() => grande.current?.close()}>Fechar</button>
        </dialog>
      )}
    </div>
  );
}
