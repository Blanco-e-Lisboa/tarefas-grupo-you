# Pente fino Tarefas, conferência final (Ferreiro, no lugar do Codex)

29/10/2026. Só leitura: nenhum código editado, nada escrito no banco. Em produção rodei apenas SELECT: funções (`pg_proc`), gatilhos (`pg_trigger`), relógios (`cron.job`) e colunas.
Base: `r4-codex.md`, as seções "Correção final" de `r4-consertos-bussola.md` e `r4-consertos-lince.md`, o código atual e os SQL 034 a 042.

**Veredito: pronto para aplicar: SIM.** 0 itens ainda falham e 0 bugs novos de gravidade alta. Há 1 achado médio fora do pedido (Parte 5) e 2 observações de ordem e economia.

## Parte 1: itens do r4-codex

| Item | Situação | Onde |
|---|---|---|
| Novo 3 (retomada nos primeiros 30 s) | ok | `src/lib/dados/envios.ts:99-101`: a retomada também reusa o id do envio "suspeito" do mesmo card. No servidor, a confirmação repetida tira o id da lista (`supabase/functions/drive/acoes.ts:91`, `039:54-61`). |
| Bug 1 (fechar o aviso liberava o vídeo antigo) | ok | `desistir_envio` não existe no 039 nem é chamado em `src`. `envios.ts:134-141` só esconde o aviso e guarda o id para o próximo envio. |
| Bug 2 (prazo de 3 h retomava o rascunho antigo) | ok | `039:181-194`: fila, enviando e processando viram erro, e a marca fica. `039:126-139`: as redes só voltam à fila quando a marca sai. `pegar_postagens` (vivo) não pega linha em erro. |
| Bug 3 (corte de 30 dias contra o Permanente desligado) | ok | `039:146-159`: `limpeza_armada_em` é gravada em todo prazo de 7 dias (`armar_alarme_servico` com 7 dias, pelo `rearmarLimpeza` em `pastas-drive.ts:92`). `039:197-198`: o corte conta desse prazo. |
| Bug 4 (falha da pauta travava a entrada em Postado) | ok | O 039 não cria mais gatilho de pauta. O vivo `tarefas_risca_pauta` trata a falha como aviso (`exception when others ... raise warning`). |
| Gatilho duplicado | ok | Só sobra o `tarefas_risca_pauta` vivo (AFTER UPDATE OF etapa, ao entrar em Postado). |
| `riscar_postagens` por relógio | ok | `039:120-122` tira o job `postagens_riscar` (hoje vivo, `*/5`). `postagens_gerar` (vivo) chama só `gerar_tarefas_postagens()`. A pauta é riscada por aviso: o gatilho do 315 e o `035:80` na sincronização. |
| Despertador da agenda do 012 | ok | `042`: o vivo `agenda_saida_despertador */5` sai. Pedido novo arma um despertador único de 6 min. Ele só se rearma enquanto houver pedido pendente de menos de 1 dia. Com a fila vazia, não roda nada. |
| Consulta à Meta com teto | ok | Dentro da execução: `redes.ts:8` (15 s) até o prazo da execução (`estado.ts:106`). Entre execuções: `estado.ts:212` (5 min). O teto é `RODADAS_MAX` (`estado.ts:151`), que vira erro "estado incerto". Sem aviso da Meta, não há como ser só por aviso. |

## Parte 2: regra de ouro (vídeo antigo só sai com "Postar com o vídeo atual")

Ela vale em todos os caminhos que conferi. O que tira a marca "vídeo novo pendente":
- **O vídeo novo chegou:** `video_chegou` / `registrar_video`, `039:54-80`, e `arquivos_video_novo` com a lista vazia, `038:72-88`.
- **O clique:** `liberar_video_pendente`, `038:91-106`, que exige quem aprova.
- **O card saiu de Aprovado:** `tarefas_aprovacao`, vivo. Ao voltar para Aprovado com a lista cheia, a marca liga de novo (`038:110-120`).

| Caminho | Resultado |
|---|---|
| Fechar o aviso ("Tirar da lista" ou "Fechar painel") | Não chama o banco. A marca fica. |
| Prazo de 3 h | Vira erro e a marca fica. "Tentar de novo" e "Postar agora" recusam com a marca (`037:24`, `041:23`). |
| Limpeza dos 7 dias | Só roda em Postado. Não toca na marca nem em postagens. |
| Retomada do envio | Reusa o id e a marca só sai quando o vídeo chega. Se o rascunho na Meta é de antes do vídeo novo, a assinatura (legenda + mídias + capa) muda e ele é descartado (`estado.ts:145`). Exceção: publicação já pedida à Meta, que não tem volta. |
| Função no meio da postagem | `aindaVale` recusa com a marca (`banco.ts:51`). `pegar_postagens` (vivo) não pega card com marca. |
| Transição (SQL novo com funções ou tela antigas) | Seguro, mas pode travar. Tela antiga: marca sem id, e a função drive antiga a tira ao registrar o vídeo. Tela nova com função drive ainda antiga: a marca não sai e vira erro em 3 h. Não posta errado, mas trava. |

## Parte 3: 034 a 042 sobre as definições vivas

Hoje produção está no 033: nenhum objeto do 034 em diante existe. Não existem as colunas `videos_pendentes`, `limpando_desde` em tarefas, `limpeza_armada_em` e `versao`. Não existem as funções `registrar_video`, `video_chegou` e `concluir_postagem`, nem o gatilho `tarefas_y_ja_postado`.

Comparei cada `create or replace` e `drop` com a versão viva:
- `tarefas_alarmes` vivo é o do 033 (gatilho só em etapa e postar_em). O 034 o recria com tipo, empresa e marca.
- `alarme_tocou(text, uuid, int)` vivo é o do 027 com o rearme de 1 min. O 034, o 037 e o 039 o substituem nessa ordem, com a mesma assinatura. A versão de 2 argumentos (vivo) continua e só repassa.
- Funções que o SQL apaga e recria: `marcar_video_pendente(uuid)` vira `(uuid, text default null)`; `salvar_tarefa(jsonb, text[])` vira `(…, bigint default null)` e devolve bigint; `postar_agora` passa de void para jsonb; `iniciar_limpeza_card` e `terminar_limpeza_card` ganham nova assinatura. A tela antiga continua chamando todas sem erro, porque os argumentos novos têm valor padrão e a resposta extra é ignorada.
- Assinaturas e colunas que o SQL usa batem com o vivo: `riscar_postagens(text, date, date)`, `sincronizar_planejada(uuid)`, `apagar_planejada(uuid, text, date)`, `contar_cards_da_tag(text)`, as colunas de arquivos inseridas pelo `registrar_video` e as colunas de tarefas usadas no 035 e no 040. O segredo `tarefas_funcoes_segredo` é o mesmo.
- Ordem dos gatilhos BEFORE em tarefas (alfabética), igual à que os comentários pressupõem: `tarefas_antes`, `tarefas_aprovacao`, `tarefas_espera_limpeza`, `tarefas_pendentes_ao_aprovar`, `tarefas_so_you_programa`, `tarefas_volta_postado`, `tarefas_y_ja_postado`, `zz_tarefas_versao`. Os AFTER: `tarefas_abandono_volta` roda antes de `tarefas_alarmes`.

Não encontrei nada que quebre. Ressalva: não rodei a sequência num banco nesta conferência. Vale a prova local do Bussola (`prova_039`, `prova_042`).

**Ordem:** 034, 035, 036, 037, 038, 039, 040, 041, 042. Logo em seguida, publicar `drive` e `postar-meta`, e depois a tela. Isso evita a janela da transição da Parte 2, em que a marca trava até virar erro.

## Parte 4: economia de execuções

Respeitada.
- Somem os dois relógios de 5 min (`postagens_riscar` e `agenda_saida_despertador`).
- A limpeza desiste em 30 dias.
- O vídeo pendente deixa de tocar a cada minuto: fica um alarme só, para as 3 h.
- Na tela, os `setInterval` são relógios locais (minuto, meia-noite, sinal de vida do envio) e não consultam o banco. `pendentes.ts` relê só ao abrir, ao voltar à aba e quando um envio muda.

Sobra de baixa importância: "Postar com o vídeo atual" com a hora já passada chama a postar-meta duas vezes. Uma chamada vem do gatilho do 034, que rearma ao sair da marca e toca na hora; a outra é a chamada explícita em `038:103-105`. A catraca impede post dobrado, mas é 1 execução a mais por clique.

## Parte 5: bugs novos de gravidade alta

Nenhum.

Fora do pedido, de gravidade **média**: **a retomada pelo "suspeito" pode juntar dois vídeos diferentes no mesmo id** (`src/lib/dados/envios.ts:99-101`).
- **O caso:** o suspeito também pode ser um envio vivo de uma aba duplicada (é esse o motivo do N6). Matheus duplica a aba enquanto o vídeo A sobe. Nos 30 s seguintes, escolhe na cópia o vídeo B do mesmo card, e B reusa o id de A.
- **O efeito:** quando A chega, o id sai da lista, a marca sai e o post vencido sai com A, com B ainda subindo. Antes do conserto, os dois ids ficavam na lista e o post esperava os dois.
- **Avaliação:** não publica o vídeo antigo do card, mas publica um que não era o último escolhido. Pede aba duplicada, 30 s e post já vencido.
- **Sugestão:** reusar o suspeito só se o sinal de vida dele parou desde que esta aba carregou. Outra saída é não reusar quando ele ainda dá sinal.

## O que não cobri
- Não rodei `npm run check` nem as provas SQL: o Bussola e o Lince relataram tudo verde (61 arquivos, 507 testes).
- Não testei contra a Meta nem contra o Drive.
- Ferreiro 5 (senha atual) segue como decisão do Natham ("Require current password" no Auth do Supabase). Não fazia parte da lista desta conferência.
