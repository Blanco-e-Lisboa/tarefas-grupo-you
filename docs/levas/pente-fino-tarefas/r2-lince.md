# Pente fino do sistema Tarefas, rodada 2: Lince

Área (olhos novos): Caderno (`src/components/tarefas`), Calendário (com Postagens), Mapa, `src/components/ui` e a camada de dados que eles usam (agenda, agenda-feitos, anotacoes, tempo-real, postagens-planejadas, marcar-feita, filtro-empresa, atraso).
Alvo: o código atual, com os consertos da rodada 1 ainda sem commit. Leitura do código só; nada foi editado nem gravado no banco.
O que já está em `r1-lista.md`, nos `r1-consertos-*.md` e na `r1-conferencia-codex.md` não foi repetido, a não ser quando o conserto ficou incompleto.

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

---

## 1. A9 incompleto: no Caderno, "Marcar horário", arrastar a linha e "Duração" ainda mexem no card programado

- **Arquivo:linha:** `src/components/tarefas/TelaTarefas.tsx:218` a `:231` (`moverPara`, usado pelo arraste da alça, pelas setas do teclado e por "Marcar horário…"), `src/components/tarefas/TelaTarefas.tsx:241` (`duracao`). A trava do A9 (`postProgramado`) só entrou em "Mover pro dia seguinte" (`:239`) e no arraste do Calendário (`TelaCalendario.tsx:85`).
- **Defeito:** num card Aprovado com data do post, esses três caminhos gravam um início novo (ou um fim novo) sem tocar em `postar_em`. O Caderno passa a mostrar o card no horário novo; o post continua saindo no horário programado.
- **Cenário:** "Reels: dica rápida de IR" está Aprovado, programado para hoje às 18:00, e aparece na linha das 18:00 do Caderno do Natham. Ele arrasta a alça para a linha das 10:00 (ou usa ⋮ > Marcar horário… > 10:00). Às 10:00 o Caderno mostra o post como sendo agora, mas nada sai; ele sai às 18:00. É o mesmo problema do A9, só que dentro do dia.
- **Gravidade:** alta (o mesmo engano que o A9 queria fechar). **Confiança:** alta.

## 2. Migração das "feitas" antigas: tarefa recebida (enviada por outra pessoa) dá erro em toda abertura do Caderno, para sempre

- **Arquivo:linha:** `src/components/tarefas/grade.ts:48` a `:55` (`migrarFeitas` grava pelo `salvarTarefa`), `src/components/tarefas/TelaTarefas.tsx:67`.
- **Defeito:** o conserto do B6 manda cada tarefa da lista antiga para o `salvarTarefa`. Para uma tarefa ENVIADA à pessoa, quem recebeu não pode alterar (`podeAlterar` falso). Por isso o salvar recusa na hora com "Essa tarefa é só para olhar: você não pode mexer nela.", e a tarefa volta para a lista guardada. A cada abertura do Caderno a migração roda de novo, recusa de novo e mostra o aviso de novo. O caminho certo para quem recebeu é o `marcarFeita` (031), que o próprio Caderno usa no clique (`TelaTarefas.tsx:308`).
- **Cenário:** antes do banco, o Matheus marcou no navegador como feita uma tarefa que o Natham mandou para ele. Agora, toda vez que o Matheus abre o Caderno, aparece a faixa vermelha "Essa tarefa é só para olhar", e a tarefa nunca fica feita.
- **Gravidade:** média. **Confiança:** alta no mecanismo. Não conferi se ainda existe alguma lista antiga com tarefa recebida.

## 3. Calendário de Postagens se fecha sozinho na virada da semana (e some se a leitura falhar), levando junto a ficha aberta

- **Arquivo:linha:** `src/components/calendario/TelaCalendario.tsx:33` a `:39` (`Corpo`).
- **Defeito:** quem decide entre "Tarefas" e "Postagens" é a leitura da semana de HOJE (`periodoDe("semana", agora)`). Quando essa semana muda (sábado para domingo, à meia-noite), a leitura nova começa com `itens` vazio (undefined), `tem` vira falso e a tela troca para o Calendário de Tarefas. Isso desmonta o componente `Postagens` e fecha a `FichaPostagem` que estiver aberta. O mesmo acontece se a primeira leitura dessa semana der erro (que não seja "função ausente"): o botão "Tarefas | Postagens" nem aparece, sem aviso nenhum.
- **Cenário:** sábado às 23:59 o Natham está preenchendo uma postagem nova (empresa, redes, dias da semana). À meia-noite a ficha some e o que ele preencheu se perde; a tela volta para Tarefas.
- **Gravidade:** baixa. **Confiança:** alta.

## 4. "Feito" dos compromissos do Google: dois cliques rápidos podem deixar o banco ao contrário da tela; a falha é calada

- **Arquivo:linha:** `src/lib/dados/agenda-feitos.ts:134` a `:141`.
- **Defeito:** cada clique dispara o seu pedido (insert ou delete) sem esperar o anterior. A ordem de chegada ao banco não é garantida, e se o delete chegar antes do insert, o banco fica "feito" e a tela "não feito". Se o banco recusar (fora o 23505), a tela volta ao que o banco tem, sem nenhum aviso.
- **Cenário:** o Natham marca e desmarca rápido um compromisso no Caderno (clicou errado). O delete chega primeiro, o insert depois: ao recarregar (ou no próximo aviso do sino), o compromisso aparece riscado de novo.
- **Gravidade:** baixa. **Confiança:** média (depende da ordem da rede).

## 5. B13 incompleto: o Mapa também abre a ficha sem "só olhar" e com todos os tipos

- **Arquivo:linha:** `src/components/mapa/TelaMapa.tsx:99`.
- **Defeito:** o B13 foi consertado só nas Pastas. A ficha aberta pelo Mapa (linha do tempo, Fila e faixa "Sem data") continua sem `soLer` e sem `tipos`.
- **Cenário:** quem recebeu um card de conteúdo enviado por outra pessoa abre pelo Mapa, edita, e só no Salvar recebe "Essa tarefa é só para olhar". O menu Tipo também oferece Reunião, Ideia e Outro para um card da Esteira.
- **Gravidade:** baixa. **Confiança:** alta.

## 6. B12 incompleto: o "hoje" do Mapa não vira à meia-noite

- **Arquivo:linha:** `src/components/mapa/TelaMapa.tsx:36` a `:39` (`useSyncExternalStore(semAviso, hoje)`).
- **Defeito:** o mesmo defeito do B12, consertado só na Esteira. O Mapa calcula o dia uma vez; com a aba aberta de um dia para o outro, o começo da linha, o "Hoje" da Fila e o que conta como atrasado ficam no dia anterior.
- **Cenário:** a Fila aberta desde a noite do dia 28 mostra, na manhã do dia 29, o post do dia 28 que não saiu como "Hoje" em vez de "Atrasado 1 dia".
- **Gravidade:** baixa. **Confiança:** alta.

## 7. Cópia pelo ⋮ do Caderno leva a ida ao Google do original

- **Arquivo:linha:** `src/components/tarefas/grade.ts:43` (`copiaDoCaderno`: `{ ...t, id: undefined, ... }` mantém `vaiProGoogle`).
- **Defeito:** a regra escrita no tipo (`tipos.ts`, campo `vaiProGoogle`) diz que só o Calendário liga a ida ao Google, ao CRIAR a tarefa, e que tarefa do Caderno nunca vai. A cópia herda `vaiProGoogle: true` do original e, no insert, o banco a manda para a agenda do Google do responsável.
- **Cenário:** o Natham criou no Calendário "Dentista 10:00" (vai para o Google). No Caderno, usa ⋮ > Duplicar pro dia seguinte: aparece um segundo evento no Google Agenda dele no dia seguinte. Com "Criar tarefa para… Matheus", o evento vai para a agenda do Matheus.
- **Gravidade:** baixa. **Confiança:** média (pode ser desejado; a regra escrita diz que não).

---

**Total: 7 achados, 1 alto** (1), 1 médio (2) e 5 baixos (3 a 7).

## O que não cobri

- A animação de virar a folha (`virar.ts`) e a medição das páginas da Folha, a não ser no que muda dados.
- `src/components/ui/CampoData.tsx` e `Selecao.tsx`, só por cima (procurei fuso e datas, nada achado).
- `Grade.tsx`, `Mes.tsx` e `Ano.tsx` do Calendário: só os caminhos de soltar e criar.
- `datas.ts` (feriados e prazos): a regra de antecipar o prazo para o dia útil anterior é decisão registrada do Natham; não conferi cada data com a legislação.
- As funções do banco que a pauta usa (`postagens_calendario`, `salvar_planejada`, `apagar_planejada`, `riscar_postagens`) e os SQL 034+ não aplicados: li só o que a tela chama.
- Nada foi reproduzido rodando o app; os cenários vêm da leitura do código.
