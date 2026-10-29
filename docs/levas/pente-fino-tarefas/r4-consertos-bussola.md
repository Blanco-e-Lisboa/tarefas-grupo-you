# Pente fino Tarefas, rodada 4: consertos de banco e servidor (Bussola)

29/10/2026. Base: `r3-codex.md`. Itens: A6, A7, N2, novo 1, novo 3 (lado do banco), F2 (decisão do Natham: opção b) e a auditoria de execuções (regra do Natham: acordar quando avisado, nada de perguntar em intervalo).
Nada aplicado no banco de produção (só leitura), nada publicado, nenhum commit. Nenhuma tela mexida por mim (a tela do F2 e da retomada é do Lince, contrato combinado por `maestri ask`).

Provas: SQL na cópia local do banco (mesmo código de produção), com 034 a 038, 039, 040 e 041 colados nessa ordem, e o 039 colado 2 vezes. Cada bloco da `prova_039.sql` rodou também SEM o 039 e falhou lá. Funções: Vitest com Meta, Drive e banco falsos; os 5 testes novos falharam antes do conserto e passam depois.
`npm run check` verde: lint 0 erros (19 avisos de arquivos de outros), tipos, regras, 61 arquivos e 505 testes, build.

| Item | Situação | O que mudou | Arquivos | Teste |
|---|---|---|---|---|
| A6 | Consertado | Só uma limpeza do card por vez: `iniciar_limpeza_card` recusa (devolve nulo) se outra está rodando. Cada limpeza recebe um crachá (a hora em que começou) e `terminar_limpeza_card` só solta a trava com o crachá dela: a primeira que termina não apaga a trava da outra. A função `drive` devolve 409 "O card não está em Postado ou já está sendo limpo." e não apaga nada. Com só o 038 colado, segue o sim/não da rodada 3. | `039`, `drive/acoes.ts` | `prova_039` A6; `drive.test.ts` "A6 (r4)" |
| A7 | Consertado | `registrar_video` registra o vídeo e tira o envio da lista na MESMA gravação. A marca "vídeo novo pendente" só sai quando a lista do card fica vazia, depois do registro. Duas confirmações ao mesmo tempo: a primeira não libera a postagem. | `039`, `drive/acoes.ts` | `prova_039` A7; `drive.test.ts` "A7 (r4)" |
| N2 | Consertado | Rascunho sem assinatura (gravado antes da rodada 3) não é mais reaproveitado: é descartado e refeito com o conteúdo de agora. Cuidado mantido: rascunho solto do Instagram passa antes pela Meta. Se já saiu (a gravação de "postado" se perdeu), recupera o link e não posta de novo. Sem isso, o teste antigo da Lupa mostrava post duplicado. Rascunho já pedido (`pub:`, `video-pub:`, `fotos:`) continua nunca se refazendo. | `postar-meta/estado.ts`, `redes.ts` | `postar.test.ts` "N2 (r4)" e o da Lupa (retomada) |
| Novo 1 | Consertado | Antes de mover para Postado, as redes escolhidas são relidas AGORA, numa gravação só (`concluir_postagem`). Rede acrescentada durante a publicação: o card fica em Aprovado e a função se arma para daqui a 1 minuto (alarme único), que posta a rede nova. Sem o 039: a função relê o card antes de mover. | `039`, `postar-meta/banco.ts`, `estado.ts` | `prova_039` Novo 1; `postar.test.ts` "novo 1 (r4)" |
| Novo 3 (banco) | Consertado | (1) Confirmar um vídeo já registrado (repetição ou retomada) também tira o envio da lista (`video_chegou`). (2) Retomada: a tela do Lince reaproveita o id do envio interrompido (o mesmo id chega na confirmação e sai da lista). (`desistir_envio` saiu na correção final.) Com só o 038 (sem `video_chegou`), a confirmação repetida não mexe na lista: por isso o 039 vai antes da publicação. (3) Envio abandonado não segura para sempre: na hora do post, se a marca tem menos de 3 h, fica UM alarme para quando ela fizer 3 h. Com 3 h, a postagem vira erro com o motivo (regra refeita na correção final, abaixo). Nada posta sozinho com o vídeo velho. | `039`, `drive/acoes.ts` | `prova_039` "Novo 3 repetida", "abandonado", "clique libera"; `drive.test.ts` "novo 3 (r4)" |
| F2 (b) | Consertado (banco; tela com o Lince) | Card cujas redes escolhidas JÁ têm post publicado não posta de novo. Programar a data, aprovar com data ou "Postar agora": recusado com 55000 "Este card já foi postado. Para postar de novo, duplique o card." Voltar de Postado para Aprovado continua livre (sem data). Card com rede que ainda não saiu (ex.: Instagram saiu, Facebook deu erro) continua programável. | `039` (gatilho `tarefas_y_ja_postado`) | `prova_039` F2 |

## Auditoria de execuções (034 a 041 e as funções)

Olhei os relógios vivos na produção (só leitura) e os SQL novos.

| Onde | Antes | Agora |
|---|---|---|
| `postagens_riscar` (pauta) | Relógio de 5 em 5 minutos, o dia todo, para riscar o "feita" | Sai. A pauta é riscada só por aviso: o card ENTRA em Postado (gatilho do 315) ou a pauta muda (035). Ver a correção final. |
| Alarme de vídeo pendente | Na produção de hoje (sem o 037), tocava a cada minuto. O 037 tirou isso | O 039 mantém sem repetição e acrescenta só UM alarme na hora certa (3 h da marca), para o envio abandonado não segurar para sempre |
| Limpeza dos 7 dias com o Drive fora | Tentava de novo todo dia, sem fim | Desiste 30 dias depois do último prazo de 7 dias armado (correção final) |
| `postar-meta` com vídeo processando | Volta de 5 em 5 minutos até a Meta terminar | Mantido: a Meta não avisa quando termina. Tem fim: no máximo 5 voltas, depois vira erro "estado incerto" |
| Sentinela do alarme (+12 min) | Rede de segurança se a função cair | Mantido: uso único, teto de 5 |
| `agenda_saida_despertador` | De 5 em 5 minutos | Trocado na correção final pelo `042`: aviso na hora e despertador único |
| Tela | | Do Lince (envios, tempo real) |

## Observações

- **Ordem para colar:** `034`, `035`, `036`, `037`, `038`, `039`, `040`, `041`. Depois publicar `postar-meta` e `drive`. As funções se viram sem o 039 (caminho da rodada 3), mas o certo é colar antes de publicar.
- **Duas provas antigas mudam de propósito com o 039:** o F8 da `prova_037` esperava nenhum alarme com vídeo pendente; agora existe um, único, para as 3 h. O A6 da `prova_038` passou a aceitar o crachá do 039 (continua passando com só o 038).
- **3 horas** é o prazo para o vídeo novo chegar depois da marca. Vídeo grande em internet lenta pode precisar de mais. Se acontecer, a postagem vira erro com o motivo e o "Tentar de novo" resolve. Dá para mudar o número no 039.
- O `acoes.ts` da `drive` ficou em 350 linhas, no limite do lint. A próxima mudança nele precisa tirar código de lá antes.

## Para aplicar (Natham decide)

Colar no SQL Editor, nessa ordem: `034`, `035`, `036`, `037`, `038`, `039` (e `040`, `041` do Lince). Depois publicar `postar-meta` e `drive`. Conferência no fim do 039 (só leitura).

## Correção final (conferência do Codex, `r4-codex.md`)

Regra de ouro dos vídeos: vídeo novo pendente só deixa sair o antigo com o clique "Postar com o vídeo atual". Nenhum aviso fechado, prazo ou limpeza libera sozinho.
Corrigi o próprio `039` (nunca aplicado) e criei o `042` (agenda). Nada aplicado, nada publicado, nenhum commit, nenhuma tela mexida por mim.
Provas: `prova_039.sql` (11 itens) e `prova_042.sql` (5 itens) na cópia local do banco, com 034 a 042 colados e o 039 e o 042 colados 2 vezes. Os bugs 1 e 4 foram provados contra as peças da 1ª versão do 039 (falham lá, passam agora). Os itens novos do 042 falham sem ele. As provas da agenda (`prova_agenda`, `prova_agenda_saida`, `prova_agenda_saida_r5`) dão o mesmo resultado com e sem o 042.
`npm run check` verde: lint 0 erros (19 avisos de arquivos de outros), tipos, regras, 61 arquivos e 507 testes, build. Numa rodada um teste falhou e passou nas duas seguintes (instável, não destas mudanças: nenhum código das funções mudou nesta correção).

| Item | O que mudou | Prova |
|---|---|---|
| Bug 1 | `desistir_envio` saiu do 039: o Lince confirmou que a tela não chama mais (fechar o aviso só esconde; o id do envio fica guardado e o próximo envio do card o reusa). Nem a lista vazia solta a marca: ela só sai quando o vídeo novo chega ou com o clique. | "Bug 1 lista vazia nao libera" |
| Bug 2 | Abandono de 3 h: TODA rede aberta (fila, enviando, processando) vira erro "O vídeo novo não chegou em 3 horas. Suba o vídeo de novo ou use Postar com o vídeo atual.", e a marca FICA. Nada chama a função nem retoma o rascunho antigo, nem se o alarme tocar de novo. Quando a marca sai (vídeo novo chegou ou o clique), um gatilho devolve essas redes à fila e a postagem segue. Rascunho já pedido à Meta continua protegido (a retomada confere antes de publicar). | "Novo 3 abandonado", "Novo 3 clique libera" |
| Bug 3 | O corte de 30 dias conta do ÚLTIMO prazo de 7 dias armado (coluna `limpeza_armada_em`, gravada quando o prazo é armado: entrar em Postado, desligar o Permanente, arquivo novo). O alarme de 1 h depois de uma falha não zera a conta. | "Limpeza desiste e prazo novo vale" |
| Bug 4 | O gatilho de pauta do 039 saiu. Fica só o do 315 (`tarefas_risca_pauta`, já em produção), que trata falha como aviso no log: o card entra em Postado mesmo com início impossível (31/02). | "Bug 4 pauta nao trava" |
| Parte 2: gatilho duplicado | Fica um só (o do 315). | "Pauta avisada" confere 1 gatilho |
| Parte 2: pauta na geração diária | O `postagens_gerar` volta a só gerar. A pauta é riscada só por aviso: o card entra em Postado (315) ou a pauta muda (035). O relógio `postagens_riscar` de 5 em 5 minutos sai. | "Pauta avisada" |
| Parte 2: agenda (`042`) | O despertador de 5 em 5 minutos (012) sai. Pedido novo na fila toca o n8n na hora (como já era) e arma UM despertador para 6 minutos depois. Ele só se rearma enquanto houver pedido pendente de menos de 1 dia (erro do Google, confirmação perdida). Fila vazia = nenhum relógio. Pedido mais velho que isso vai junto no próximo aviso. | `prova_042` (5 itens) |
| Parte 2: consulta à Meta | Mantida, porque a Meta não avisa quando o vídeo termina. Tem teto: dentro de uma execução confere a cada 15 s por no máximo 5 min, depois se rearma de 5 em 5 min por no máximo 5 voltas e vira erro "estado incerto" (cerca de 30 min no total). | já coberta em `postar.test.ts` |

Mudança de regra que aparece numa prova antiga: o F8 da `prova_037` esperava nenhum alarme com vídeo pendente; com o 039 existe um, único, para as 3 h.

**Ordem para colar (atualizada):** `034`, `035`, `036`, `037`, `038`, `039`, `040`, `041`, `042`. Depois publicar `postar-meta` e `drive`.
