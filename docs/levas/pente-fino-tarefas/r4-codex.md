**A retomada rápida ainda falha. O SQL 039 também introduz dois caminhos que podem publicar o vídeo antigo sem nova confirmação.** Encontrei quatro bugs novos de gravidade alta ou média.

Conferi os três relatórios pedidos, o `git diff`, o código atual e os SQLs **034 a 041**, incluindo os gatilhos anteriores que continuam ativos. Gatilhos são as campainhas do banco: uma mudança pode disparar outra ação automaticamente. Nenhum arquivo foi editado e nenhum SQL foi aplicado.

**Parte 1: os itens anteriores foram resolvidos?**

Os “ok” abaixo pressupõem os SQLs correspondentes aplicados e as funções de servidor atuais publicadas.

| Item | Veredito | Evidência e efeito prático |
|---|---|---|
| **A6** | **ok** | [039:32](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:32>) e [acoes.ts:329](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/drive/acoes.ts:329>). A segunda limpeza é recusada. Cada execução libera somente a trava identificada pelo horário que recebeu. |
| **A7** | **ok** | [039:76](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:76>) e [acoes.ts:131](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/drive/acoes.ts:131>). Registrar o vídeo e retirar seu envio da lista acontecem na mesma gravação. A confirmação concorrente apontada no r3 ficou protegida. |
| **N2** | **ok** | [estado.ts:144](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/estado.ts:144>) e [redes.ts:131](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/redes.ts:131>). O rascunho antigo sem assinatura passa pela conferência da Meta. Reproduzi o caso: rascunho com “ANTIGA”, card com “CORRIGIDA”; publicou **“CORRIGIDA”**. |
| **N3** | **ok** | [Ficha.tsx:166](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/ficha/Ficha.tsx:166>) e [Ficha.tsx:220](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/ficha/Ficha.tsx:220>). Os campos continuam bloqueados até terminar `organizarCard`. |
| **Ferreiro 5** | **Ainda falha como garantia de segurança** | [TelaNovaSenha.tsx:24](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/entrar/TelaNovaSenha.tsx:24>) e [TelaNovaSenha.tsx:36](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/entrar/TelaNovaSenha.tsx:36>). A chave antiga saiu, mas a exigência continua decidida pela tela. A troca envia somente a senha nova, sem vincular a conferência da senha atual ao pedido de alteração. Um comprovante de sessão válido comprova o login, não essa conferência. A proteção no servidor depende da configuração de Auth, que não foi verificada nesta sessão. O Supabase possui uma exigência específica para isso. [Documentação oficial](https://supabase.com/docs/guides/auth/password-security#require-current-password-when-changing-password). |
| **Novo 1** | **ok** | [039:92](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:92>) e [estado.ts:214](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/estado.ts:214>). A conclusão confere as redes atuais. Uma rede acrescentada durante a publicação impede o encerramento e recebe outra execução. |
| **Novo 2** | **ok para o cenário apontado** | [ideias.ts:168](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/ideias.ts:168>). A limpeza após falha preserva o print que continua referenciado pelo estado mais recente da folha. |
| **Novo 3** | **Ainda falha na retomada imediata** | [envios.ts:28](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/envios.ts:28>) e [envios.ts:97](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/envios.ts:97>). Durante os primeiros 30 segundos após recarregar, o envio anterior fica em `suspeitos`. A busca para reaproveitar seu identificador ignora essa lista e cria outro. **Reproduzido:** ficaram o envio novo e o antigo interrompido. A confirmação retira somente o identificador novo; o antigo ainda bloqueia a postagem. A confirmação repetida no servidor foi corrigida em [acoes.ts:91](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/drive/acoes.ts:91>). |
| **Novo 4** | **ok para o cenário apontado** | [anexos-vivos.ts:13](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/ficha/anexos-vivos.ts:13>). O vídeo entregue substitui o provisório pendente de mesmo nome. Permanece a limitação já registrada pelo Lince para nomes repetidos. |
| **Novo 5** | **ok** | [repositorio.ts:316](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/repositorio.ts:316>). Erro na reconferência restaura o selo e mostra a falha. |
| **F2** | **ok para a decisão registrada** | [Publicacao.tsx:69](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/ficha/Publicacao.tsx:69>), [Publicacao.tsx:142](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/ficha/Publicacao.tsx:142>) e [039:111](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:111>). Quando todas as redes escolhidas já publicaram, a tela avisa e bloqueia os botões; o banco recusa nova programação. Uma rede ainda não publicada continua permitida. |

**Parte 2: economia de execuções**

Não encontrei nas telas uma consulta recorrente ao Supabase como a antiga releitura de 15 segundos. Permanecem estes pontos:

| Local | O que permanece | Avaliação |
|---|---|---|
| [012:71](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/012_agenda_volta_por_evento.sql:71>) | `agenda_saida_despertador` consulta a fila **a cada 5 minutos**, mesmo vazia. São 288 verificações por dia. | **Viola a regra de acordar por aviso.** Não chamar o n8n quando a fila está vazia economiza o n8n, mas a consulta ao banco continua acontecendo. |
| [039:139](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:139>) | A conferência `riscar_postagens()` agora roda diariamente dentro de `postagens_gerar`. | **Ainda existe varredura por relógio.** A geração diária tem trabalho agendado próprio; a conferência acrescentada continua procurando mudanças sem receber aviso. |
| [redes.ts:107](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/redes.ts:107>), [redes.ts:190](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/redes.ts:190>) e [estado.ts:212](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/estado.ts:212>) | Consulta à Meta a cada **15 segundos** durante a execução e nova execução após **5 minutos** enquanto processa. | **Não atende ao modelo estritamente por aviso**, embora tenha limite de rodadas. É consulta à Meta, não consulta periódica da tela ao Supabase. |

Também há **trabalho duplicado por evento**: o gatilho antigo [315:343](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/_colar/2026-10-26-315-01-pauta.sql:343>) continua instalado, e o [039:133](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:133>) acrescenta outro. Ao entrar em Postado, os dois conferem a pauta.

Com a sequência completa, não identifiquei um alarme legítimo se reagendando indefinidamente: a limpeza ganhou o corte de 30 dias. As novas tentativas das anotações também têm limite. Os relógios locais das telas e o sinal de vida dos envios não consultam o Supabase.

O cron de todo minuto do 015 é histórico e é removido pelo [032:29](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/032_trava_volta_postado_e_liga.sql:29>). O reagendamento de minuto do 034 é substituído pelo 037 e pelo 039.

**Parte 3: aplicar 034 em diante na ordem quebra algo?**

A sequência disponível é **034 → 035 → 036 → 037 → 038 → 039 → 040 → 041**.

Na análise estática, não encontrei colisão de assinaturas nem uma versão antiga sobrescrevendo o conserto seguinte. O 041 depende corretamente do 040, e o código atual acompanha as mudanças de resposta e argumentos.

**Há, porém, regressões de comportamento no 039**, descritas abaixo, além dos dois gatilhos fazendo a mesma conferência. Portanto, a sequência não está livre de problemas.

Não executei essa sequência em um banco nesta sessão. A compatibilidade de aplicação com as definições vivas de produção permanece sem comprovação independente.

**Parte 4: quatro bugs novos**

1. **Alta: fechar o aviso de envio com falha pode publicar o vídeo antigo.**  
   O botão diz apenas “Tirar da lista” ou “Fechar painel”, mas chama `descartarEnvio`. Isso chama `desistir_envio`, que retira a última pendência e libera o alarme de uma postagem vencida. O vídeo antigo pode sair sem a confirmação “Postar com o vídeo atual”.  
   Fontes: [AvisoEnvio.tsx:46](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/components/casca/AvisoEnvio.tsx:46>), [envios.ts:134](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/envios.ts:134>), [039:65](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:65>) e [034:115](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/034_postagem_destrava_e_trava_empresa.sql:115>).  
   **Reprodução em memória:** antes de tirar o aviso, zero publicações; depois, uma publicação do vídeo antigo e card em Postado. A função de postagem usada foi a atual; o efeito do banco foi simulado conforme o SQL.

2. **Alta: expirar as 3 horas pode retomar e publicar o vídeo antigo.**  
   O tratamento do abandono transforma em erro somente registros que estejam em `fila`. Se o vídeo antigo estava em `processando` ou `enviando`, esse estado permanece. Em seguida, a pendência é apagada, o gatilho rearma a postagem e a execução retoma o rascunho antigo. Isso contraria a promessa de parar com erro e esperar a pessoa decidir.  
   Fontes: [039:177](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:177>) e [034:115](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/034_postagem_destrava_e_trava_empresa.sql:115>).  
   **Reprodução em memória:** começou em `processando`, sem publicação; após simular o tratamento do 039, publicou o vídeo antigo.

3. **Média: desligar Permanente em conteúdo antigo não inicia mais a limpeza prometida.**  
   Desligar Permanente rearma sete dias de prazo. Porém, o 039 desiste quando a entrada original em Postado tem mais de 30 dias. Exemplo: conteúdo publicado há 40 dias, Permanente desligado hoje; daqui a sete dias o alarme é retirado sem chamar o Drive. O mesmo corte afeta arquivos novos anexados a cards antigos em Postado.  
   Fontes: [acoes.ts:185](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/drive/acoes.ts:185>), [pastas-drive.ts:93](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/drive/pastas-drive.ts:93>) e [039:184](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:184>).  
   **Evidência:** fluxo do código e do SQL; não executado em banco.

4. **Média: uma falha na pauta agora pode impedir o card de entrar em Postado.**  
   O gatilho anterior tratava o erro como aviso e deixava a postagem prosseguir. O novo chama a conferência sem esse tratamento; qualquer erro desfaz a mudança do card. Um exemplo concreto é um início inválido como `2026-02-31`: o esquema aceita o formato textual, mas a conversão para data falha. Na postagem automática, o conteúdo pode já ter saído na Meta enquanto o card continua em Aprovado.  
   Fontes: [039:126](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/039_r4_limpeza_videos_ja_postado_e_relogios.sql:126>), [001:37](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/001_esquema.sql:37>) e tratamento anterior em [315:48](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/_colar/2026-10-27-315-data-do-mapa.sql:48>).  
   **Evidência:** análise do SQL; não reproduzido em banco nesta sessão.

**Validação desta conferência:** lint com **zero erros e 19 avisos**, tipos e regras locais passando, `git diff --check` limpo. As reproduções adicionais rodaram em memória, sem serviços reais. O Vitest não iniciou porque tentou criar seu arquivo de controle e o ambiente permite somente leitura. Não executei build, que gravaria arquivos em `.next`.