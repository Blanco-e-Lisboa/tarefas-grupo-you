# Pente fino Tarefas, rodada 2 (Ferreiro): banco e servidor

Área: `supabase/0*.sql` (foco nos novos 034, 035, 036 e 040, ainda não aplicados) e `supabase/functions/` (postar-meta, drive, _shared), no código atual com os consertos da rodada 1. Só leitura: nenhum código editado, nada escrito no banco. No banco de produção rodei só SELECT: definições vivas de `pegar_postagens`, `armar_alarme`, `cron_alarme`, `postar_agora`, `pode_aprovar`, `gerar_tarefas_postagens`, `salvar_planejada`, a lista de `cron.job` e contagens de cards, postagens e arquivos. Também rodei a parte de consulta da migração do 035 (sem o UPDATE).

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

## Alta

### 1. Ficha aberta ressuscita o card que outra pessoa apagou (o A1 não cobre a exclusão)
`supabase/040_versao_do_card.sql:51` a `:53` e `:77` a `:84`
- Defeito: `salvar_tarefa` procura o card com `select ... for update`; se não acha, cai no INSERT e cria o card de novo, sem olhar `p_versao`. Do lado da tela, depois que o tempo real tira o card apagado da memória, `salvarTarefa` trata o salvar como card novo (`antes` vazio) e nem manda o número de edição. Nos dois caminhos, o card volta.
- Cenário: Matheus está com a ficha de um Reels Aprovado aberta, editando a legenda. Natham apaga o card pela lixeira da Esteira (a função drive tira os arquivos e a linha). Matheus clica Salvar: o card renasce, Aprovado, com a data do post e sem nenhum arquivo. O gatilho `tarefas_alarmes` arma o alarme no INSERT; na hora marcada a postagem cai em "Reels precisa de 1 vídeo" e manda o aviso de erro pelo WhatsApp. Ninguém entende de onde o card voltou.
- Gravidade: alta. Confiança: média para alta (SQL lido; o caminho da tela vem do que li do `repositorio.ts` na rodada 1).

## Média

### 2. Card que volta de Postado para Aprovado e é programado de novo nunca posta: o alarme o devolve a Postado na hora
`supabase/034_postagem_destrava_e_trava_empresa.sql:61` a `:72` (com a catraca viva `pegar_postagens` e `tarefas_alarmes:119`)
- Defeito: ao sair de Postado as linhas `postado` de `postagens` ficam (o 033/034 só apaga `fila`). Reprogramado, o alarme acha "toda rede tem linha e nenhuma está aberta" e move o card para Postado sem chamar a postar-meta. A catraca também não pegaria nada: o `insert ... on conflict do nothing` não refaz a linha, e o `update` só pega `fila`/`processando`. O 032 diz "sem data, alguém precisa programar de novo", o que dá a entender que programar de novo posta.
- Cenário: o Reels saiu com o vídeo errado. Natham volta o card para Aprovado, sobe o vídeo certo e programa para as 19:00. Às 19:00 o card vira Postado sozinho, com o link do post antigo, e nada sai na rede. Com "Postar agora" é igual.
- Gravidade: média (pode ser de propósito, para não postar duas vezes, mas então a tela precisa dizer isso; hoje é silencioso). Confiança: alta.

### 3. A checagem de 25 Mbps barra vídeo que o Drive ainda não mediu (regressão do M20)
`supabase/functions/postar-meta/redes.ts:37` a `:40` (contra o comentário de `supabase/functions/_shared/google.ts:63`)
- Defeito: sem `videoMediaMetadata.durationMillis` do Drive, `conferirTaxa` lança `ErroEspera`: 2 novas tentativas a cada 10 min e depois erro. O comentário de `duracaoVideo` diz "undefined = quem chama não barra", mas `conferirTaxa` barra. O Drive mede vídeo grande só depois de processar (em produção há vídeo de 917 MB), e há arquivo que ele nunca mede. Antes do conserto esses vídeos postavam.
- Cenário: Matheus sobe o legendado de 800 MB às 17:50 para o post das 18:00. O Drive ainda está processando: às 18:00, 18:10 e 18:20 a postagem espera, e às 18:20 vira erro "O Drive ainda não mediu o vídeo", com aviso no WhatsApp. O vídeo estava dentro do limite.
- Gravidade: média. Confiança: média (comportamento do Drive conhecido, não medido aqui).

### 4. Troca de capa: a capa velha sai antes de a nova ficar gravada (o M14 só encolheu a janela)
`supabase/functions/drive/acoes.ts:121` a `:137`
- Defeito: na troca (`substitui_arquivo_id`), a velha vai para a lixeira do Drive e perde a linha ANTES do `inserir` da nova. Se o `inserir` falha (queda do banco, trava, conflito), o `catch` também joga a nova na lixeira. O card fica sem capa nenhuma.
- Cenário: Natham troca a capa do Reels das 18:00; o banco responde 500 no `inserir`. As duas capas estão na lixeira do Drive e o post sai sem capa (ou com o quadro padrão).
- Gravidade: baixa para média. Confiança: alta (código lido; a falha do `inserir` é rara).

### 5. Alarme e "Tentar de novo" não conferem tipo e empresa como a catraca: uma hora de voltas à toa e erro falso
`supabase/034_postagem_destrava_e_trava_empresa.sql:22` a `:33` e `:50` a `:51`
- Defeito: `tentar_de_novo` e `alarme_tocou` olham só etapa e data. A catraca (`pegar_postagens`) exige também `tipo = 'postagem'` e `empresa_id = 'you'`. Card que perdeu uma das duas fica com o alarme tocando a cada 12 min sem a postar-meta pegar nada; na 5ª volta grava "a funcao de postagem nao respondeu depois de varias tentativas".
- Cenário: card da You em Aprovado com erro numa rede; alguém troca o Tipo para Roteiro (o 034 desarma e marca as linhas como erro). A ficha ainda mostra "Tentar de novo"; Natham clica: durante uma hora o alarme toca à toa e o card termina com o erro falso "a função não respondeu". Mesmo caminho para card antigo de outra empresa que ainda tenha data.
- Gravidade: baixa para média. Confiança: alta (lógica). Em produção hoje não há card nessa situação.

## Baixa

### 6. A1: "Postar agora" e "Tentar de novo" sobem o número de edição e a ficha de quem clicou fica com o número velho
`supabase/040_versao_do_card.sql:17` a `:26`, com `postar_agora` (027, vivo) e `supabase/034_postagem_destrava_e_trava_empresa.sql:32`
- Defeito: as duas funções mudam `postar_em`, o gatilho `zz_tarefas_versao` sobe a versão, e a ficha só anota as versões dos salvar dela (`versao-card.ts`). A ficha que disparou o "Postar agora" segue aberta com o número antigo.
- Cenário: Natham clica "Postar agora", a postagem cai em erro e ele corrige a legenda na mesma ficha: Salvar é recusado com "Este card mudou enquanto você editava", e a mudança que o recusou foi dele mesmo.
- Gravidade: baixa. Confiança: média (não conferi se a ficha fecha depois de "Postar agora").

### 7. Quem vê mas não pode editar recebe erro de chave duplicada em vez de "sem permissão"
`supabase/040_versao_do_card.sql:51`
- Defeito: `select ... for update` também passa pela trava de UPDATE (RLS). Card visível mas não editável parece "não existe", e o salvar cai no INSERT, que falha com 23505 ou 42501. Antes (`if exists`, sem trava) a mensagem era "sem permissao para alterar a tarefa".
- Cenário: chamada direta à API, ou tela que deixe passar um salvar só de leitura: a pessoa vê "Não consegui salvar a tarefa" em vez do motivo.
- Gravidade: baixa. Confiança: média.

### 8. Card esperando vídeo novo faz o alarme tocar a cada minuto, sem fim
`supabase/034_postagem_destrava_e_trava_empresa.sql:53` a `:56`
- Defeito: com `video_pendente_desde`, o alarme se reagenda para +1 min sem contar rodada nem ter teto. O 034 já rearma quando a marca sai (`tarefas_alarmes:114`), então esse relógio de minuto não é mais preciso.
- Cenário: o envio do legendado falha às 17:55 de sexta e ninguém aperta "Postar com o vídeo atual" até segunda: são uns 3.800 disparos do cron, cada um com consulta e reagendamento.
- Gravidade: baixa. Confiança: alta.

### 9. Alarme armado pela postar-meta depois de o card sair de Aprovado vira job de cron "de todo ano"
`supabase/034_postagem_destrava_e_trava_empresa.sql:50` a `:52` (com `cron_alarme` vivo, expressão sem ano)
- Defeito: quando o card já não vale, `alarme_tocou` retorna antes de tirar o próprio job. O `banco.armar(tarefa, 5)` da postar-meta pode agendar depois de o gatilho ter desarmado (vídeo processando quando alguém tira a data), e esse job sobra e toca de novo no mesmo dia e minuto do ano seguinte.
- Cenário: card processando na Meta; Natham tira a data. A postar-meta termina a volta e arma +5 min. O job toca, retorna sem fazer nada e fica em `cron.job` para sempre.
- Gravidade: baixa (só lixo; não posta). Confiança: média.

### 10. B3: arquivo que o navegador mandou sem tipo é recusado depois de subir inteiro
`supabase/functions/drive/acoes.ts:105` a `:110`
- Defeito: `tipoDoMime(f.mimeType)` vira "documento" quando o Drive guardou tipo vazio ou genérico, e os bytes dizem "video": a confirmação recusa e joga na lixeira, depois de o upload terminar.
- Cenário: no Windows, um `.mkv` ou `.mov` sem tipo registrado sai com `file.type = ""`; se a tela o anexar como documento, ele sobe inteiro (às vezes centenas de MB) e só então é recusado com "O tipo do arquivo não confere".
- Gravidade: baixa. Confiança: baixa (depende de como a tela escolhe o `tipo` com `file.type` vazio; não conferi).

## O que não cobri
- SQL antigos (001 a 031) só por cima, onde os novos dependem deles. Não revisei de novo travas (RLS) tabela por tabela nem o `_colar/` da pauta além das funções vivas citadas.
- `functions/google-autorizar`, `drive/pasta-livre.ts`, `pastas229` e os testes das funções: não li.
- Não rodei os testes das funções nem os `prova_034.sql`/`prova_035.sql`; não testei contra a Meta nem contra o Drive.
- Os achados 1 e 6 dependem de partes da tela (`repositorio.ts`, `Publicacao.tsx`) que li só no ponto citado.
