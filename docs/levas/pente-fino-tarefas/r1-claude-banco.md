# Pente fino Tarefas, rodada 1: banco e servidor (Claude)

Data: 29/10/2026. Só leitura: arquivos `supabase/0*.sql`, `supabase/_colar/` (só para achar a linha), `supabase/functions/` e consultas SELECT no projeto `uruhjlurcxpjhhgvuzwt` (definições das funções, gatilhos, `cron.job`, contagens). Nada foi escrito no banco.

Contexto que muda a leitura dos achados:
- Em produção, Natham, Matheus e Adrian têm login, e os três estão fixos em `private.pode_aprovar` (o 026 está aplicado, apesar de o 030 dizer que não). Lucas não tem login. Ou seja: hoje TODO login aprova qualquer card; as travas por "aprovador do card" não separam ninguém.
- Produção tem funções que não estão em `supabase/0*.sql` (pauta: `salvar_planejada`, `apagar_planejada`, `sincronizar_planejada`, `gerar_tarefas_postagens`, `riscar_postagens`, `contar_cards_da_tag`). Vieram de `supabase/_colar/`.

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

---

## 1. "Tentar de novo" nunca destrava uma rede que estourou as rodadas

`supabase/027_matheus_aprova_conserto_legendado.sql:193` (tentar_de_novo) com `:269` e `:283` (alarme_tocou) e `supabase/functions/postar-meta/estado.ts:193`

- Defeito: `tentar_de_novo` volta a linha de `erro` para `fila`, mas não zera `rodadas`. Em seguida chama `alarme_tocou`, que calcula `v_rodadas` sobre as linhas que não estão em postado/erro, ou seja, a própria linha em `fila` com `rodadas` velho. Se `rodadas > 5`, cai no teto e grava `erro` de novo ("a funcao de postagem nao respondeu depois de varias tentativas") antes de a função ser chamada. A catraca (`pegar_postagens`) até zeraria `rodadas` ao pegar uma linha `fila`, mas nunca chega a rodar.
- Cenário: Reels cujo vídeo a Meta demora para processar. A cada volta a linha fica `processando`, a função rearma 5 min e `pegar_postagens` soma 1 em `rodadas`. Na 6ª volta a função grava `erro` "Estado incerto" com `rodadas = 6`. O Natham confere a rede, vê que não saiu e clica "Tentar de novo": a faixa vermelha volta na hora, com outra mensagem. Tirar o card de Aprovado e aprovar de novo também não resolve: o 033 só apaga linhas `fila`, a linha `erro` fica, e `alarme_tocou` vê "todas as redes terminaram" e não faz nada. O card só sai postando à mão.
- Gravidade: alta (estado que trava, sem saída pela tela). Confiança: alta (lido no código; não reproduzido no banco).

## 2. Card de Postagem de outra empresa (Tu Ecom, Beec) aprovado com data nunca vai para Postado e ganha erro falso

`supabase/027_matheus_aprova_conserto_legendado.sql:314` e `:322` (`empresa_id = 'you'`), `:283-292` (teto), `supabase/032_trava_volta_postado_e_liga.sql:281-283` (tira o relógio de todo minuto)

- Defeito: a catraca só pega card da You. Antes do 032, o relógio de todo minuto (`postar_vencidos`) passava QUALQUER card Aprovado vencido para Postado. O 032 desligou esse relógio. O alarme do card continua sendo armado para qualquer empresa (`tarefas_alarmes` não olha a empresa); ele chama a função, que não pega nada e não desarma; o sentinela rearma a cada 12 min e, no 5º toque, `alarme_tocou` insere linhas `erro` em `postagens` com "a funcao de postagem nao respondeu depois de varias tentativas".
- Cenário: hoje há 2 cards Tu Ecom em Aprovado (sem data ainda). O Natham programa um deles para 15:00. Às 15:00 nada acontece; por volta das 16:00 a ficha mostra faixa vermelha dizendo que a função caiu, e o card fica em Aprovado para sempre. A pauta (`postagens_calendario`) só conta card em Postado, então o dia aparece como "faltou".
- Gravidade: média (nada é perdido, mas o fluxo das outras empresas parou e a mensagem engana). Confiança: alta.

## 3. Pauta apaga e recria a tarefa que o responsável editou (perde notas e horário)

`supabase/_colar/2026-10-26-315-01-pauta.sql:193-201` (sincronizar_planejada, coluna `mudou`) e `:318` (apagar_planejada "todos"); conferido igual em produção

- Defeito: `sincronizar_planejada` compara dono, início, título e notas da tarefa gerada com o que a série "deveria" gerar. Qualquer diferença vira `mudou`, e a tarefa é APAGADA e recriada do zero. A diferença pode ter sido feita pelo próprio responsável, não pela série.
- Cenário: o Matheus abre a tarefa "Postar Reels: You" de quinta, escreve nas notas o roteiro e muda a hora de 10:00 para 14:00. Depois o Natham ajusta qualquer coisa da mesma série (até "só este dia" em outro dia, ou pula uma sexta): a sincronização roda na série inteira, vê que a quinta "mudou", apaga a tarefa do Matheus e cria outra às 10:00 com as notas padrão. As notas somem sem aviso. Só escapa tarefa concluída ou com anexo. `apagar_planejada` com escopo "todos" também apaga tarefas futuras editadas.
- Gravidade: média (perda de dado do usuário, silenciosa). Confiança: alta.

## 4. A trava "card de conteúdo só se apaga pela Esteira" (029) não está em produção

`supabase/029_card_so_pela_esteira.sql:203-229`, `src/lib/dados/apagar-card.ts:12-14`

- Defeito: em produção não existem `public.apagar_card` nem o gatilho `tarefas_so_esteira_apaga` (conferido em `pg_proc` e `pg_trigger`). O app detecta a falta da função (PGRST202) e cai no apagar direto de sempre.
- Cenário: exatamente o de 22/10 que o 029 queria fechar: card de conteúdo que aparece na aba "Sem data" do Caderno pode ser apagado ali como se fosse nota.
- Gravidade: média. Confiança: alta (estado do banco conferido).

## 5. Quando o 029 for aplicado: a trava se burla com o cabeçalho User-Agent

`supabase/029_card_so_pela_esteira.sql:222`

- Defeito: o gatilho deixa passar qualquer pedido cujo `User-Agent` comece com `Deno/`, para liberar a função drive. Esse cabeçalho é escolhido por quem chama.
- Cenário: alguém logado manda `DELETE /rest/v1/tarefas?id=eq.<card>` com `User-Agent: Deno/1` (curl, Postman) e apaga card de conteúdo fora da Esteira. As travas de QUEM pode apagar (RLS) continuam valendo; só a "porta única" cai.
- Gravidade: baixa. Confiança: alta.

## 6. Trocar Tipo ou Empresa de um card já Aprovado não desarma o alarme

`supabase/019_postagem_drive.sql:608` (gatilho `tarefas_alarmes` só em `update of etapa, postar_em`), `supabase/033_ficha_nao_trava_em_postando.sql:302`

- Defeito: Tipo e Empresa não estão na lista de colunas do gatilho nem na trava de "depois de Aprovado" do `tarefas_aprovacao`. Mudar um deles com o card em Aprovado deixa o alarme armado.
- Cenário: card Aprovado de Postagem da You, programado para amanhã; alguém troca o Tipo para "Edição" (ou a empresa para Tu Ecom). Amanhã o alarme toca, a catraca não pega nada e, uma hora depois, aparece a faixa vermelha "a funcao de postagem nao respondeu". No caminho inverso (trocar a empresa de Tu Ecom para You depois de aprovado), o card passa a sair no Instagram da You.
- Gravidade: baixa (hoje todo login é aprovador, então só aprovador consegue). Confiança: alta.

## 7. "Tentar de novo" perde a repetição automática de falha passageira

`supabase/027_matheus_aprova_conserto_legendado.sql:193`, `supabase/functions/postar-meta/estado.ts:210`

- Defeito: `tentativas` nunca é zerado; a função só repete sozinha se `tentativas < 2`.
- Cenário: o post falhou duas vezes por queda de conexão; o Natham clica "Tentar de novo"; uma nova queda passageira já vira `erro` direto e dispara o aviso de WhatsApp, sem a nova tentativa automática que um post novo teria.
- Gravidade: baixa. Confiança: alta.

## 8. Tema: qualquer login cria e renomeia (inclusive as pastas no Drive)

`supabase/functions/drive/acoes.ts:215-239`

- Defeito: `criar_ocasiao` e `renomear_ocasiao` só conferem se a pessoa enxerga a empresa ou o tema; não chamam `pode_mexer_pastas`. A regra do 236 (`019_postagem_drive.sql:193`) diz que só Natham e Matheus mexem nas pastas. Pasta livre confere (`pasta-livre.ts:46,66`); tema não.
- Cenário: o Adrian renomeia o tema "Black Friday" para outro nome; a função renomeia as pastas do Tema e de todos os conteúdos dele no Drive.
- Gravidade: baixa. Confiança: média (pode ser intencional; o comentário da linha 220 sugere que criar é livre).

## 9. Tipo do anexo vem do navegador e não é conferido com o arquivo real do Drive

`supabase/functions/drive/acoes.ts:175-200`

- Defeito: `confirmar_envio` grava o `tipo` informado pela tela. O `mimeType` que o Drive devolve em `d.api.ver` não é comparado.
- Cenário: um vídeo enviado como "documento" (tela antiga, ou pedido montado à mão) não aciona a regra do vídeo legendado (`arquivos_video_novo` só olha `tipo = 'video'`), e o post pode sair com o vídeo velho; ou uma imagem registrada como vídeo trava o card com "Reels precisa de 1 vídeo".
- Gravidade: baixa. Confiança: média.

## 10. Recuperar post do Instagram acha pela legenda e pode gravar o link de outro post

`supabase/functions/postar-meta/redes.ts:173-177`

- Defeito: quando a execução anterior publicou e caiu antes de gravar, o post é procurado entre os últimos itens da conta pela legenda igual.
- Cenário: dois posts com legenda vazia (ou repetida); a ficha mostra "Postado" com o link do post errado.
- Gravidade: baixa (nenhum post duplicado; só o link). Confiança: alta.

## 11. Desmarcar "feita" numa tarefa da pauta não dura

`private.riscar_postagens` (produção; relógio `postagens_riscar`, a cada 5 min)

- Defeito: o relógio marca `concluida = true` em toda tarefa gerada cujo dia já tem post em Postado, sem guardar que alguém desmarcou.
- Cenário: o Matheus desmarca porque o post do dia saiu errado e ele vai refazer; em até 5 min a tarefa volta a aparecer como feita.
- Gravidade: baixa. Confiança: média (pode ser o desejado).

## 12. `contar_cards_da_tag` conta tarefas privadas dos outros

`supabase/_colar/022-tags-trava.sql:30`

- Defeito: SECURITY DEFINER conta todas as linhas de `tarefa_tags`, inclusive de tarefa que quem chama não enxerga.
- Cenário: o Adrian descobre quantas tarefas pessoais do Natham usam uma tag. Só o número vaza.
- Gravidade: baixa. Confiança: alta.

---

## As 10 funções SECURITY DEFINER do alerta do Supabase

Todas conferidas na definição de produção. Nenhuma aceita chamada de quem não devia, além do item 12.

| Função | Confere quem chama? |
|---|---|
| apagar_planejada | Sim: `sou_natham()` |
| salvar_planejada | Sim: `sou_natham()` |
| contar_cards_da_tag | Só "tem pessoa"; vaza contagem (item 12) |
| liberar_video_pendente | Sim: `pode_aprovar` + `pode_alterar` |
| marcar_feita | Sim: dono ou `pode_alterar`; troca só `concluida` |
| marcar_video_pendente | Sim: `pode_mexer_anexos` |
| postagem_automatica_ligada | Não precisa: só lê o interruptor |
| postar_agora | Sim: `pode_aprovar` + `pode_alterar` |
| tarefas_no_google | Sim: filtra por `minha_pessoa()` |
| tentar_de_novo | Sim: `pode_aprovar` + `pode_alterar` (mas ver item 1) |

As funções de serviço (`pegar_postagens`, `ler_segredo_servico`, `guardar_google_token`, `armar_alarme_servico`, `desarmar_alarme_servico`, `iniciar_limpeza_tema`, `agenda_*`) estão fechadas para `anon` e `authenticated` em produção. As três funções de gatilho em `private` com permissão para `anon` (`tarefas_alarmes`, `tarefas_apagar_com_drive`, `tarefas_redes_limpa`) não podem ser chamadas por RPC (retornam `trigger` e `private` não é exposto).

## Conferido e sem achado

- Post duplicado: a catraca é atômica (UPDATE com condição de status); Instagram confere o contêiner antes de publicar de novo; Facebook marca `fotos:` e `video-pub:` antes de publicar e vira "estado incerto" em vez de repostar.
- Link assinado do vídeo: HMAC com validade (10 min na drive, 2 h na postar-meta), prefixos diferentes, comparação em tempo constante.
- Segredo em log: `traduzir` tira chave e endereços; a drive loga só a mensagem curta.
- Fuso: `postar_em` em texto de Brasília comparado com `now() at time zone 'America/Sao_Paulo'`; alarme convertido para UTC certo.
- OAuth do Google: `state` assinado, só o Natham inicia, validade de 10 min.

## O que não cobri

- Agenda (008 a 014: `agenda_receber`, fila de saída para o Google, n8n): só olhei permissões, não a lógica.
- `drive-api.ts`, `_shared/pastas.ts` e os testes (`*.test.ts`, `mundo-falso.ts`) não foram lidos linha a linha.
- Políticas de Storage em produção: li só os arquivos (004, 007, 016, 019), não conferi o estado real.
- O link assinado do vídeo vai na URL; não conferi se os logs de acesso das funções no Supabase guardam a URL inteira (com `sig`).
- Nada foi reproduzido rodando no banco (regra da rodada): os cenários dos itens 1, 2, 3 e 6 são leitura de código.
