"use client";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { textoAoSair } from "./folha";
import { useIdeias, type Ideia } from "@/lib/dados";
import { CabecalhoColuna } from "@/components/ui/CabecalhoColuna";
import { IconeRede } from "@/components/ui/Marca";
import { CardFlutuante } from "./CardFlutuante";
import { MenuColuna } from "./MenuColuna";
import { usePrints } from "./PrintsIdeia";

// Pasta "Ideias de conteúdo" aberta como Mural de folhas (item 247): todas as ideias da empresa, uma coluna por categoria.
// Escrever na folha salva ao sair do campo. A ideia nasce numa coluna e fica nela até ser apagada (item 249). Tudo passa por useIdeias.
const nIdeias = (n: number) => (n === 1 ? "1 ideia" : `${n} ideias`);
const sem = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const linkValido = (l?: string) => !!l && /^https?:\/\//i.test(l);
// Rede do link, só para mostrar o ícone: Instagram, TikTok ou YouTube. Outro endereço fica sem ícone.
export const redeDoLink = (l: string) => {
  try {
    const h = new URL(l).hostname.replace(/^(www|m|vm)\./, "");
    const de = (d: string) => h === d || h.endsWith(`.${d}`); // domínio exato ou subdomínio: evilinstagram.com não vale
    return de("instagram.com") ? "instagram" : de("tiktok.com") ? "tiktok" : de("youtube.com") || h === "youtu.be" ? "youtube" : null;
  } catch {
    return null;
  }
};

const NOME_REDE = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" } as const;
// Um só link: "Ver referência". Vários: nome da rede, com número quando a mesma rede aparece mais de uma vez.
const rotuloLink = (links: string[], l: string) => {
  if (links.length < 2) return "Ver referência";
  const rede = redeDoLink(l);
  const nome = rede ? NOME_REDE[rede] : "Link";
  const mesmas = links.filter((x) => (redeDoLink(x) ?? "") === (rede ?? ""));
  return mesmas.length > 1 ? `${nome} ${mesmas.indexOf(l) + 1}` : nome;
};

type Dados = Omit<Ideia, "empresaId" | "id" | "prints"> & { id?: string; prints?: string[] };

export function MuralIdeias({ empresaId, nome, tom, aoFechar }: { empresaId: string; nome: string; tom: string; aoFechar: () => void }) {
  const { ideias, categorias: todas, salvar, apagar, criarCategoria, moverCategoria, renomearCategoria, apagarCategoria } = useIdeias(empresaId);
  const [busca, setBusca] = useState("");
  const [foco, setFoco] = useState<string | null>(null);

  const q = sem(busca.trim());
  const acha = (i: Ideia) => !q || sem(`${i.titulo} ${i.texto} ${i.links.join(" ")} ${i.categoria}`).includes(q);
  const colunas = todas.map((cat) => ({ cat, itens: ideias.filter((i) => i.categoria === cat && acha(i)) })).filter((c) => !q || c.itens.length);
  const achadas = colunas.reduce((s, c) => s + c.itens.length, 0);


  return (
    <CardFlutuante titulo={`Ideias de conteúdo · ${nome}`} aoFechar={aoFechar} classe="mural">
      <div className="mural-barra">
        <input type="search" className="mural-busca" placeholder="Buscar nas ideias" aria-label="Buscar nas ideias" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <span className="mural-conta">{q ? `${nIdeias(achadas)} achadas` : nIdeias(ideias.length)}</span>
      </div>
      <div className="mural-quadro" style={{ "--mural-tom": tom } as CSSProperties}>
        {colunas.map(({ cat, itens }, n) => (
          <Coluna key={cat} cat={cat} numero={n + 1} itens={itens} naPonta={{ esquerda: todas.indexOf(cat) === 0, direita: todas.indexOf(cat) === todas.length - 1 }} podeMover={!q} autoFocar={foco === cat}
            aoSalvar={salvar} aoApagar={apagar} aoMover={(p) => moverCategoria(cat, p)} aoRenomear={(novo) => renomearCategoria(cat, novo)} aoApagarColuna={() => apagarCategoria(cat)} />
        ))}
        {!q && <NovaCategoria existentes={todas} aoCriar={(c) => { criarCategoria(c); setFoco(c); }} />}
        {q && colunas.length === 0 && <p className="mural-vazio">Nenhuma ideia com “{busca.trim()}”.</p>}
      </div>
    </CardFlutuante>
  );
}

// Uma coluna do mural: cabeçalho com ⋮ (Renomear, Mover, Apagar) e as folhas. Apagar só com a coluna vazia: as ideias nunca somem junto.
function Coluna({ cat, numero, itens, naPonta, podeMover, autoFocar, aoSalvar, aoApagar, aoMover, aoRenomear, aoApagarColuna }: {
  cat: string; numero: number; itens: Ideia[]; naPonta: { esquerda: boolean; direita: boolean }; podeMover: boolean; autoFocar: boolean;
  aoSalvar: (d: Dados) => void; aoApagar: (id: string) => void; aoMover: (p: -1 | 1) => void; aoRenomear: (novo: string) => boolean; aoApagarColuna: () => boolean;
}) {
  const [renomeando, setRenomeando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState("");
  const cancelou = useRef(false); // Esc desiste do novo nome
  const dentro = itens.length; // com busca ligada o menu não aparece, então aqui são todas as da coluna
  const terminar = (e: { currentTarget: HTMLInputElement }) => {
    const v = e.currentTarget.value.trim();
    if (cancelou.current || !v || v === cat) { cancelou.current = false; return setRenomeando(false); }
    if (aoRenomear(v)) setRenomeando(false);
    else setErro(`Já existe uma coluna chamada “${v}”.`);
  };
  return (
    <section className="mural-col" aria-label={cat}>
      <CabecalhoColuna
        numero={numero}
        titulo={renomeando ? (
          <input className="mural-col-nome" aria-label={`Novo nome da coluna ${cat}`} defaultValue={cat} maxLength={60} autoFocus onFocus={(e) => e.currentTarget.select()} onBlur={terminar}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } else if (e.key === "Escape") { cancelou.current = true; setErro(""); e.currentTarget.blur(); } }} />
        ) : cat}
        total={itens.length}
        rotuloNovo={`Nova ideia em ${cat}`}
        aoNovo={() => document.querySelector<HTMLInputElement>(`input[aria-label="${CSS.escape("Nova ideia em " + cat)}"]`)?.focus()}
        extra={podeMover && <MenuColuna nome={cat} naPonta={naPonta} aoRenomear={() => { setErro(""); setRenomeando(true); }} aoMover={aoMover} aoApagar={() => setApagando(true)} />}
      />
      {erro && <p className="mural-col-erro" role="alert">{erro}</p>}
      <div className="mural-folhas">
        {itens.map((i) => <Folha key={i.id} ideia={i} aoSalvar={aoSalvar} aoApagar={() => aoApagar(i.id)} />)}
        <Nova categoria={cat} autoFocar={autoFocar} aoCriar={(titulo) => aoSalvar({ categoria: cat, titulo, texto: "", links: [] })} />
      </div>
      {apagando && (
        <div className="mural-confirma" role="alertdialog" aria-label={`Apagar coluna ${cat}`}>
          {dentro ? (
            <>
              <p>Não dá para apagar “{cat}”: ela tem {nIdeias(dentro)}.</p>
              <p className="mural-confirma-nota">Apague as ideias ou mude cada uma de lugar antes. Assim nenhuma se perde sem você querer.</p>
              <div className="ideia-acoes"><button type="button" className="btn btn-2" autoFocus onClick={() => setApagando(false)}>Entendi</button></div>
            </>
          ) : (
            <>
              <p>Apagar a coluna “{cat}”?</p>
              <p className="mural-confirma-nota">Ela está vazia. Some para você e para o Matheus.</p>
              <div className="ideia-acoes">
                <button type="button" className="btn pasta-perigo" onClick={() => { aoApagarColuna(); setApagando(false); }}>Apagar</button>
                <button type="button" className="btn btn-2" autoFocus onClick={() => setApagando(false)}>Manter</button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Folha({ ideia, aoSalvar, aoApagar }: { ideia: Ideia; aoSalvar: (d: Dados) => void; aoApagar: () => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [tirando, setTirando] = useState<string | null>(null); // link esperando confirmação para sair
  const { colar, bloco } = usePrints(ideia);
  const titulo = useRef<HTMLTextAreaElement>(null), detalhe = useRef<HTMLTextAreaElement>(null);
  const aoEntrar = useRef("");
  // A3: o campo usa defaultValue (só vale na 1ª vez); a mudança de outra pessoa entra no campo que não está em uso
  useEffect(() => {
    for (const [el, v] of [[titulo.current, ideia.titulo], [detalhe.current, ideia.texto]] as const) if (el && el !== document.activeElement) el.value = v;
  }, [ideia.titulo, ideia.texto]);
  const entrar = (e: { currentTarget: HTMLTextAreaElement }) => { aoEntrar.current = e.currentTarget.value; };
  const sair = (campo: "titulo" | "texto", e: { currentTarget: HTMLInputElement | HTMLTextAreaElement }) => {
    const v = textoAoSair(aoEntrar.current, e.currentTarget.value);
    if (v === null || (campo === "titulo" && !v)) { e.currentTarget.value = ideia[campo]; return; } // não mexeu (ou título vazio): mostra o que o banco tem
    if (v !== ideia[campo]) aoSalvar({ ...ideia, [campo]: v });
  };
  const links = ideia.links;
  const novoLink = (e: { currentTarget: HTMLInputElement }) => {
    const v = e.currentTarget.value.trim();
    e.currentTarget.value = "";
    if (linkValido(v) && !links.includes(v)) aoSalvar({ ...ideia, links: [...links, v] });
  };
  return (
    <article className="mural-folha" onPaste={colar}>
      <div className="mural-folha-topo">
        <textarea ref={titulo} className="mural-titulo" aria-label="Título" rows={1} maxLength={120} defaultValue={ideia.titulo} onFocus={entrar} onBlur={(e) => sair("titulo", e)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())} />
        <button type="button" className="mural-apagar" aria-label={`Apagar ideia ${ideia.titulo}`} onClick={() => setConfirmando(true)}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8h5.8l.6-8" /></svg>
        </button>
      </div>
      <textarea ref={detalhe} className="mural-detalhe" aria-label="Detalhe" rows={2} placeholder="Detalhe" defaultValue={ideia.texto} onFocus={entrar} onBlur={(e) => sair("texto", e)} />
      {bloco}
      <div className="mural-rodape" data-vazio={!links.length ? true : undefined}>
        {links.map((l) => {
          const rede = redeDoLink(l);
          const rotulo = rotuloLink(links, l);
          return (
            <div key={l} className="mural-ref">
              {linkValido(l) ? (
                <a className="mural-ver" href={l} target="_blank" rel="noopener noreferrer" title={l}>
                  {rede && <IconeRede rede={rede} tamanho={14} />}{rotulo}
                </a>
              ) : (
                <span className="mural-ver">{l}</span>
              )}
              <button type="button" className="mural-trocar" aria-label={`Tirar o link ${l}`} title="Tirar este link" onClick={() => setTirando(l)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
              </button>
            </div>
          );
        })}
        <input
          type="url"
          className="mural-link-campo"
          aria-label={links.length ? "Outro link de referência" : "Link de referência"}
          placeholder={links.length ? "Colar outro link" : "Colar link de referência"}
          onBlur={novoLink}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
        />
      </div>
      {(confirmando || tirando) && (
        <div className="mural-confirma" role="alertdialog" aria-label={tirando ? "Tirar link" : "Apagar ideia"}>
          <p>{tirando ? "Tirar este link?" : "Apagar esta ideia?"}</p>
          <div className="ideia-acoes">
            <button type="button" className="btn pasta-perigo" onClick={() => { if (tirando) aoSalvar({ ...ideia, links: links.filter((x) => x !== tirando) }); else aoApagar(); setTirando(null); }}>{tirando ? "Tirar" : "Apagar"}</button>
            <button type="button" className="btn btn-2" autoFocus onClick={() => { setConfirmando(false); setTirando(null); }}>Manter</button>
          </div>
        </div>
      )}
    </article>
  );
}

// Folha em branco: Enter (ou sair do campo com texto) cria a ideia e deixa a próxima em branco, já com o cursor.
function Nova({ categoria, autoFocar, aoCriar }: { categoria: string; autoFocar: boolean; aoCriar: (titulo: string) => void }) {
  const [texto, setTexto] = useState("");
  const criar = () => {
    const t = texto.trim();
    if (t) aoCriar(t);
    setTexto("");
  };
  return (
    <div className="mural-folha mural-nova">
      <input
        aria-label={`Nova ideia em ${categoria}`}
        placeholder="+ nova"
        maxLength={120}
        autoFocus={autoFocar}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={criar}
        onKeyDown={(e: KeyboardEvent) => e.key === "Enter" && (e.preventDefault(), criar())}
      />
    </div>
  );
}

function NovaCategoria({ existentes, aoCriar }: { existentes: string[]; aoCriar: (c: string) => void }) {
  const [texto, setTexto] = useState("");
  const criar = () => {
    const c = texto.trim();
    if (c && !existentes.some((e) => sem(e) === sem(c))) aoCriar(c);
    setTexto("");
  };
  return (
    <section className="mural-col mural-col-nova" aria-label="Nova categoria">
      <input aria-label="Nova categoria" placeholder="+ categoria" maxLength={60} value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={criar} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), criar())} />
    </section>
  );
}
