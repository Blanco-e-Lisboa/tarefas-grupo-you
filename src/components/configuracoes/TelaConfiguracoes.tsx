"use client";

import { useRef, useState, type FormEvent } from "react";
import { salvarEmpresa, useEmpresas, useEu, useTarefas } from "@/lib/dados";
import { SeloEmpresa, temLogo } from "@/components/ui/Marca";
import { BlocoGoogleDrive } from "./BlocoGoogleDrive";
import "./configuracoes.css";

function sigla(nome: string) {
  return nome.trim().split(/\s+/).map((parte) => parte[0]).join("").slice(0, 2).toLocaleUpperCase("pt-BR");
}

export function TelaConfiguracoes() {
  const empresas = useEmpresas();
  const eu = useEu();
  // Só o que é meu ou conteúdo com empresa: depois do 006 o Natham também recebe as tarefas privadas do Matheus.
  const tarefas = useTarefas().filter((t) => (t.dono ?? t.responsavel) === eu || !!t.etapa);
  const [novoNome, setNovoNome] = useState("");
  const [erro, setErro] = useState("");
  const [incluindo, setIncluindo] = useState(false);
  const indo = useRef(false); // B15: dois cliques rápidos usavam a mesma lista velha e incluíam a empresa duas vezes

  async function incluir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const nome = novoNome.trim();
    if (!nome || indo.current) return;
    if (empresas.some((empresa) => empresa.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))) {
      setErro("Essa empresa já está cadastrada.");
      return;
    }
    indo.current = true;
    setIncluindo(true);
    try {
      setErro("");
      await salvarEmpresa({ id: crypto.randomUUID(), nome, sigla: sigla(nome) });
      setNovoNome("");
    } catch { setErro("Não foi possível incluir a empresa. Tente novamente."); }
    indo.current = false;
    setIncluindo(false);
  }

  return (
    <section className="config-tela">
      <header className="config-cabecalho">
        <div><h1>Configurações</h1><p>Cadastre as empresas que aparecem na grade de conteúdo.</p></div>
        <div className="config-total bloco-destaque"><strong className="bloco-numero">{empresas.length}</strong><span className="bloco-fraco">{empresas.length === 1 ? "empresa" : "empresas"}</span></div>
      </header>
      {erro && <p className="config-erro" role="alert">{erro}</p>}
      <section className="config-bloco" aria-labelledby="config-empresas-titulo">
        <div className="config-bloco-topo"><h2 id="config-empresas-titulo">Empresas</h2></div>
        <ul className="config-lista">
          {empresas.map((empresa) => {
            const quantidade = tarefas.filter((t) => t.empresaId === empresa.id).length;
            return (
              <li className="config-empresa-sombra" key={empresa.id}><div className="config-empresa">
                {temLogo(empresa.id) ? <SeloEmpresa empresaId={empresa.id} nome={empresa.nome} tamanho={40} /> : <span className="config-monograma" aria-hidden="true">{empresa.sigla}</span>} {/* sem logo cadastrado: continua a sigla no quadradinho */}
                <div className="config-empresa-corpo">
                  <strong>{empresa.nome}</strong><span>{quantidade} {quantidade === 1 ? "tarefa" : "tarefas"}</span>
                </div>
              </div></li>
            );
          })}
        </ul>
      </section>
      {eu === "natham" && <BlocoGoogleDrive />}
      <div className="config-incluir-sombra"><form className="config-incluir" onSubmit={(evento) => void incluir(evento)}>
        <h2>Incluir empresa</h2>
        <label htmlFor="config-nova-empresa">Nome da empresa</label>
        <div><input id="config-nova-empresa" value={novoNome} onChange={(evento) => setNovoNome(evento.target.value)} placeholder="Ex.: Lavoro Piu" maxLength={80} required /><button className="config-botao" type="submit" disabled={incluindo}>{incluindo ? "Incluindo..." : "Incluir"}</button></div>
      </form></div>
    </section>
  );
}
