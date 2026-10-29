import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { Arquivo } from "@/lib/dados";

/** Junta à lista da ficha (`x`) os `novos` do card vivo e passa o papel do banco (`vivos`) aos arquivos que ela já tem.
    r2 B2: só entra o novo que a ficha ainda não tem. O salvar põe o id novo no próprio item da ficha (anexos.ts), e o mesmo arquivo,
    chegando pelo card vivo, entrava de novo (foto em dobro, e o "Post leva 1 imagem" barrava o Programar). */
export function juntarChegados(x: Arquivo[], vivos: Arquivo[] | undefined, novos: Arquivo[]): Arquivo[] {
  const naFicha = new Set(x.flatMap((a) => (a.id ? [a.id] : [])));
  const papel = new Map((vivos ?? []).flatMap((a) => (a.id ? [[a.id, a.papel] as const] : [])));
  const lista = x.map((a) => (a.id && papel.has(a.id) && papel.get(a.id) !== a.papel ? { ...a, papel: papel.get(a.id) } : a));
  for (const a of novos.filter((n) => !naFicha.has(n.id!))) {
    // r4 (novo 4): o vídeo que subiu em segundo plano toma o lugar do provisório (pendente) de mesmo nome; antes os dois ficavam e o Programar pedia salvar
    const i = lista.findIndex((p) => p.pendente && p.tipo === "video" && p.nome === a.nome);
    if (i >= 0) lista[i] = a; else lista.push(a);
  }
  return lista;
}

// 268: vídeo que terminou de subir em segundo plano chega ao card com a ficha aberta; entra na lista da ficha também, senão o próximo Salvar o apagaria.
// Lupa 6: arquivo que a ficha já tem recebe o papel do banco (o vídeo sem legenda vira "original" quando o legendado chega).
export function useArquivosQueChegam(vivos: Arquivo[] | undefined, iniciais: Arquivo[], definir: Dispatch<SetStateAction<Arquivo[]>>) {
  const conhecidos = useRef(new Set(iniciais.flatMap((a) => (a.id ? [a.id] : []))));
  useEffect(() => {
    const novos = (vivos ?? []).filter((a) => a.id && !conhecidos.current.has(a.id));
    novos.forEach((a) => conhecidos.current.add(a.id!));
    definir((x) => juntarChegados(x, vivos, novos));
  }, [vivos, definir]);
}
