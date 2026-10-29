Encontrei **5 correções com regressão e 10 incompletas** nos 43 itens avaliados. Regressão significa um problema criado pelo próprio conserto.

Li a lista, os três relatos, o diff e os arquivos novos de código e banco. Os vereditos abaixo avaliam a proposta local; não comprovam implantação em produção. Nada foi editado.

| Item | Veredito | Arquivo:linha | Explicação curta |
|---|---|---|---|
| A1 | regressao | `src/lib/dados/versao-card.ts:9` | Salvar sem alterar campos pode guardar `5 → 5`. O próximo salvar percorre essa ligação para sempre e trava a aba. Depende do banco 040. |
| A2 | ok | `src/components/tarefas/grade.ts:42` | A cópia perde anexos, programação e dados da publicação. Conteúdo aprovado/postado volta para Roteiro. |
| A3 | ok | `src/components/pastas/MuralIdeias.tsx:137` | Entrar e sair sem digitar não grava mais o texto antigo. Campos fora de uso recebem as atualizações. |
| A4 | ok | `supabase/034_postagem_destrava_e_trava_empresa.sql:27` | Reinicia rodadas e tentativas das redes com erro, preservando as já publicadas. |
| A5 | regressao | `supabase/functions/postar-meta/estado.ts:168` | A nova conferência impede publicações ainda não solicitadas, mas também apaga registros de vídeos que o Facebook já recebeu para publicar. Pode permitir duplicação. |
| A6 | incompleto | `supabase/functions/drive/acoes.ts:66` | Ainda existe intervalo entre conferir a etapa e apagar. A remoção final da pasta também não reconfirma a etapa. |
| A7 | regressao | `src/lib/dados/envios.ts:35` | Resolve vídeos de cards diferentes na fila. Com dois vídeos do mesmo card, o primeiro limpa a pendência e o segundo usa uma marca antiga, sem marcar novamente. |
| A8 | ok | `supabase/034_postagem_destrava_e_trava_empresa.sql:156` | Vídeos anteriores de carrossel continuam como anexos publicáveis. |
| A9 | ok | `src/components/calendario/TelaCalendario.tsx:85`; `src/components/tarefas/TelaTarefas.tsx:244` | Os caminhos apontados agora recusam mover o card programado e orientam alterar a data da publicação. |
| M1 | ok | `supabase/034_postagem_destrava_e_trava_empresa.sql:142`; `src/components/ficha/Publicacao.tsx:91` | A interface explica a publicação manual e o banco recusa novas programações fora da You. |
| M2 | incompleto | `supabase/035_pauta_respeita_quem_mexeu.sql:61` | A proteção compara apenas dono, início, título e notas. Alterar duração, links, tags ou cor ainda permite que a pauta apague a tarefa editada. |
| M4 | ok | `supabase/034_postagem_destrava_e_trava_empresa.sql:107` | Tipo e empresa passam a participar dos alarmes. Trocar empresa sem programação remove o tema incompatível; com programação, a troca para fora da You é recusada. |
| M5 | ok | `src/lib/dados/tempo-real.ts:28` | Cada ligação recebe um canal diferente, evitando reutilizar o canal que ainda está sendo encerrado. |
| M6 | ok | `src/lib/dados/anotacoes.ts:51` | As gravações da mesma nota seguem uma fila. Erros retornados pelo banco geram aviso e nova tentativa. |
| M7 | incompleto | `src/lib/dados/envios.ts:17` | Abas independentes ficam separadas, mas uma aba aberta com origem em outra pode receber uma cópia do armazenamento e mostrar envios vivos como interrompidos. Esse comportamento é documentado pelo [navegador](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage). |
| M8 | ok | `src/lib/dados/anexos.ts:107` | Dois salvar usando o mesmo arquivo pendente aguardam o mesmo envio, evitando duplicar a imagem. |
| M9 | regressao | `src/lib/dados/repositorio.ts:187` | A leitura continua durante o envio, mas sua conclusão substitui toda a lista de anexos pela lista antiga daquela operação. Anexos recentes somem da tela. |
| M10 | ok | `src/lib/dados/repositorio.ts:95`; `src/lib/dados/repositorio.ts:216` | Preserva anexos já conhecidos quando a leitura falha, avisa e usa a exclusão com arquivos quando o banco informa que existem anexos. |
| M11 | ok | `src/components/ficha/Anexos.tsx:43` | Escolher vídeo apenas prepara o rascunho. O envio começa ao salvar; descartar antes disso não envia. |
| M12 | ok | `supabase/034_postagem_destrava_e_trava_empresa.sql:61` | Uma rede escolhida ainda sem registro impede o encerramento prematuro do alarme. |
| M13 | incompleto | `src/components/ficha/Publicacao.tsx:125`; `supabase/034_postagem_destrava_e_trava_empresa.sql:46` | Sem data, o registro vira erro e aparece apenas “Tentar de novo”. Esse botão recoloca na fila, mas o alarme recusa executar sem data. Pode prender novamente em “Postando”. |
| M14 | regressao | `src/lib/dados/drive.ts:67`; `supabase/functions/drive/acoes.ts:261` | A capa antiga ainda sai antes da confirmação final. Além disso, sendo o último arquivo registrado, sua exclusão manda para a lixeira a pasta que já contém o envio novo. |
| M15 | ok | `src/lib/dados/agenda.ts:8`; `src/components/calendario/Compromisso.tsx:14` | A agenda pessoal passa a ter origem, opção de filtro e identificação do Adrian. |
| M16 | ok | `supabase/functions/drive/comum.ts:16` | Pedidos pelos últimos bytes e formatos inesperados passam a respeitar o limite de 4 MB. |
| M17 | ok | `src/components/tarefas/grade.ts:44` | A duplicação preserva o destino do Caderno pelo dono da tarefa. |
| M18 | ok | `src/components/ficha/postagem.ts:13` | A comparação e o dia mínimo usam Brasília, corrigindo a diferença de fuso apontada. |
| M19 | incompleto | `supabase/functions/postar-meta/redes.ts:115` | Uma única legenda igual na resposta ainda não identifica aquele post. A consulta é parcial e a legenda pode ter mudado desde a publicação. |
| M20 | incompleto | `supabase/functions/postar-meta/redes.ts:71` | Bloqueia quando há duração disponível. Sem duração ou com falha na consulta, libera o vídeo; na ficha existe somente aviso. |
| M21 | incompleto | `src/lib/dados/ideias.ts:142`; `src/lib/dados/ideias.ts:227` | A ordem melhorou, mas apagar os arquivos continua sem conferir resultado nem repetir em caso de falha. Prints órfãos ainda podem permanecer. |
| B2 | ok | `supabase/functions/drive/acoes.ts:154` | Criar e renomear tema consultam a permissão do banco antes de executar. |
| B3 | incompleto | `supabase/functions/drive/acoes.ts:128`; `supabase/functions/drive/drive-api.ts:36` | Compara o MIME, ou tipo declarado do arquivo, mas o envio também informa esse tipo ao Drive. Não valida os bytes; o Drive só promete detectar automaticamente quando o tipo não é informado. [Referência](https://developers.google.com/workspace/drive/api/reference/rest/v3/files). |
| B4 | ok | `supabase/035_pauta_respeita_quem_mexeu.sql:121` | A desmarcação manual fica registrada e a rotina automática passa a respeitá-la. |
| B5 | ok | `supabase/036_contar_tags_so_quem_edita.sql:9` | A contagem geral passa a exigir a permissão de Natham ou Matheus. |
| B6 | incompleto | `src/components/tarefas/TelaTarefas.tsx:70` | Espera o login, mas apaga a lista antiga sem aguardar a confirmação das gravações. Uma recusa do banco ainda perde a migração. |
| B7 | ok | `src/lib/dados/repositorio.ts:171` | Uma falha antiga não desfaz uma versão posterior que já está na tela; também solicita releitura. |
| B8 | ok | `src/lib/dados/repositorio.ts:330` | Exclusão sem linhas retornadas passa a ser tratada como recusa, mantendo a marca e avisando. |
| B9 | ok | `src/components/tarefas/grade.ts:35` | Calcula a duração considerando as duas datas, preservando a passagem pela meia-noite dentro dos limites da folha. |
| B10 | ok | `src/components/ficha/Ficha.tsx:143`; `src/components/calendario/logica.ts:129` | Concordo com “não confirmado” pelo fluxo atual: dia inteiro é salvo sem fim. O código ainda perderia o fim de um registro importado; não conferi a contagem em produção. |
| B11 | ok | `src/lib/dados/agenda.ts:83`; `src/lib/dados/postagens-planejadas.ts:62` | Respostas de leituras anteriores são descartadas quando já existe uma leitura mais recente. |
| B12 | ok | `src/components/conteudos/TelaConteudos.tsx:30` | A tela volta a consultar o dia a cada minuto e deixa de manter o “hoje” indefinidamente. |
| B13 | ok | `src/components/pastas/TelaPastas.tsx:258` | A ficha recebe a restrição de edição e a lista de tipos de conteúdo. |
| B14 | incompleto | `src/components/casca/BotaoSair.tsx:14` | Limpa os envios desta aba. Outras abas mantêm sua própria lista e seus envios em memória, sem limpeza vinculada à troca de usuário. |
| B15 | ok | `src/components/pastas/CardsPasta.tsx:30`; `src/components/configuracoes/TelaConfiguracoes.tsx:27` | A trava imediata impede duas operações simultâneas por cliques repetidos. |

M3 e B1 foram explicitamente mantidos por decisão registrada, portanto não os contei como consertados. B16 não tem conserto apresentado nesses relatos.

Encontrei estes **seis bugs novos**, do mais grave ao menos grave:

1. **Alta: publicação no Facebook fica sem registro e pode ser duplicada.**  
   Em [estado.ts:168](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/estado.ts:168>), qualquer resultado ainda processando é apagado quando a programação deixa de valer. Isso inclui `video-pub`, que significa que a publicação já foi solicitada. Reproduzi uma publicação na Meta falsa com **zero registros restantes no banco** após cancelar. Reprogramar permite começar outra publicação.

2. **Alta: dois vídeos do mesmo card liberam a postagem antes do segundo terminar.**  
   Em [envios.ts:35](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/envios.ts:35>), cada vídeo guarda a confirmação antecipada de uma única marca compartilhada pelo card. O primeiro vídeo chega e limpa a marca; o segundo começa sem renová-la. Reproduzi o segundo envio em andamento com a pendência desmarcada. O post pode sair com o vídeo anterior ou o carrossel incompleto.

3. **Alta: trocar a única capa registrada pode mandar o envio novo para a lixeira.**  
   A nova ordem em [drive.ts:67](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/drive.ts:67>) sobe a imagem antes de apagar a capa antiga. Quando a antiga é o último registro, `apagar_anexo` também apaga a pasta inteira, onde a nova já está. Reproduzi a pasta sendo enviada à lixeira. No Drive real, arquivos herdam esse estado da pasta, conforme a [documentação](https://developers.google.com/workspace/drive/api/reference/rest/v3/files); a confirmação seguinte pode recusar a imagem nova.

4. **Alta: salvar sem mudança trava a aba no próximo salvar.**  
   Em [versao-card.ts:17](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/versao-card.ts:17>), o número retornado é guardado mesmo quando não aumentou. É como uma indicação “próxima página: esta mesma página”. O próximo salvar entra em repetição infinita. Reproduzi com retorno `5` para uma gravação baseada em `5`; precisei encerrar a execução isolada.

5. **Alta: pendência temporária de vídeo desliga definitivamente a programação.**  
   Em [estado.ts:195](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/supabase/functions/postar-meta/estado.ts:195>), a pendência é tratada como cancelamento: apaga a linha e desarma o alarme. Quando o vídeo chega, limpar a marca não rearma esse alarme. Reproduzi o card mantendo a data programada, sem registros de postagem e com o alarme desarmado. A tela pode continuar parecendo programada, mas nada executa.

6. **Média: terminar um envio apaga da tela anexos recebidos durante ele.**  
   Em [repositorio.ts:187](<C:/Users/You Contab_/Grupo-You/Sistemas-Grupo-You/grade-conteudo/src/lib/dados/repositorio.ts:187>), o resultado antigo do envio substitui a lista atual inteira. Reproduzi a tela contendo a imagem de outra pessoa e a imagem local; ao terminar o envio local, restou somente esta última. O registro remoto continua no banco, mas a tela passa a mostrar uma lista incorreta.

Validação realizada: reproduções em memória usando o código atual, `git diff --check` sem apontamentos e `npm run lint` passando com **0 erros e 19 avisos**. Não executei build nem apliquei instruções no banco.