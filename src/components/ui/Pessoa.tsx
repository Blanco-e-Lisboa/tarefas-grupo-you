"use client";
import Image from "next/image";
import { useState } from "react";
import type { Responsavel } from "@/lib/dados";
import "./pessoa.css";

// Foto redonda da pessoa (item 104). Peça ÚNICA: toda tela que mostra "quem é o responsável" usa este avatar.
// Fotos em public/pessoas/ (origem anotada em public/pessoas/LEIAME.md). Sem foto, ou foto que não carrega, cai na inicial.
export const NOME_PESSOA: Record<Responsavel, string> = { natham: "Natham", matheus: "Matheus", adrian: "Adrian", lucas: "Lucas" };
const FOTOS: Partial<Record<Responsavel, string>> = { natham: "/pessoas/natham.png", matheus: "/pessoas/matheus.png", adrian: "/pessoas/adrian.png", lucas: "/pessoas/lucas.png" };

/** tamanho = diâmetro em px. O nome vira dica ao parar o mouse e texto para leitor de tela; escreva o nome ao lado onde ele já aparece. */
export function Pessoa({ quem, tamanho = 24 }: { quem: Responsavel; tamanho?: number }) {
  const [semFoto, setSemFoto] = useState(false);
  const nome = NOME_PESSOA[quem];
  const foto = FOTOS[quem];
  return (
    <span className="pessoa" role="img" aria-label={nome} title={nome} style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.42) }}>
      {foto && !semFoto ? <Image className="pessoa-foto" src={foto} alt="" width={tamanho * 2} height={tamanho * 2} onError={() => setSemFoto(true)} /> : nome[0]}
    </span>
  );
}
