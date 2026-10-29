# Pente fino Tarefas, rodada 2: consertos do Ferreiro

29/10/2026. Itens: L1 a L7 (`r2-lince.md`). Banco de produção não tocado; nenhum SQL novo. Sem commit, nada publicado. Cada item conferido no código antes do conserto.

| Item | Situação | Arquivos | Teste |
|---|---|---|---|
| L1 | consertado | `src/components/tarefas/TelaTarefas.tsx` (`moverPara`, usado pelo arraste da alça, pelas setas e por "Marcar horário…", e a ação `duracao`), `src/components/calendario/logica.ts` (texto do aviso) | `grade.test.ts`: "L1: no Caderno, marcar horário, arrastar a linha e duração também respeitam o card programado" |
| L2 | consertado | `src/components/tarefas/grade.ts` (`migrarFeitas`), `TelaTarefas.tsx`, `src/lib/dados/marcar-feita.ts` (devolve se o banco confirmou) | `grade.test.ts`: "L2: tarefa RECEBIDA (só leitura) marca pelo marcarFeita..." (e os 2 do B6, ajustados à assinatura nova) |
| L3 | consertado | `src/components/calendario/postagens/logica.ts` (`temPostagens`), `src/components/calendario/TelaCalendario.tsx` | `postagens/logica.test.ts`: "L3: o botão Tarefas, Postagens não some na virada da semana" |
| L4 | consertado | `src/lib/dados/agenda-feitos.ts` | `agenda-feitos.test.ts` (novo): ordem dos pedidos; recusa avisa |
| L5 | consertado | `src/components/mapa/TelaMapa.tsx` | sem teste (duas props passadas à ficha); prova de tela |
| L6 | consertado | `src/components/mapa/logica.ts` (`aCadaMinuto`), `TelaMapa.tsx` | `mapa/logica.test.ts`: "L6: o hoje do Mapa vira à meia-noite" |
| L7 | consertado | `src/components/tarefas/grade.ts` (`copiaDoCaderno`) | `grade.test.ts`: "L7: a cópia pelo ⋮ não leva a ida ao Google do original" |

Os testes novos falharam com o código antigo (voltando os arquivos alterados para o último commit com `git stash`) e passam com o conserto.

## O que muda, por item

- **L1.** No Caderno, "Marcar horário…", arrastar a linha (mouse ou setas) e "Duração" também param num card Aprovado com data do post. Aparece o mesmo aviso, agora com o texto "Este card está programado para postar em 29/10 às 18:00. Para mudar o dia ou o horário, mude a data do post na ficha."
- **L2.** A migração das "feitas" antigas do navegador marca a tarefa RECEBIDA pelo `marcarFeita` (o mesmo do clique no Caderno), e a sua própria pelo salvar. Tarefa que a pessoa não pode marcar sai da lista sem tentar, então o aviso não volta a cada abertura. `marcarFeita` agora devolve verdadeiro ou falso; o clique do Caderno continua igual.
- **L3.** Depois de o calendário de postagens aparecer uma vez, a semana nova carregando (virada de sábado para domingo) não esconde a tela nem fecha a ficha aberta. Só esconde se o banco disser que a função não existe. Ficou de fora: se a PRIMEIRA leitura da semana falhar (sem ser "função ausente"), o botão "Tarefas | Postagens" ainda não aparece até a próxima leitura (voltar à aba ou aviso do banco). A tela não guarda o erro dessa leitura; mexer nisso pede mudar `postagens-planejadas.ts`, maior que o achado.
- **L4.** Marcar e desmarcar um compromisso chegam ao banco um de cada vez, na ordem dos cliques. Recusa do banco mostra "Não consegui guardar o feito do compromisso. Tente de novo." e a tela volta ao que o banco tem.
- **L5.** A ficha aberta pelo Mapa (linha do tempo, Fila, faixa "Sem data") abre em "só olhar" quando a pessoa não pode editar, e o menu Tipo mostra só Roteiro, Gravação, Edição e Postagem, como nas Pastas e no Calendário de Postagens.
- **L6.** O "hoje" do Mapa confere o dia a cada minuto (a mesma solução do B12 na Esteira): com a aba aberta de um dia para o outro, a linha, a Fila e o atraso viram o dia.
- **L7.** A cópia pelo ⋮ do Caderno ("Duplicar" e "Criar tarefa para") nasce sem ida ao Google. A regra do tipo diz que só o Calendário liga isso, ao criar. Card de conteúdo já não levava (`duplicarCard` não copia o campo).

## Provas

- `provas/pente-fino-l1/`: Caderno, "Marcar horário… > 07:00" no card programado das 18:00, com o aviso, em 1903, 1440 e 390, com o `innerWidth` na imagem. Script: `provas/pente-fino-l1/fotos.mjs` (cópia de exemplo, banco falso). Saída: aviso exibido e o card continua na mesma linha (data-k 22 antes e depois), sem erro na página.
- `provas/pente-fino-l5/`: ficha aberta pela Fila do Mapa com o menu Tipo aberto: só Roteiro, Gravação, Edição e Postagem, nas três larguras.
- L2, L3, L4, L6 e L7 não mudam o desenho da tela: ficam provados pelos testes. A virada da semana (L3) e a meia-noite (L6) não foram fotografadas.

## Verificação

- `npm run check` verde: lint com 0 erros (19 avisos, nenhum nos meus arquivos), tipos, regras, 57 arquivos e 473 testes, build.
- Durante o trabalho, um teste falhou por erro de sintaxe em `src/lib/dados/repositorio.ts` (o Lince editando na hora); na rodada seguinte já estava certo. Não mexi nesse arquivo.
