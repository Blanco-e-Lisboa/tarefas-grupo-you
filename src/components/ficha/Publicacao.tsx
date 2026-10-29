"use client";
// Bloco "Publicação" na ficha de um card de Postagem (196; pedido do Natham: programar e postar DENTRO do card, onde ele vê o conteúdo).
//   <Publicacao salvo={tarefa} rascunho={{ ...t, arquivos }} mudar={mudar} gravar={gravar} />
// - Postado: links "Ver no Instagram" / "Ver no Facebook" (para todos).
// - Aprovado: a situação (Programado, Postando…, erro, Programação cancelada) para todos; para o Natham e quem aprova, as redes,
//   a data e hora, "Programar postagem"/"Reprogramar postagem" e "Postar agora" (com confirmação); com erro, "Tentar de novo" + as redes.
// - Toda ação passa pela checagem (o que falta) e grava a FICHA INTEIRA (gravar) antes, para não perder o que foi mudado nela.
// - Só a You está ligada: em outra empresa fica só o aviso.
import { useState } from "react";
import { REDES_POST, postarAgora, tentarDeNovo, descartarEnvio, haQuanto, liberarPendente, relerPendentes, useEnvios, useEu, usePendentes, usePostagemAutomatica, videoPendente, type NovaTarefa, type RedePost, type Tarefa } from "@/lib/dados";
import { CampoData } from "@/components/ui/CampoData";
import Image from "next/image";
import { podeAprovar } from "./Aprovacao";
import { Confirmar } from "./Confirmar";
import { CANCELADA, NOME_REDE, SO_FACEBOOK, carrosselComVideo, carrosselSoFacebook, faltaParaPostar, programacaoCancelada, redesDe, quandoPostou, redesValidas, situacao, textoRedes, textosPublicacao, SO_YOU, hojeEmBrasilia, jaPassou, JA_POSTADO, jaPostadoEm } from "./postagem";

type Props = {
  salvo: Tarefa; rascunho: NovaTarefa;
  mudar: <K extends keyof NovaTarefa>(campo: K, valor: NovaTarefa[K]) => void;
  /** Grava a ficha com `extra` por cima; devolve true se o banco aceitou. */
  gravar: (extra: Partial<NovaTarefa>) => Promise<boolean>;
};

export function Publicacao({ salvo, rascunho, mudar, gravar }: Props) {
  const eu = useEu();
  // Lupa 5: vídeo novo subindo (nesta aba) ou pendente no BANCO (não subiu, outra aba, aba fechada): a postagem espera. Só sai com o vídeo novo ou com "Postar com o vídeo atual".
  const SUBINDO = "Vídeo novo não subiu ou ainda está subindo. Suba de novo; quem aprova também pode usar Postar com o vídeo atual.";
  const desde = usePendentes().get(salvo.id);
  const noBanco = !!desde;
  const doCard = useEnvios().filter((e) => e.tarefaId === salvo.id && e.estado !== "enviado");
  const subindo = doCard.length > 0 || noBanco;
  const [liberando, setLiberando] = useState(false);
  const [recusaLiberar, setRecusaLiberar] = useState("");
  // 238: desligada (ou carregando) = a ficha não promete post real. 239: ligada sem a postar-meta confirmar que publica de verdade
  // (POSTAR_DE_VERDADE=nao, fora do ar ou sem resposta: deVerdade false) = modo de teste.
  const { ligada, deVerdade } = usePostagemAutomatica();
  const teste = ligada && !deVerdade;
  const [quando, setQuando] = useState(salvo.postarEm ?? "");
  const [falta, setFalta] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [clicadas, setClicadas] = useState<RedePost[] | null>(null); // item 230: redes clicadas nesta ficha (null = ainda nenhum clique)
  if (salvo.tipo !== "postagem" || (salvo.etapa !== "aprovado" && salvo.etapa !== "postado")) return null;

  if (salvo.etapa === "postado") {
    // 309: em Postado o bloco fica só para consulta: a data de postagem e os links, sem redes clicáveis, sem Programar e sem Postar agora.
    const links = (salvo.postagens ?? []).filter((p) => p.link);
    const q = quandoPostou(salvo);
    const redesPostadas = (salvo.postagens ?? []).filter((p) => p.status === "postado").map((p) => p.rede);
    return links.length || q ? (
      <fieldset className="ficha-campo publicacao"><legend>Publicação</legend>
        <div className="publicacao-caixa">
          {q && <p className="aprovacao-situacao">Postado em {q.slice(8, 10)}/{q.slice(5, 7)}/{q.slice(0, 4)}{q.length > 10 && ` · ${q.slice(11, 16)}`}{redesPostadas.length > 0 && ` · ${textoRedes(redesPostadas)}`}</p>}
          {links.length > 0 && <div className="publicacao-links">{links.map((p) => <a key={p.rede} className="aprovacao-link" href={p.link} target="_blank" rel="noopener noreferrer">Ver no {NOME_REDE[p.rede]}</a>)}</div>}
        </div>
      </fieldset>
    ) : null;
  }

  const aprova = podeAprovar(salvo, eu);
  const sit = situacao(salvo);
  const cancelada = programacaoCancelada(salvo);
  const ajuste = !!salvo.postarEm && carrosselSoFacebook(salvo, salvo.formato, redesDe(salvo)); // programado assim antes do conserto: o próximo salvar cancela
  // Item 230: o post que já foi programado (ou postado, ou teve a programação cancelada) abre com as redes dele; o que nunca foi abre SEM
  // nenhuma: o banco guarda as duas por padrão (019), mas isso não é escolha de ninguém. Daí em diante vale o que a pessoa clicou aqui.
  const jaProgramado = !!salvo.postarEm || !!salvo.postagens?.length || cancelada;
  const redes = clicadas ?? (jaProgramado ? redesDe(rascunho) : []);
  const soInstagram = carrosselComVideo(rascunho, rascunho.formato);
  const valem = redesValidas(rascunho, rascunho.formato, redes);
  const repetido = jaPostadoEm(salvo, valem); // r4 F2 (b): já saiu em todas as redes escolhidas; acender uma rede sem post libera
  // O que ainda não subiu não está guardado: a função não acharia.
  const checar = (extra: string[] = []) => {
    const f = [...faltaParaPostar(rascunho, rascunho.formato, valem), ...(rascunho.arquivos.some((a) => a.pendente) ? ["Salve a ficha antes: há arquivo que ainda não subiu."] : []), ...(subindo ? [SUBINDO] : []), ...extra];
    setFalta(f);
    return !f.length;
  };
  const programar = () => {
    if (checar(!quando ? ["Escolha a data e a hora."] : jaPassou(quando) ? ["Escolha um horário que ainda não passou."] : [])) void gravar({ postarRedes: valem, postarEm: quando });
  };
  // r2 B1 (contrato do 037 com o Bussola): tentar de novo vai na data escolhida aqui (passada = na hora; futura = na hora marcada).
  // O banco não inventa mais a data; card que perdeu a programação mostra o campo de data também.
  const tentar = async () => { if (checar(!quando ? ["Escolha a data e a hora."] : []) && (await gravar({ postarRedes: valem, postarEm: quando }))) void tentarDeNovo(salvo.id); };
  const txt = textosPublicacao(ligada, !!salvo.postarEm, teste);
  // Achado 5: a confirmação reconfere (a tela e o banco) antes de gravar e mandar postar; o banco também recusa sozinho.
  const postar = async () => {
    setConfirmando(false);
    if (!checar()) return;
    if (await videoPendente(salvo.id)) return setFalta([SUBINDO]);
    if (await gravar({ postarRedes: valem })) void postarAgora(salvo.id);
  };

  return (
    // Título como os outros da ficha (Capa do Reels, Notas) e a caixa embaixo, na mesma margem dos campos (item 210)
    <fieldset className="ficha-campo publicacao"><legend>Publicação</legend><div className="publicacao-caixa">
      {salvo.empresaId !== "you" ? <p className="ficha-dica ficha-dica-fica" role="note">{SO_YOU}</p> : <>
        {sit?.tipo === "postando" && <p className="aprovacao-situacao" data-tipo="postando" role="status">Postando…</p>}
        {subindo && <div className="aprovacao-erro" role="alert"><p><strong>Vídeo novo não subiu.</strong> A postagem está bloqueada para não sair o vídeo sem legenda{desde ? ` (desde ${haQuanto(desde)})` : ""}.{!aprova && " Suba o vídeo de novo, ou peça a quem aprova para liberar."}</p>
          {aprova && <button type="button" className="aprovacao-botao" data-acao="liberar" onClick={() => { setRecusaLiberar(""); setLiberando(true); }}>Postar com o vídeo atual</button>}
          {recusaLiberar && <p>{recusaLiberar}</p>}</div>}
        {txt.aviso && <p className="aprovacao-nota publicacao-desligada" role="note">{txt.aviso}</p>}
        {sit?.tipo === "programado" && !ajuste && <p className="aprovacao-situacao">{txt.situacao(sit.texto)}</p>}
        {ajuste && <div className="aprovacao-erro" role="alert"><p>{txt.situacao(`Precisa de ajuste: ${SO_FACEBOOK} Ao salvar, a programação é cancelada.`)}</p></div>}
        {!sit && !cancelada && <p className="aprovacao-situacao">{txt.situacao("Sem programação.")}</p>}
        {cancelada && <div className="aprovacao-erro" role="alert"><p>{txt.situacao(CANCELADA)}</p></div>}
        {sit?.tipo === "erro" && (
          <div className="aprovacao-erro" role="alert">
            <p>{sit.texto}</p>
            {sit.incerto && <p className="aprovacao-incerto">Pode ter saído. Olhe o perfil da You no {sit.refazer.map((r) => NOME_REDE[r]).join(" e ")} antes de tentar de novo, senão o post pode sair duas vezes.</p>}
            {sit.saiu?.link && <a className="aprovacao-link" href={sit.saiu.link} target="_blank" rel="noopener noreferrer">Ver no {NOME_REDE[sit.saiu.rede]}</a>}
          </div>
        )}
        {aprova && sit?.tipo !== "postando" && <>
          <div className="aprovacao-redes publicacao-redes" role="group" aria-label="Onde postar">
            {REDES_POST.map((r) => {
              const fora = r === "facebook" && soInstagram && redes.includes("instagram");
              const ligada = !fora && redes.includes(r);
              // Item 226: escolhida = cheia na cor da rede + ✓; desligada = vidro do menu lateral com o logo e um tom da rede
              return <button key={r} type="button" className="aprovacao-rede" data-rede={r} aria-pressed={ligada} disabled={fora}
                onClick={() => {
                  const novas = redes.includes(r) ? redes.filter((x) => x !== r) : REDES_POST.filter((x) => x === r || redes.includes(x));
                  setClicadas(novas);
                  mudar("postarRedes", novas.length ? novas : undefined); // o banco não guarda lista vazia (019): sem rede, a tela é que segura
                }}>
                <Image className="marca-rede" src={`/marca/redes/${r}.svg`} alt="" width={18} height={18} />{NOME_REDE[r]}{ligada && <span aria-hidden>✓</span>}
              </button>;
            })}
            {soInstagram && <small className="aprovacao-nota">Carrossel com vídeo vai só para o Instagram: o Facebook não aceita foto e vídeo no mesmo post.</small>}
          </div>
          {sit?.tipo === "erro" ? (
            // Com erro, o caminho é "Tentar de novo" (019: postar_agora não mexe em rede que deu erro); as redes e a data acima valem para a nova tentativa.
            <div className="publicacao-acoes">
              <CampoData rotulo="Data e hora do post" valor={quando.slice(0, 10)} hora={quando.slice(11, 16)} semLimpar vazio="Quando?" anoCurto
                aoMudar={(dia, hora) => setQuando(dia ? `${dia}T${hora || "00:00"}` : "")} />
              <button type="button" className="aprovacao-botao" data-acao="tentar" onClick={() => void tentar()}>
                {sit.incerto ? "Já olhei o perfil: tentar de novo" : sit.saiu && sit.refazer.length === 1 ? `Tentar de novo só no ${NOME_REDE[sit.refazer[0]]}` : "Tentar de novo"}
              </button>
            </div>
          ) : (
            <>{repetido && <p className="aprovacao-nota" role="note">{JA_POSTADO}</p>}
            <div className="publicacao-acoes" data-botoes={txt.postarAgora ? 3 : 2}>
              <CampoData rotulo="Data e hora do post" valor={quando.slice(0, 10)} hora={quando.slice(11, 16)} min={hojeEmBrasilia()} semLimpar vazio="Quando?" anoCurto
                aoMudar={(dia, hora) => setQuando(dia ? `${dia}T${hora || "00:00"}` : "")} />
              <button type="button" className="aprovacao-botao" data-acao={salvo.postarEm ? "reprogramar" : "aprovar"} disabled={repetido} onClick={programar}>{txt.marcar}</button>
              {txt.postarAgora && <button type="button" className="aprovacao-botao" data-acao="postar" disabled={repetido} onClick={() => { if (checar()) setConfirmando(true); }}>Postar agora</button>}
            </div></>
          )}
          {falta.length > 0 && <ul className="aprovacao-falta" role="alert">{falta.map((f) => <li key={f}>{f}</li>)}</ul>}
        </>}
      </>}
      {liberando && <Confirmar titulo="Postar com o vídeo atual?" texto="O vídeo novo não chegou. O post sai com o vídeo que está no card agora (sem a legenda, se for o caso). Não dá para desfazer." acao="Postar com o vídeo atual" perigo
        aoCancelar={() => setLiberando(false)} aoConfirmar={() => { setLiberando(false); void liberarPendente(salvo.id).then((r) => { if (r) return setRecusaLiberar(r); doCard.forEach((e) => descartarEnvio(e.id)); relerPendentes(); }); }} />}
      {confirmando && ligada && <Confirmar {...txt.confirmar(textoRedes(valem), rascunho.titulo)}
        aoCancelar={() => setConfirmando(false)} aoConfirmar={() => void postar()} />}
    </div></fieldset>
  );
}
