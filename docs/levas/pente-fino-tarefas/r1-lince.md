# Pente fino do sistema Tarefas, rodada 1: Lince

Área: Esteira (conteudos), Ficha, Pastas, Configurações, Entrar, Casca, layout, page, proxy e a camada `src/lib/dados` que elas usam (anexos, drive, ideias, postagens, subindo, envios, apagar/duplicar card, repositorio).

Método: leitura do código e, só para leitura, das funções e gatilhos do banco de produção (projeto uruhjlurcxpjhhgvuzwt: `salvar_tarefa`, `postar_agora`, `tentar_de_novo`, gatilhos de `tarefas`). Nada foi editado nem gravado.

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

---

## 1. Ficha aberta grava o rascunho velho por cima do que outra pessoa mudou (etapa, data do post, notas, tags)

- **Arquivo:linha:** `src/components/ficha/Ficha.tsx:77` (o rascunho nasce da cópia ao abrir e nunca acompanha o card vivo), `src/components/ficha/Ficha.tsx:159` (manda a ficha inteira), `src/lib/dados/repositorio.ts:154` e `:176` (monta a linha inteira e chama `salvar_tarefa`). No banco, `public.salvar_tarefa` faz `update ... set etapa = r.etapa, notas = r.notas, ..., postar_em = r.postar_em` sem nenhuma conferência de versão (`updated_at`), e apaga e recria todas as tags.
- **Defeito:** o último a salvar vence em TODOS os campos, inclusive nos que ele nem mexeu. A ficha só puxa do card vivo os anexos novos (`useArquivosQueChegam`); etapa, `postarEm`, legenda, notas, tags, aprovador e redes ficam como estavam na hora em que a ficha abriu.
- **Cenários:**
  1. Adrian abre a ficha de um card em Edição. Enquanto isso, Lucas arrasta o card para Em análise. Adrian corrige um erro de digitação nas notas e salva: o card volta para Edição sem aviso nenhum e some da fila de aprovação.
  2. O Natham abre a ficha de um post Aprovado programado. A postagem automática publica e o card vai para Postado. O Natham salva a ficha (só mexeu nas notas): a etapa volta para Aprovado. O gatilho `tarefas_volta_postado` zera `postar_em`, e o card aparece como "Sem programação" num post que já está no ar. Se alguém programar de novo, o post sai duas vezes.
  3. O Matheus reprograma o post das 10:00 para as 15:00. O Natham, com a ficha aberta desde antes, salva: a hora volta para 10:00 e o post sai na hora errada.
  4. Variante para quem não aprova: se o aprovador mudou a data ou a legenda enquanto a ficha de um editor estava aberta, o salvar do editor é recusado com "Só o Natham ou quem aprova o card pode fazer isso", sem dizer que o motivo é o card ter mudado. A pessoa não consegue salvar até fechar e abrir de novo.
- **Gravidade:** alta. **Confiança:** alta (função e gatilhos conferidos no banco de produção).

## 2. Mural de ideias desfaz a edição de outra pessoa quando você só passa pelo campo

- **Arquivo:linha:** `src/components/pastas/MuralIdeias.tsx:143` e `:148` (`defaultValue` nos campos de título e detalhe), `src/components/pastas/MuralIdeias.tsx:132` (compara o texto do campo com a ideia nova e grava).
- **Defeito:** os campos usam `defaultValue`, que só vale na primeira montagem. Quando o tempo real traz a ideia editada por outra pessoa, o componente continua com a mesma `key` (id da ideia) e o campo segue mostrando o texto antigo. Ao sair do campo, `sair()` compara o texto antigo da tela com o novo do banco, vê diferença e grava o antigo.
- **Cenário:** o Matheus muda o título da ideia "Dicas IR" para "Dicas IR 2027". O Natham está com o mural aberto, continua vendo "Dicas IR", clica no título só para ler e clica fora (ou passa com Tab): o título volta para "Dicas IR" no banco para os dois, sem aviso. Vale também para o Detalhe.
- **Gravidade:** alta. **Confiança:** alta.

## 3. Lista de envios é uma só para todas as abas: envio vivo aparece como "interrompido" na outra aba

- **Arquivo:linha:** `src/lib/dados/envios.ts:14` a `:19` (chave única `grade:envios-abertos` no navegador; ao carregar, tudo vira "interrompido"; cada aba regrava a lista inteira com só os envios dela).
- **Defeito:** a lista guardada não separa as abas. Uma aba nova lê os envios da outra aba como "interrompidos". E qualquer mudança na lista de uma aba apaga da memória os envios que a outra aba tinha guardado.
- **Cenário:** o Natham sobe um vídeo de 1 GB na aba 1 e abre o sistema numa aba 2. A aba 2 mostra "Envio interrompido. Escolha o vídeo de novo" com o link "Abrir o card". Ele escolhe o vídeo de novo: o mesmo vídeo sobe duas vezes para o Drive (dois arquivos no card, o dobro de banda). No sentido inverso: se a aba 1 é recarregada no meio do envio, o aviso de "interrompido" pode não aparecer porque a aba 2 regravou a lista sem ele.
- **Gravidade:** média. **Confiança:** alta.

## 4. Mexer no card enquanto o salvar ainda sobe imagem manda a mesma imagem de novo

- **Arquivo:linha:** `src/lib/dados/repositorio.ts:162` (a tela já mostra o card com o anexo ainda `pendente`), `src/lib/dados/repositorio.ts:204` (a 2ª gravação compara com esse card otimista), `src/lib/dados/anexos.ts:75` a `:80` (todo anexo ainda `pendente` sobe).
- **Defeito:** enquanto o primeiro salvar está subindo imagens para o Drive (pode levar minutos num carrossel), o card na tela carrega os anexos marcados como `pendente`. Uma segunda gravação do mesmo card (arrastar na Esteira, que salva o card inteiro vivo, ou Começar/Aprovar) recebe esses mesmos anexos ainda pendentes e sobe cada um outra vez.
- **Cenário:** Lucas anexa 8 imagens num carrossel, salva e, enquanto sobe, arrasta o card de Edição para Em análise. As imagens que ainda não tinham terminado sobem duas vezes; o carrossel fica com fotos repetidas e a postagem pode passar do limite de 10 mídias.
- **Gravidade:** média. **Confiança:** média (o caminho existe no código; não reproduzi).

## 5. Durante um upload longo a tela para de receber o que os outros mudam

- **Arquivo:linha:** `src/lib/dados/repositorio.ts:88` a `:96` (`protegida`: com qualquer gravação no ar, toda leitura é adiada) somado ao `sincronizarAnexos` rodando dentro do `salvarTarefa` protegido (`repositorio.ts:204`).
- **Defeito:** a trava que evita "o card voltar" segura TODAS as leituras enquanto existe uma gravação no ar, e a gravação só termina quando a última imagem chega ao Drive. Tempo real, volta à aba e a espiada de 15 s do "Postando…" ficam parados nesse tempo.
- **Cenário:** o Natham salva um card com 10 fotos grandes numa internet lenta (3 a 5 minutos). Nesse tempo o card que ele mandou postar continua em "Postando…", o que o Matheus arrastou não se move na tela dele, e ele pode tomar decisões em cima de dados velhos (e cair no achado 1).
- **Gravidade:** média. **Confiança:** alta.

## 6. Falha ao ler os anexos é engolida: cards aparecem sem anexo e apagar dá mensagem errada

- **Arquivo:linha:** `src/lib/dados/anexos.ts:43` (`if (error || !data?.length) return porTarefa`: erro vira "nenhum anexo"), `src/lib/dados/anexos.ts:46` (erro dos endereços assinados também ignorado), `src/lib/dados/repositorio.ts:221` (decide o jeito de apagar pelo que está na tela) e `:135` (traduz 42501 como problema de aprovação).
- **Defeito:** se a leitura da tabela `arquivos` falha (rede, sessão vencendo), todos os cards aparecem sem clipe e sem anexos, sem nenhum aviso. Com isso, "Concluir" ou a lixeira tentam o apagar simples; o gatilho `tarefas_apagar_com_drive` recusa com 42501 e a tela mostra "Só o Natham ou quem aprova o card pode fazer isso.", que não é o motivo.
- **Cenário:** a conexão oscila na hora da leitura. O Natham vê o card sem anexos e acha que os vídeos se perderam; tenta concluir o card e recebe uma recusa que fala de aprovação. Alguém pode subir os arquivos de novo e duplicar no Drive.
- **Gravidade:** média. **Confiança:** alta.

## 7. Vídeo escolhido na ficha sobe mesmo se a pessoa clicar em "Descartar alterações"

- **Arquivo:linha:** `src/components/ficha/Anexos.tsx:40` a `:42`.
- **Defeito:** em card que já existe e tem empresa, o vídeo entra na fila de envio no instante em que é escolhido, fora do rascunho. O "Descartar alterações?" da ficha (item 281) não cancela esse envio, e a lista da ficha nem fica "suja" por causa dele.
- **Cenário:** num card Aprovado, quem aprova arrasta por engano o vídeo errado para os anexos, percebe e clica Cancelar → Descartar. O vídeo sobe mesmo assim, marca "vídeo novo pendente" (bloqueia a postagem enquanto sobe) e, ao chegar, vira o vídeo do post (fluxo do legendado, item 270). O post sai com o vídeo que a pessoa achou ter descartado.
- **Gravidade:** média. **Confiança:** alta (o comentário diz que é de propósito subir mesmo com a ficha fechada, mas o Descartar promete o contrário).

## 8. A função `apagar_card` (SQL 029) não existe no banco de produção

- **Arquivo:linha:** `src/lib/dados/apagar-card.ts:10` a `:12`.
- **Defeito:** conferido no banco: `public.apagar_card` não existe. O código recebe PGRST202 e cai, sem aviso, no apagar direto da tabela. A regra do item 287 ("card de conteúdo só se apaga pela função") não está valendo em produção, embora o arquivo `supabase/029_card_so_pela_esteira.sql` esteja no repositório.
- **Cenário:** qualquer pessoa que pode apagar continua apagando card de conteúdo pela tabela, com as travas antigas. Quem conta com a regra do 029 está enganado.
- **Gravidade:** baixa (é o comportamento de antes). **Confiança:** alta.

## 9. O "hoje" da Esteira não vira à meia-noite

- **Arquivo:linha:** `src/components/conteudos/TelaConteudos.tsx:73` (`useSyncExternalStore` com uma assinatura que nunca avisa).
- **Defeito:** a data de hoje é lida uma vez e só muda se a tela re-desenhar por outro motivo. Com a aba aberta de um dia para o outro, as contagens "hoje", "posta amanhã" e "atrasado" ficam com a data de ontem até algo mexer na tela.
- **Cenário:** a Esteira fica aberta da noite de 28/10 até a manhã de 29/10. O post de 29/10 continua aparecendo como "posta amanhã" e o de 28/10 não aparece como atrasado.
- **Gravidade:** baixa. **Confiança:** média (qualquer mudança nos dados re-desenha e corrige).

## 10. Prints das ideias: arquivo some antes de gravar, e ideia apagada deixa os prints no armário

- **Arquivo:linha:** `src/components/pastas/PrintsIdeia.tsx:19` (apaga o arquivo e depois grava a ideia), `src/lib/dados/ideias.ts:133` (apagar ideia não apaga os prints).
- **Defeito:** (a) ao tirar um print, o arquivo é apagado do Storage antes de o banco confirmar a ideia sem ele; se a gravação falhar, a tela volta a ideia antiga, que aponta para um arquivo que não existe mais (miniatura quebrada). (b) Apagar a ideia deixa todos os prints dela no Storage, para sempre.
- **Cenário:** sem rede, o Natham tira um print: aparece "Não consegui salvar a ideia", o print volta na lista, mas vazio. Com o tempo, ideias apagadas acumulam imagens órfãs no armário.
- **Gravidade:** baixa. **Confiança:** alta.

## 11. Pastas abre a ficha sem o modo "só olhar"

- **Arquivo:linha:** `src/components/pastas/TelaPastas.tsx:255`.
- **Defeito:** a Esteira passa `soLer` para quem não pode mexer no card (`TelaConteudos.tsx:243`); as Pastas não passam. Também não passam `tipos`, então o menu Tipo mostra Reunião, Ideia e Outro num card da Esteira.
- **Cenário:** quem recebeu um card de conteúdo ENVIADO por outra pessoa abre pelas Pastas, edita tudo e só no Salvar recebe "Essa tarefa é só para olhar". O trabalho digitado se perde ao fechar.
- **Gravidade:** baixa. **Confiança:** alta.

## 12. Sair sem internet não sai, e o próximo usuário do mesmo computador herda os envios

- **Arquivo:linha:** `src/components/casca/BotaoSair.tsx:7`, `src/lib/dados/envios.ts:14`, `src/lib/dados/drive.ts:80`.
- **Defeito:** o erro do `signOut` é ignorado. Se ele falha (sem rede), a página vai para /entrar e o porteiro (`src/proxy.ts:27`) devolve para a tela inicial, ainda logado. E a lista de envios e as anotações de envio ficam no navegador para quem entrar depois.
- **Cenário:** num computador compartilhado, a pessoa clica Sair com a rede caída, vê a tela de entrar piscar e voltar, e vai embora achando que saiu. A próxima pessoa usa o sistema com o login dela.
- **Gravidade:** baixa. **Confiança:** média.

## 13. Duplo clique cria duas pastas ou duas empresas

- **Arquivo:linha:** `src/components/pastas/CardsPasta.tsx:23` a `:28` (sem trava enquanto grava), `src/components/configuracoes/TelaConfiguracoes.tsx:21` a `:31` (a checagem de nome repetido usa a lista antiga da mesma renderização).
- **Defeito:** nenhum dos dois formulários trava o botão enquanto o pedido está no ar.
- **Cenário:** o Natham dá dois cliques rápidos em "Incluir" com "Lavoro Piu": entram duas empresas com o mesmo nome (ids diferentes) e o filtro passa a mostrar duas. Em "Criar pasta", o servidor pode recusar a segunda; se não recusar, ficam duas pastas no Drive.
- **Gravidade:** baixa. **Confiança:** média.

## 14. "Horário que ainda não passou" usa o relógio do computador, o banco usa o de Brasília

- **Arquivo:linha:** `src/components/ficha/Publicacao.tsx:77` (compara com `paraHora(new Date())`, hora local do navegador); no banco, `tarefas_alarmes` lê `postar_em` como `America/Sao_Paulo`.
- **Defeito:** com o computador em outro fuso (viagem, Manaus, fuso errado no Windows), a checagem aceita uma hora que, em Brasília, já passou, ou recusa uma que ainda vale.
- **Cenário:** o computador está em Manaus (1 h a menos). Às 10:30 de Brasília (9:30 lá), a pessoa programa para 10:00 e a tela aceita. O alarme é armado para um horário que já passou; o post sai na hora ou fica parado, conforme o alarme trate horário passado.
- **Gravidade:** baixa. **Confiança:** média.

---

**Total: 14 achados, 2 altos** (1 e 2), 5 médios (3 a 7) e 7 baixos (8 a 14).

## O que não cobri

- O código das funções do servidor (`drive`, `postar-meta`, `google-autorizar`) e as travas (RLS) linha por linha: olhei só `salvar_tarefa`, `postar_agora`, `tentar_de_novo` e os gatilhos de `tarefas`.
- `src/components/pastas/arte.ts`, `ArteCanvas.tsx`, `PastaDeVidro.tsx` (só desenho), `MenuPasta.tsx`, `MenuColuna.tsx`, `CardFlutuante.tsx` e os CSS.
- Componentes de `src/components/ui` (Selecao, CampoData, Marca) e `src/lib/filtro-empresa.ts`, usados pelas telas mas fora da minha área.
- `arvore.ts`, `pendentes.ts`, `postagens-planejadas.ts`, agenda e caderno da camada de dados.
- Nada foi reproduzido rodando o app: os cenários vêm da leitura do código e do banco.
