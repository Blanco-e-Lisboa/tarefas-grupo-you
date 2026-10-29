# Pente fino Tarefas, rodada 1: consertos de banco e servidor (Bussola)

29/10/2026. Nada aplicado no banco de produção, nada publicado, nenhum commit. Produção só foi LIDA (definições de funções, gatilhos, cron, contagens).

## Como foi provado

- **SQL**: numa cópia local do banco feita com PGlite (Postgres que roda dentro do Node, numa pasta temporária fora do projeto), com os stubs de `supabase/prova_local/stubs.sql` e as migrações na ordem de produção. Antes de usar, conferi que a cópia bate com a produção: a impressão digital (md5) do código de TODAS as funções de postagem, pauta, tags e travas é igual à de produção (só as da agenda diferem, fora do escopo). Cada prova roda duas vezes: sem o SQL novo (tem de FALHAR) e com ele (tem de passar). Os SQL novos foram colados duas vezes seguidas sem erro (idempotentes) e também junto com o `040` do Lince.
- **Edge Functions**: testes no Vitest com Meta, Drive e banco falsos. Cada teste novo foi rodado contra o código antigo (cópia do `HEAD` numa pasta temporária, apagada depois) e falhou; com o código novo passa.
- `npm run check`: passando (lint sem erro, tipos, regras, 436 testes, build). Os 19 avisos do lint são de arquivos de outros (provas antigas, `TelaFazendoAgora.tsx`, `PrintsIdeia.tsx`).

## Por item

| Item | Situação | Arquivos | Teste |
|---|---|---|---|
| A4 Tentar de novo não destrava | Consertado | `supabase/034_*.sql` (`tentar_de_novo` zera `rodadas` e `tentativas`) | `supabase/prova_034.sql` A4 |
| A5 Post sai depois de cancelado | Consertado | `postar-meta/banco.ts` (`aindaVale`, `apagarLinha`), `redes.ts` (confere antes de cada publicar: Instagram, Reels/Story do Facebook, foto/feed do Facebook), `estado.ts` (cancelado = linha sai, sem aviso; também ao terminar em "processando"), `meta.ts` (`ErroCancelado`) | `postar.test.ts` "A5" |
| A6 Limpeza apaga depois de voltar para Edição | Consertado | `drive/acoes.ts` (`esvaziar` confere a etapa antes de cada arquivo; para e responde `parou`) | `drive.test.ts` "A6" |
| A7 Vídeo esperando na fila não bloqueia | Consertado | `src/lib/dados/envios.ts` (a marca "vídeo pendente" é pedida ao ENFILEIRAR; combinado com o Lince, edição pontual) | `src/lib/dados/envios.test.ts` |
| A8 Carrossel perde vídeos | Consertado | `034` (`arquivos_video_novo`: só Reels/Story trocam o vídeo velho por "original"; a marca de vídeo pendente sai em qualquer formato) | `prova_034.sql` A8 |
| M1 Outras empresas | Consertado (parte do banco) | `034` (gatilho `tarefas_so_you_programa`: recusa com 22023 gravar ou MUDAR a data de card Aprovado fora da You, ou trocar de empresa um card com data; salvar sem mexer na data passa). Texto combinado com o Lince: "Postagem automatica so para a You: card de outra empresa vai para Postado a mao." Em produção hoje nenhum card Tu Ecom/Beec em Aprovado tem data. | `prova_034.sql` M1 |
| M2 Pauta apaga tarefa editada | Consertado | `supabase/035_*.sql` (marca de "como a pauta gerou"; sincronizar e "Apagar todos" pulam a tarefa que alguém editou; tarefas já existentes ganham a marca do que a pauta geraria hoje) | `supabase/prova_035.sql` M2 + prova do preenchimento das antigas |
| M4 Tipo/Empresa não desarmam | Consertado | `034` (`tarefas_alarmes` olha tipo e empresa; só Postagem da You arma; empresa nova larga o Tema da antiga) | `prova_034.sql` M4 |
| M12 Rede acrescentada nunca sai | Consertado | `034` (`alarme_tocou` só encerra quando toda rede do card tem linha) | `prova_034.sql` M12 |
| M13 "Postando" preso | Consertado | `034` (card que perde a data ou sai de Aprovado: "enviando"/"processando" viram erro "estado incerto"; a ficha volta a mostrar botões) | `prova_034.sql` M13 |
| M16 Link do vídeo fura 4 MB | Consertado | `drive/comum.ts` (`limitarRange`: "últimos N bytes" com teto; formato estranho = primeiro pedaço). Movido de `acoes.ts` para `comum.ts` para caber no limite de 350 linhas; `acoes.ts` reexporta. | `drive.test.ts` "289" |
| M19 Link de outro post | Consertado | `postar-meta/redes.ts` (`recuperarIg` só usa o link se UM post tem a legenda; senão grava postado sem link) | `postar.test.ts` "M19" |
| M20 Vídeo acima de 25 Mbps | Consertado | `_shared/google.ts` (`duracaoVideo`, do `videoMediaMetadata.durationMillis`), `postar-meta/redes.ts` (`enviarVideo` barra com ErroLocal: "O vídeo X tem 28,7 Mbps e a Meta aceita até 25. Exporte de novo..."), `index.ts`, `_shared/google-falso.ts` | `postar.test.ts` "M20" (barra e deixa passar) |
| B2 Tema só Natham e Matheus | Consertado | `drive/acoes.ts` (`criar_ocasiao` e `renomear_ocasiao` perguntam `pode_mexer_pastas`; 403 "Só o Natham ou o Matheus criam e renomeiam temas."). Trava no banco: não precisa, o app não escreve em `ocasioes` (só a função, com chave de serviço). Lince avisado para a tela. | `pastas229.test.ts` "B2" (o teste antigo "Adrian cria tema comum" foi trocado pela decisão nova) |
| B3 Tipo do anexo | Consertado | `drive/acoes.ts` + `drive/comum.ts` (`tipoDoMime`): `confirmar_envio` recusa (422) e manda para a lixeira o arquivo cujo tipo não bate com o que o Drive recebeu | `drive.test.ts` "B3" |
| B4 Desmarcar "feita" | Consertado | `035` (`desmarcada` na tarefa gerada; gatilho anota quem marca/desmarca com login; `riscar_postagens` pula a desmarcada) | `prova_035.sql` B4 |
| B5 contar_cards_da_tag | Consertado | `supabase/036_*.sql` (só Natham e Matheus, os que editam tag; para os outros a tela já cai na contagem do que vê) | prova à parte na cópia local: Adrian recebe 42501, Natham conta |
| M3, B1 | Não feito | Decisão do Natham: deixar como está. | |

## Para aplicar (Natham decide)

1. SQL, nesta ordem, no SQL Editor: `034`, `035`, `036`. Cada um é uma transação só e pode ser colado de novo sem estrago. O `040` do Lince não conflita com eles (provado junto).
2. Edge Functions alteradas (publicar depois do ok): `postar-meta` (A5, M19, M20) e `drive` (A6, M16, B2, B3). Elas funcionam antes e depois dos SQL.

## Observações

- A5 e M13 se completam: o banco marca "estado incerto" na hora em que o card sai de Aprovado; se a função ainda estava trabalhando, ela confere antes de publicar, não publica e apaga a linha.
- M20 vale para Instagram e Facebook (o mesmo vídeo vai para os dois). Se o Drive ainda não mediu a duração, não barra (melhor tentar do que travar um vídeo bom).
- A hora de Brasília na `postar-meta` usa UTC-3 fixo (sem horário de verão desde 2019), anotado no código.
- Um teste antigo da `drive` ("link adulterado, vencido...") falhou uma vez numa rodada com a máquina ocupada e passou em 3 rodadas seguidas: parece depender do relógio. Não é deste conserto.
- B3: arquivo que o navegador não reconhece vai como documento; se o Drive o reconhecer como vídeo, agora é recusado. É o comportamento pedido (o vídeo não pode entrar como documento).

## Correções após o Codex (29/10)

Fonte: `r1-conferencia-codex.md`. Cada item foi confirmado no código antes de mexer. Mesmas provas de antes: cópia local do banco (sem e com o SQL, colado 2 vezes, junto com o `040`) e Vitest com o código antigo (falha) e o novo (passa). `npm run check` verde: 453 testes, build ok, lint 0 erros (19 avisos de arquivos de outros).

| Item | Situação | O que mudou | Teste |
|---|---|---|---|
| Bug novo 1 / A5 (registro apagado depois de pedir à Meta) | Confirmado e consertado | O rascunho ganhou marca de "já pedido": `pub:` no Instagram (gravado ANTES do `media_publish`), além de `video-pub:` e `fotos:` no Facebook. Cancelar só apaga a linha se nada foi pedido; se foi, vira erro "estado incerto" e guarda o rascunho para a retomada conferir na Meta. O cancelamento pelo `ErroCancelado` acontece sempre antes de pedir nesta rodada; vale o que já estava pedido quando a linha foi pega. Recusa clara da Meta no publicar volta o rascunho para sem marca. | `postar.test.ts` "bug 1" (vídeo do Facebook já pedido e card tirado de Aprovado: a linha fica, erro "estado incerto", rascunho `video-pub:`) |
| Bug novo 5 (pendência de vídeo desliga a programação) | Confirmado e consertado nos dois lados | Função: cancelado NÃO desarma o alarme. Banco (`034`): a marca "vídeo novo pendente" saindo rearma o alarme do card programado (gatilho `tarefas_alarmes` passa a olhar `video_pendente_desde`). | `postar.test.ts` "bug 5"; `prova_034.sql` bug5 (alarme desarmado, marca sai, a função é chamada) |
| A6 (intervalo e pasta) | Consertado; intervalo mínimo documentado | `esvaziar` foi para `pastas-drive.ts` (abre espaço no `acoes.ts`) e reconfere a etapa antes de CADA arquivo e antes da pasta do conteúdo. Discordância parcial: entre a conferência e a ida para a lixeira sobra uma janela de milissegundos que só uma trava no Drive fecharia (ele não tem). O arquivo vai para a lixeira do Drive, que guarda 30 dias; anotado no código como shortcut. | `drive.test.ts` "A6 (pós-Codex)": card sai de Postado logo depois do último arquivo, a pasta não vai para a lixeira |
| M2 (só 4 campos) | Confirmado e consertado | Trocada a impressão digital por um carimbo `editada`: gatilho marca a tarefa gerada quando QUALQUER campo muda por alguém com login (só "feita", `updated_at` e `versao` não contam); tarefa com tag também conta. As tarefas que já existem são carimbadas na colagem comparando com tudo com que a pauta as cria. | `prova_035.sql` M2 (notas numa tarefa, só cor e duração em outra: as duas ficam; as outras 12 seguem a série); prova à parte das tarefas antigas |
| M13 (Tentar de novo sem data) | Confirmado e consertado | `tentar_de_novo` (`034`): card sem data recebe a data de agora (Tentar de novo = postar agora); antes a fila parava sem alarme e a ficha ficava em "Postando". | `prova_034.sql` M13b |
| M19 (legenda única ainda não identifica) | Concordo; consertado | `recuperarIg` não procura mais o post na lista: grava "postado" SEM link. Perde o link nesse caso raro (resposta perdida), mas nunca grava o de outro post. | `postar.test.ts` "M19 (pós-Codex)": a única legenda igual é de outro post |
| M20 (sem duração libera) | Consertado | A taxa é conferida ANTES de criar qualquer rascunho na Meta. Sem duração (o Drive ainda não mediu, ou não respondeu): não vai para a Meta. Vira espera (`ErroEspera`): volta para a fila e tenta de novo em 10 min; esgotadas as tentativas, erro com o motivo ("O Drive ainda não mediu o vídeo..."). Por quê: o Drive costuma medir em minutos, então esperar resolve o caso comum sem publicar no escuro; se nunca medir, o card para com o motivo e um humano decide. | `postar.test.ts` "M20 (pós-Codex)": sem rascunho nem envio à Meta, fila, e depois erro com o motivo |
| B3 (tipo declarado) | Concordo; consertado | `confirmar_envio` lê os 16 primeiros bytes do arquivo no Drive e reconhece foto (JPEG, PNG, GIF, WebP, HEIC/AVIF) e vídeo (MP4/MOV/3GP, WebM/MKV, AVI). Se os bytes dizem foto ou vídeo e o tipo declarado é outro, recusa (422) e manda para a lixeira. Formato que os bytes não reconhecem (PDF, planilha, formato raro) segue pelo tipo declarado: é o que permite documento. | `drive.test.ts` "B3 (pós-Codex)" (MP4 de verdade declarado como documento com tipo genérico) e "tipoDosBytes" |
| Bug novo 3 / M14 (troca da única capa) | Parte do servidor feita a pedido do Lince | `confirmar_envio` aceita `substitui_arquivo_id`: depois de TODAS as conferências da nova, a velha (mesmo card e mesmo papel, senão 409) vai para a lixeira e a linha sai, sem tocar na pasta. A tela é do Lince. | `drive.test.ts` "M14 (pós-Codex)" (troca sem pasta na lixeira) e "M14: ... outro card" (409) |

Arquivos desta rodada: `supabase/034_*.sql` e `supabase/035_*.sql` (ainda não aplicados, editados no lugar), `supabase/prova_034.sql`, `supabase/prova_035.sql`, `supabase/functions/postar-meta/{estado,redes,meta,mundo-falso,postar.test}.ts`, `supabase/functions/drive/{acoes,pastas-drive,comum,drive.test}.ts`.

Ordem para aplicar continua: `034`, `035`, `036` (e o `040` do Lince, que convive); depois publicar `postar-meta` e `drive`.
