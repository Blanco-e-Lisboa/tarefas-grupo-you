"use client";
import { useState } from "react";
import {
  apagarPastaLivre, arvoreDePastas, criarPastaLivre, ligarPermanente, ligarPermanentePastaLivre, pastasLivresDaEmpresa, podeAlterar, renomearOcasiao, renomearPastaLivre,
  useDocumentosSoltos, useEmpresas, useEu, useIdeias, useOcasioes, usePastasLivres, useTarefas,
  type DocumentoSolto, type Empresa, type PastaConteudo, type PastaFormato, type PastaLivre, type PastaTema, type Tarefa, type TipoTarefa,
} from "@/lib/dados";

const TIPOS_DE_CARD: TipoTarefa[] = ["roteiro", "gravacao", "edicao", "postagem"]; // os mesmos da Esteira
import { useFiltroEmpresa } from "@/lib/filtro-empresa";
import { FiltroEmpresa } from "@/components/casca/FiltroEmpresa";
import { Ficha, NOMES } from "@/components/ficha/Ficha";
import { SeloEmpresa } from "@/components/ui/Marca";
import { receitaDaEmpresa, tomDaEmpresa } from "./cores";
import { MuralIdeias } from "./MuralIdeias";
import { CardFlutuante } from "./CardFlutuante";
import { CardDocumento, CardNome, CardSubir, mensagem, type Destino } from "./CardsPasta";
import { MenuPasta } from "./MenuPasta";
import { PastaDeVidro } from "./PastaDeVidro";

const MS_DIA = 86_400_000;
const nIdeias = (n: number) => (n === 1 ? "1 ideia" : `${n} ideias`);
const nItens = (n: number) => (n === 1 ? "1 item" : `${n} itens`);

/** "some em 3 dias" (o Drive manda para a lixeira 7 dias depois de Postado). Vazio quando não vence. */
function someEm(c: PastaConteudo) {
  if (!c.venceEm) return "";
  const dias = Math.max(0, Math.ceil((c.venceEm.getTime() - Date.now()) / MS_DIA));
  return dias === 0 ? "some hoje" : dias === 1 ? "some em 1 dia" : `some em ${dias} dias`;
}

const Cadeado = () => (
  <svg className="pasta-cadeado" viewBox="0 0 20 20" width="18" height="18" aria-label="Permanente" role="img"><rect x="4" y="9" width="12" height="8" rx="2.4" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></svg>
);

type Aberto = { conteudo: Tarefa } | { documento: DocumentoSolto } | { ideias: true };

function Faixa({ empresa }: { empresa: Empresa }) {
  const eu = useEu();
  const { ideias, categorias } = useIdeias(empresa.id);
  const tarefas = useTarefas(), ocasioes = useOcasioes(), documentos = useDocumentosSoltos();
  const pastasLivres = usePastasLivres();
  const livres = pastasLivresDaEmpresa({ empresaId: empresa.id, pastas: pastasLivres, documentos });
  const arvore = arvoreDePastas({ empresaId: empresa.id, tarefas, ocasioes, documentos });
  const [escolhido, setEscolhido] = useState<string | undefined>();
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [novo, setNovo] = useState(false);
  const [renomeandoLivre, setRenomeandoLivre] = useState<PastaLivre | null>(null);
  const [desligandoLivre, setDesligandoLivre] = useState<PastaLivre | null>(null);
  const [apagando, setApagando] = useState<PastaLivre | null>(null);
  const [renomeando, setRenomeando] = useState<PastaTema | null>(null);
  const [desligando, setDesligando] = useState<PastaTema | null>(null);
  const [subindo, setSubindo] = useState<Destino | null>(null);
  const [aviso, setAviso] = useState("");
  const t = tomDaEmpresa(empresa.id);
  const tom = { base: t.r, sombra: `${t.g}99` };
  const arte = receitaDaEmpresa("post", empresa.id);
  const chave = (f: PastaFormato) => f.formato ?? "sem";
  const itensDe = (f: PastaFormato) => f.temas.reduce((s, p) => s + p.conteudos.length + p.documentos.length, 0);
  const total = arvore.reduce((s, f) => s + itensDe(f), 0) + livres.reduce((s, l) => s + l.documentos.length, 0);
  // sem escolha, abre o primeiro formato que tem algo (senão o primeiro)
  const atual = arvore.find((f) => chave(f) === escolhido) ?? arvore.find((f) => itensDe(f) > 0) ?? arvore[0];
  const natham = eu === "natham";

  const alternarLivre = async (p: PastaLivre) => {
    try { await ligarPermanentePastaLivre(p.id, !p.permanente); } catch (e) { setAviso(mensagem(e, "Não consegui mudar o Permanente.")); }
  };
  const alternarPermanente = async (p: PastaTema) => {
    if (!p.ocasiao) return;
    try { await ligarPermanente(p.ocasiao.id, !p.permanente); } catch (e) { setAviso(mensagem(e, "Não consegui mudar o Permanente.")); }
  };

  return (
    <div className="pastas-empresa">
      <h2>
        <SeloEmpresa empresaId={empresa.id} nome={empresa.nome} tamanho={28} comNome /> <small>{nItens(total)}</small>
        <button type="button" className="btn pastas-nova" onClick={() => setNovo(true)}>+ Nova pasta</button>
      </h2>

      <div className="pastas-grade">
        {arvore.map((f, i) => (
          <div key={chave(f)} className="pastas-cel" data-escolhida={f === atual || undefined}>
            <PastaDeVidro
              rotulo={f.nome}
              legenda={f.temas.length === 0 ? "Pasta vazia" : nItens(itensDe(f))}
              tom={tom}
              arte={receitaDaEmpresa(f.formato === "reels" ? "video" : f.formato === "story" ? "story" : "post", empresa.id)}
              seed={3 + i * 4}
              atraso={i * 120}
              aoMudar={(a) => { if (a) setEscolhido(chave(f)); }}
              arquivos={f.temas.map((p) => ({ id: p.ocasiao?.id ?? "sem-tema", nome: p.nome, meta: p.vazio ? "vazio" : nItens(p.conteudos.length + p.documentos.length), arte }))}
              onSelecionar={() => setEscolhido(chave(f))}
            />
          </div>
        ))}
        {livres.map(({ pasta, documentos: docs }, i) => {
          const podeLigar = !pasta.permanente || natham; // só o Natham desliga: o banco recusa os outros
          return (
            <div key={pasta.id} className="pastas-cel">
              <PastaDeVidro
                rotulo={pasta.nome}
                legenda={docs.length === 0 ? "Pasta vazia" : docs.length === 1 ? "1 arquivo" : `${docs.length} arquivos`}
                vazio="Nada aqui ainda. Suba um arquivo."
                tom={tom}
                arte={receitaDaEmpresa("post", empresa.id)}
                seed={53 + i * 4}
                atraso={(arvore.length + i) * 120}
                selo={pasta.permanente ? <Cadeado /> : undefined}
                rotuloNova="+ Subir arquivo"
                aoNovaFolha={() => setSubindo({ pasta })}
                acoes={
                  <MenuPasta
                    nome={pasta.nome}
                    aoRenomear={() => setRenomeandoLivre(pasta)}
                    aoExcluir={() => (pasta.permanente ? setAviso("Esta pasta tem cadeado. Desligue o Permanente para apagar.") : setApagando(pasta))}
                    rotuloExcluir="Apagar pasta"
                    itens={podeLigar ? [{ rotulo: "Permanente", marcado: pasta.permanente, aoEscolher: () => (pasta.permanente ? setDesligandoLivre(pasta) : void alternarLivre(pasta)) }] : []}
                  />
                }
                arquivos={docs.map((d) => ({ id: d.id, nome: d.nome, meta: d.tamanho ? `${(d.tamanho / 1_000_000).toFixed(1).replace(".", ",")} MB` : "Arquivo", arte: receitaDaEmpresa("post", empresa.id) }))}
                onSelecionar={(a) => { const d = docs.find((x) => x.id === a.id); if (d) setAberto({ documento: d }); }}
              />
            </div>
          );
        })}
        {/* Ideias de conteúdo: pasta como as outras, a última da fileira; fora do Drive */}
        <div className="pastas-cel">
          <PastaDeVidro
            rotulo="Ideias de conteúdo"
            legenda={`${nIdeias(ideias.length)} · só aqui`}
            tom={tom}
            arte={receitaDaEmpresa("story", empresa.id)}
            seed={19}
            atraso={(arvore.length + livres.length) * 120}
            arquivos={categorias.map((c) => ({ nome: c, meta: nIdeias(ideias.filter((x) => x.categoria === c).length), arte: receitaDaEmpresa("story", empresa.id) }))}
            abreNoHover
            aoClicar={() => setAberto({ ideias: true })}
            onSelecionar={() => setAberto({ ideias: true })}
          />
        </div>
      </div>

      {atual && (
        <section className="pastas-temas" aria-label={`Temas de ${atual.nome}`}>
          <h3>{atual.nome} <small>temas</small></h3>
          {atual.temas.length === 0 && <p className="pastas-vazio">Nenhum tema aqui ainda. Crie um na ficha de um conteúdo.</p>}
          <div className="pastas-grade">
            {atual.temas.map((p, i) => {
              const n = p.conteudos.length + p.documentos.length;
              const podeLigar = !!p.ocasiao && (!p.permanente || natham); // só o Natham desliga: o banco recusa os outros
              return (
                <div key={`${atual.nome}:${p.ocasiao?.id ?? "sem-tema"}`} className="pastas-cel">
                  <PastaDeVidro
                    rotulo={p.nome}
                    legenda={p.vazio ? "Tema vazio" : nItens(n)}
                    vazio="Nada aqui ainda."
                    tom={tom}
                    arte={arte}
                    seed={31 + i * 4}
                    atraso={i * 120}
                    selo={p.permanente ? <Cadeado /> : undefined}
                    acoes={p.ocasiao ? (
                      <MenuPasta
                        nome={p.nome}
                        aoRenomear={() => setRenomeando(p)}
                        itens={podeLigar ? [{ rotulo: "Permanente", marcado: p.permanente, aoEscolher: () => (p.permanente ? setDesligando(p) : void alternarPermanente(p)) }] : []}
                      />
                    ) : undefined}
                    arquivos={[
                      ...p.conteudos.map((c) => ({ id: `c:${c.tarefa.id}`, nome: c.tarefa.titulo, meta: [c.tarefa.etapa ? NOMES.etapa[c.tarefa.etapa] : "", someEm(c)].filter(Boolean).join(" · "), arte })),
                      ...p.documentos.map((d) => ({ id: `d:${d.id}`, nome: d.nome, meta: "Documento", arte })),
                    ]}
                    onSelecionar={(a) => {
                      const id = a.id ?? "";
                      if (id.startsWith("c:")) { const c = p.conteudos.find((x) => x.tarefa.id === id.slice(2)); if (c) setAberto({ conteudo: c.tarefa }); }
                      else { const d = p.documentos.find((x) => x.id === id.slice(2)); if (d) setAberto({ documento: d }); }
                    }}
                  />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {novo && (
        <CardNome
          titulo="Nova pasta"
          coisa="pasta"
          botao="Criar pasta"
          comPermanente
          emUso={(n) => pastasLivres.some((o) => o.empresaId === empresa.id && o.nome.trim().toLowerCase() === n.toLowerCase())}
          aoSalvar={async (n, permanente) => { await criarPastaLivre(empresa.id, n, permanente); setNovo(false); }}
          aoFechar={() => setNovo(false)}
        />
      )}
      {renomeandoLivre && (
        <CardNome
          titulo="Renomear pasta"
          coisa="pasta"
          botao="Salvar"
          inicial={renomeandoLivre.nome}
          emUso={(n) => pastasLivres.some((o) => o.empresaId === empresa.id && o.id !== renomeandoLivre.id && o.nome.trim().toLowerCase() === n.toLowerCase())}
          aoSalvar={async (n) => { await renomearPastaLivre(renomeandoLivre.id, n); setRenomeandoLivre(null); }}
          aoFechar={() => setRenomeandoLivre(null)}
        />
      )}
      {desligandoLivre && (
        <CardFlutuante titulo="Desligar Permanente" aoFechar={() => setDesligandoLivre(null)}>
          <p className="pasta-texto">Sem o cadeado, a pasta “{desligandoLivre.nome}” poderá ser apagada com tudo o que tem nela. Nada sai sozinho.</p>
          <div className="ideia-acoes">
            <button type="button" className="btn pasta-perigo" onClick={() => { const p = desligandoLivre; setDesligandoLivre(null); void alternarLivre(p); }}>Desligar</button>
            <button type="button" className="btn btn-2" autoFocus onClick={() => setDesligandoLivre(null)}>Manter permanente</button>
          </div>
        </CardFlutuante>
      )}
      {apagando && (
        <CardFlutuante titulo="Apagar pasta" aoFechar={() => setApagando(null)}>
          <p className="pasta-texto">Apagar a pasta “{apagando.nome}” e tudo o que tem nela? Vai para a lixeira do Drive.</p>
          <div className="ideia-acoes">
            <button type="button" className="btn pasta-perigo" onClick={async () => { const p = apagando; setApagando(null); try { await apagarPastaLivre(p.id); } catch (e) { setAviso(mensagem(e, "Não consegui apagar a pasta.")); } }}>Apagar pasta</button>
            <button type="button" className="btn btn-2" autoFocus onClick={() => setApagando(null)}>Manter</button>
          </div>
        </CardFlutuante>
      )}
      {renomeando?.ocasiao && (
        <CardNome
          titulo="Renomear tema"
          coisa="tema"
          botao="Salvar"
          inicial={renomeando.nome}
          emUso={(n) => ocasioes.some((o) => o.empresaId === empresa.id && o.id !== renomeando.ocasiao?.id && o.nome.trim().toLowerCase() === n.toLowerCase())}
          aoSalvar={async (n) => {
            const faltam = await renomearOcasiao(renomeando.ocasiao!.id, n);
            if (faltam > 0) throw new Error(`O tema foi renomeado, mas ${faltam} ${faltam === 1 ? "pasta de conteúdo ficou" : "pastas de conteúdo ficaram"} com o nome antigo. Renomeie de novo para terminar.`);
            setRenomeando(null);
          }}
          aoFechar={() => setRenomeando(null)}
        />
      )}
      {desligando && (
        <CardFlutuante titulo="Desligar Permanente" aoFechar={() => setDesligando(null)}>
          <p className="pasta-texto">Os conteúdos já postados deste tema serão apagados do Drive 7 dias depois de agora.</p>
          <div className="ideia-acoes">
            <button type="button" className="btn pasta-perigo" onClick={() => { const p = desligando; setDesligando(null); void alternarPermanente(p); }}>Desligar</button>
            <button type="button" className="btn btn-2" autoFocus onClick={() => setDesligando(null)}>Manter permanente</button>
          </div>
        </CardFlutuante>
      )}
      {subindo && <CardSubir empresaId={empresa.id} destino={subindo} aoFechar={() => setSubindo(null)} />}
      {aviso && (
        <CardFlutuante titulo="Aviso" aoFechar={() => setAviso("")}>
          <p className="pasta-texto" role="alert">{aviso}</p>
          <button type="button" className="btn btn-2" onClick={() => setAviso("")}>Entendi</button>
        </CardFlutuante>
      )}
      {/* B13: como na Esteira, quem não pode mexer abre só para olhar, e o Tipo só oferece os tipos de card */}
      {aberto && "conteudo" in aberto && <Ficha key={aberto.conteudo.id} tarefa={aberto.conteudo} tipos={TIPOS_DE_CARD} soLer={!podeAlterar(aberto.conteudo, eu)} aoFechar={() => setAberto(null)} />}
      {aberto && "documento" in aberto && <CardDocumento doc={aberto.documento} aoFechar={() => setAberto(null)} />}
      {aberto && "ideias" in aberto && <MuralIdeias empresaId={empresa.id} nome={empresa.nome} tom={t.r} aoFechar={() => setAberto(null)} />}
    </div>
  );
}

export function TelaPastas() {
  const empresas = useEmpresas();
  const { todas, selecionadas } = useFiltroEmpresa();
  // só nas Pastas: a You vem primeiro, as demais empresas seguem na ordem do cadastro
  const mostradas = empresas.filter((e) => todas || selecionadas.includes(e.id)).sort((a, b) => Number(b.id === "you") - Number(a.id === "you"));

  return (
    <section className="pastas">
      <header className="pastas-topo">
        <div className="pastas-quem">
          <h1>Pastas</h1>
          <FiltroEmpresa />
        </div>
        <p>Os arquivos de cada empresa no Drive, por formato e tema, e as suas pastas. Ideias de conteúdo fica só aqui no sistema.</p>
      </header>

      {mostradas.length === 0 && <p className="pastas-vazio">Nenhuma empresa para o filtro atual.</p>}
      {mostradas.map((e) => <Faixa key={e.id} empresa={e} />)}
    </section>
  );
}
