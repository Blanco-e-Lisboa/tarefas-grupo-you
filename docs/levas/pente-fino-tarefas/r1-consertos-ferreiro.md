# Pente fino Tarefas, rodada 1: consertos do Ferreiro

29/10/2026. Itens: A2, A9, M5, M6, M15, M17, B6, B8, B9, B10, B11. Banco de produção só lido (SELECT); nenhum SQL novo (o 042 não foi usado). Sem commit.

| Item | Situação | Arquivos | Teste |
|---|---|---|---|
| A2 | consertado | `src/components/tarefas/grade.ts` (`copiaDoCaderno`), `src/components/tarefas/TelaTarefas.tsx` (Duplicar e Criar tarefa para) | `grade.test.ts`: "A2: cópia de card Aprovado..." e "A2/M17..." |
| A9 | consertado | `src/components/calendario/logica.ts` (`postProgramado`, `avisoProgramado`), `TelaTarefas.tsx` (Mover pro dia seguinte), `src/components/calendario/TelaCalendario.tsx` (arrastar), `src/lib/dados/index.ts` (exporta `avisarFalha`) | `logica.test.ts`: "A9: card programado não muda de dia por arraste" |
| M5 | consertado | `src/lib/dados/tempo-real.ts` | `tempo-real.test.ts`: "M5: religar logo depois de desligar usa um canal NOVO" |
| M6 | consertado | `src/lib/dados/anotacoes.ts` | `anotacoes.test.ts` (novo): ordem das gravações; falha avisa e tenta de novo |
| M15 | consertado | `src/lib/dados/agenda.ts`, `src/components/calendario/Compromisso.tsx`, `Filtros.tsx` | `agenda-corrida.test.ts` (novo): "M15: a agenda pessoal do Adrian não some" |
| M17 | consertado (junto com o A2) | `grade.ts`, `TelaTarefas.tsx` | `grade.test.ts`: "A2/M17: cópia de tarefa do Caderno fica no caderno do dono" |
| B6 | consertado | `TelaTarefas.tsx` (a migração espera o login carregar) | sem teste (efeito de tela de uma linha) |
| B8 | com o Lince | `src/lib/dados/repositorio.ts` é dele; ele confirmou que faz, com teste, e anota no resumo dele | (do Lince) |
| B9 | consertado | `grade.ts` (`duracaoQuerida`), `TelaTarefas.tsx` | `grade.test.ts`: "B9: tarefa que passa da meia-noite..." |
| B10 | não confirmado | nenhum | ver abaixo |
| B11 | consertado | `src/lib/dados/postagens-planejadas.ts`, `src/lib/dados/agenda.ts` | `postagens-planejadas.test.ts` "B11" e `agenda-corrida.test.ts` "B11" |

Todos os testes novos falharam antes do conserto e passam depois (no M6 e no M15 conferi tirando o conserto com `git stash`).

## O que mudou, por item

- **A2/M17.** "Duplicar" e "Criar tarefa para" passam por `copiaDoCaderno`. Card de conteúdo copia como na Esteira (`duplicarCard`): volta para Roteiro, sem data do post, legenda, anexos, aprovação e conserto, e com o título "X - Cópia N"; mantém o horário (a cópia anda +1 dia no Duplicar). Tarefa do Caderno nunca leva os anexos do original (tirar um da cópia apagava o dele) e fica no caderno do mesmo dono (`enviarPara: t.dono`): quem copia no Caderno de outra pessoa continua como "enviada por" quem copiou.
- **A9.** Card Aprovado com data do post não muda de dia por "Mover pro dia seguinte" nem por arraste no Calendário (Semana, Dia, Mês, Ano, Sem data). Aparece o aviso: "Este card está programado para postar em 29/10 às 18:00. Para mudar o dia, mude a data do post na ficha." Escolhi travar com o aviso, e não levar a data do post junto: arrastar para um dia que já passou faria o alarme postar na hora. "Marcar horário" no mesmo dia continua livre.
- **M5.** Cada ligação do tempo real ganha um nome de canal próprio. Com o mesmo nome, o cliente do Supabase devolvia o canal antigo que ainda estava saindo, e a tela nova ficava sem receber avisos.
- **M6.** As gravações de cada anotação saem uma de cada vez, na ordem. Se o banco recusar, a faixa de aviso diz "Não consegui guardar a anotação. Ela continua na tela e eu tento de novo sozinho; não feche a página ainda." e a gravação tenta de novo sozinha a cada 5 s.
- **M15.** `adrian_pessoal` entrou na lista de agendas ("Adrian (pessoal)", com a foto do Adrian). Não pus a agenda pessoal dentro da página "Agenda do dia" do Caderno do Adrian (o Caderno só usa a agenda do Natham); fica para decisão se quiserem.
- **B6.** A migração antiga das "feitas" só roda depois de os dados chegarem.
- **B9.** O arraste no Caderno mede a duração do início ao fim de verdade (22:00 até 01:00 = 3 h, depois cortada pelo que cabe na folha e pelo limite de 6 h).
- **B11.** Pauta (por período) e agenda guardam só a resposta da leitura mais nova.

## Não confirmado

- **B10** (arrastar tarefa de vários dias, dia inteiro, perde o fim): a ficha não tem mais "Termina" desde o item 308, o Calendário cria dia inteiro sem fim, e tarefa de dia inteiro com fim nem aparece em vários dias (`variosDias` exige hora). No banco de produção há 0 tarefas de dia inteiro com fim. Não há como chegar ao caso pela tela; não mexi.

## Provas

- `provas/pente-fino-a9/`: Caderno ("Mover pro dia seguinte") e Calendário (arrastar) com o aviso, em 1903, 1440 e 390, com o `innerWidth` na imagem. Script: `provas/pente-fino-a9/fotos.mjs` (cópia de exemplo, banco falso). Saída: aviso nos dois, card continua no dia 29, sem erro na página.
- `provas/pente-fino-a2/`: Caderno do dia seguinte depois de "Duplicar". No banco falso a cópia nasceu `etapa: roteiro`, `postar_em: null`, `legenda: null`, `inicio: 2026-10-30T18:00`; o script a apagou do banco falso no fim. Em 390 a cópia fica abaixo da dobra (18:00).
- M5, M6, M15, M17, B6, B9 e B11 não mudam o desenho da tela; ficam provados pelos testes. O banco falso não tem agenda do Google, então não há foto do filtro do M15.

## Verificação

- `npm run typecheck`, `npm run lint:rules`, `npm test` (47 arquivos, 418 testes) e `npm run build` passam.
- Depois do ajuste do Lince em `repositorio.ts` e `drive.ts`, `npm run check` passa inteiro: lint com 0 erros (19 avisos, nenhum nos meus arquivos), tipos, regras, 51 arquivos e 436 testes, build.

## Correções após o Codex

Fonte: `r1-conferencia-codex.md`. Meu item: B6 (marcado "incompleto").

| Item | Situação | Arquivos | Teste |
|---|---|---|---|
| B6 | consertado | `src/components/tarefas/grade.ts` (`migrarFeitas`), `src/components/tarefas/TelaTarefas.tsx` | `grade.test.ts`: "B6: migração das feitas antigas do navegador" (2 casos) |

- Confirmado: `salvarTarefa` devolve `null` quando o banco recusa, e o efeito apagava a chave `grade:tarefas-feitas` logo depois de mandar as gravações, sem esperar a resposta. Uma recusa perdia o visto para sempre.
- Conserto: a migração espera as gravações. Sai da lista só o que o banco confirmou, o que já estava feito e o id que não existe mais. O que foi recusado volta a ser guardado e é tentado na próxima abertura do Caderno. Tudo confirmado: a chave some.
- Os 2 testes novos falharam com o código antigo (`git stash` do `grade.ts`) e passam com o conserto. O teste antigo "abrir o Caderno não grava (item 275)" continua valendo: a migração segue sendo o único efeito da tela que grava.
- `npm run check` passa inteiro: lint com 0 erros (19 avisos, nenhum nos meus arquivos), tipos, regras, 51 arquivos e 438 testes, build.
- Sem captura nova: a mudança não altera o desenho da tela.
- Conferido de novo no fim: `npm run check` verde (52 arquivos, 446 testes; a contagem cresce porque outros terminais seguem trabalhando). Uma rodada no meio pegou um erro de tipos em `src/lib/dados/anexos.ts` (Lince, editando na hora); na rodada seguinte já tinha sumido.
