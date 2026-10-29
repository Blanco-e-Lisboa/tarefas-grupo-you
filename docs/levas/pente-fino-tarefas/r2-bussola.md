# Pente fino Tarefas, rodada 2: telas Conteúdos, Ficha, Pastas, Configurações, Entrar, Casca e os dados delas (Bussola)

29/10/2026. Só leitura do código atual (consertos da rodada 1 no lugar, sem commit; SQL 034+ ainda não aplicados). Nada editado, nada escrito no banco.
Achados da rodada 1 não se repetem aqui, a não ser quando o conserto deixou um furo novo (marcado "regressão").

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

---

## 1. Card que perdeu a programação no meio só oferece "Tentar de novo", que agora posta NA HORA (regressão do M13)

`src/components/ficha/Publicacao.tsx:125-131` com `supabase/034_postagem_destrava_e_trava_empresa.sql` (M13 e `tentar_de_novo`) e `supabase/034...:alarme_tocou`

- Defeito: o 034 transforma em erro "estado incerto" a linha que estava indo para a Meta quando o card sai de Aprovado. Quando o card volta a Aprovado, essa linha de erro continua lá. A Publicação, com erro, mostra só "Já olhei o perfil: tentar de novo" e esconde a data e o "Programar". E o `tentar_de_novo` do 034, em card sem data, põe a data de AGORA. Do lado do banco, o alarme também não posta enquanto houver só linhas de erro: programar uma data nova não adiantaria.
- Cenário (o caso Nicolas de 28/10): o Reels está processando na Meta; o Natham devolve para Edição para trocar o vídeo; depois aprova de novo e quer programar para sexta 18h. A ficha não mostra campo de data, só "tentar de novo"; clicando, o post sai na mesma hora, não na sexta. Não há caminho na tela para programar uma data.
- Gravidade: média. Confiança: alta (leitura do código da tela e do 034; não rodei).

## 2. Anexo aparece duas vezes na ficha que continua aberta depois de salvar, e isso trava o "Programar"

`src/components/ficha/anexos-vivos.ts:125-130`, `src/lib/dados/anexos.ts:119`, `src/components/ficha/Ficha.tsx:113` e `:122-127`

- Defeito: ao subir uma imagem, o salvar põe o id novo no próprio item da ficha (`Object.assign(a, novo, ...)`). O `useArquivosQueChegam` só conhece os ids que existiam quando a ficha abriu; quando o card vivo recebe a imagem nova (com o mesmo id), ele a acrescenta outra vez, sem conferir se a ficha já tem esse id.
- Cenário: o Matheus abre um card de Post em "Em análise", anexa a imagem final e clica "Aprovar" (a ficha continua aberta depois de aprovar). A imagem aparece duas vezes. Na Publicação, "Programar postagem" responde "Post leva 1 imagem." (conta 2). Também acontece depois de "Consertar" e quando o Drive falha ao mover a pasta (a ficha fica aberta com o aviso). Fechar e abrir a ficha resolve, mas ninguém sabe disso.
- Gravidade: média. Confiança: alta (leitura; não rodei no navegador).

## 3. Trocar o vídeo: o antigo vai para a lixeira antes de o novo subir

`src/lib/dados/anexos.ts:93` e `:123`

- Defeito: vídeo novo sobe em segundo plano (`enviarEmSegundoPlano` devolve na hora), mas o laço segue e `apagarAnexos(saiu)` apaga logo o que a pessoa tirou da ficha. O M14 da rodada 1 garante "o que saiu só se apaga depois de o novo subir" só para foto e capa; para vídeo, não.
- Cenário: card em Edição; o Adrian tira o vídeo velho (×), põe o novo e salva. O velho vai para a lixeira do Drive e a linha some na hora. O novo leva 10 minutos para subir; ele fecha a aba no meio (ou a internet cai). O card fica sem vídeo nenhum; o velho só volta pela lixeira do Drive, à mão.
- Gravidade: média. Confiança: alta.

## 4. Carrossel com vídeo novo no meio sai fora de ordem

`src/lib/dados/anexos.ts:93`, `:125` e `:128`

- Defeito: o vídeo em segundo plano recebe a posição dele na lista da ficha (`ordem: i`), mas ele não entra em `guardados`; as outras fotos são renumeradas pela posição em `guardados`, que pula o vídeo. Dois itens ficam com a mesma `ordem`, e o banco desempata pela data de criação (o vídeo, mais novo, vai para o fim).
- Cenário: carrossel [Foto A, Foto B]. O Matheus arrasta um vídeo novo para o meio: [A, Vídeo, B]. O vídeo é gravado com ordem 1; a Foto B continua com ordem 1. Quando o vídeo chega, o carrossel no Instagram sai [A, B, Vídeo].
- Gravidade: média. Confiança: média-alta (leitura; a ordem final depende do desempate do banco, que é a data de criação).

## 5. Mural de ideias: leitura descartada não é refeita, e a gravação da folha inteira desfaz a edição de outra pessoa

`src/lib/dados/ideias.ts:105` e `:130`

- Defeito: `carregarIdeias` descarta a leitura se havia gravação pendente ou se uma gravação começou no meio (`pendentes`/`geracao`), mas não agenda outra leitura (o repositório tem `relerDepois`; aqui não há). Toda gravação de ideia manda a folha INTEIRA (título, texto, links, prints) a partir da cópia da tela.
- Cenário: o Natham cola um print numa folha (sobe a imagem e grava). Enquanto grava, o Matheus muda o título dessa mesma folha; o aviso do tempo real chega no meio da gravação do Natham e a leitura é descartada. Se o eco da própria gravação do Natham chegar antes de ela terminar (ou o tempo real estiver caído), a tela dele fica com o título velho. A próxima coisa que o Natham mexer na folha (um link, o detalhe) regrava o título velho por cima do do Matheus.
- Gravidade: média. Confiança: média (o eco do tempo real da própria gravação costuma refazer a leitura e fechar a janela; o furo é quando ele chega cedo ou não chega).

## 6. Recusas do servidor na confirmação do envio viram "tente de novo" e o arquivo fica solto no Drive

`src/lib/dados/drive.ts:74-75` (e `:283-284`, documento solto)

- Defeito: só 410 e 422 descartam a anotação e mostram a mensagem do servidor. Qualquer outra recusa (403 "Você não pode mexer nos anexos deste card.", 409 "O anexo a trocar não é deste card.") vira "Não deu para confirmar o envio, tente de novo." e a anotação fica: cada nova tentativa repete a mesma recusa, e o arquivo já enviado ao Drive nunca é registrado nem vai para a lixeira.
- Cenário: alguém sobe uma foto num card; no meio do envio, o card é aprovado por outra pessoa e passa a aceitar anexo só de quem aprova. A confirmação volta 403; a tela diz "tente de novo" para sempre e a foto fica perdida na pasta do Drive, sem linha no banco. (Hoje todo login aprova, então o caso real é raro; volta a valer quando o Lucas ganhar login.)
- Gravidade: baixa. Confiança: alta.

## 7. Leitura dos cards que cruzou uma gravação já terminada é descartada sem reler

`src/lib/dados/repositorio.ts:112` e `:117`

- Defeito: a leitura que começou antes de uma gravação e terminou depois é descartada (`n !== leitura`). Se a gravação já acabou (`escrevendo` = 0), `relerDepois` fica falso e ninguém relê. Mesmo padrão do achado 5.
- Cenário: o tempo real avisa uma mudança do Matheus; durante essa leitura, o Natham arrasta outro card (gravação curta). A leitura com a mudança do Matheus é jogada fora e a tela do Natham fica sem ela até o próximo aviso ou até voltar para a aba.
- Gravidade: baixa. Confiança: média (o eco do tempo real da gravação do Natham normalmente relê).

## 8. Com o 040: card só de leitura cai no INSERT e o erro vira "Não consegui salvar"

`supabase/040_versao_do_card.sql:51-52` (usado pelo `repositorio.ts:172`)

- Defeito: `select ... for update` numa função que roda com o login de quem chama também exige a regra de ALTERAR. Para um card que a pessoa só pode ler, a linha não aparece, o `found` é falso e a função tenta INSERIR um card com o mesmo id: erro de chave duplicada, em vez de "sem permissão". Antes do 040 era "sem permissao para alterar a tarefa".
- Cenário: hoje a tela barra antes (`podeAlterar`), então só aparece por chamada direta ou se a regra da tela e a do banco divergirem. A mensagem fica errada e o código de erro muda.
- Gravidade: baixa. Confiança: média (regra do Postgres para `FOR UPDATE` com RLS; não rodei).

## 9. Convite aberto num navegador onde outra pessoa já está logada se perde

`src/proxy.ts:31-36` com `src/components/entrar/TelaEntrar.tsx:26-36`

- Defeito: com sessão, o porteiro manda `/entrar` para `/`; o endereço do convite (`#access_token=...`) nunca chega à tela de entrar, e a senha não é definida.
- Cenário: o Natham, logado no computador do escritório, abre o e-mail de convite do Lucas para ajudar. Cai na Esteira do Natham; o link do convite foi gasto ou fica sem efeito; o Lucas não consegue criar a senha.
- Gravidade: baixa. Confiança: média (o fragmento `#...` costuma ir junto no redirecionamento; mesmo assim a tela `/` não o lê).

---

## O que não cobri

- Não rodei nada no navegador nem nos testes: tudo é leitura. Os achados 2, 3 e 4 seriam os primeiros a provar com um teste de camada (`anexos.ts`) antes de consertar.
- Não li a fundo: `PastaDeVidro.tsx`, `ArteCanvas.tsx`, `arte.ts`, `Menu.tsx`, `TagsFicha.tsx`, `CapaQuadro.tsx`, `TituloFicha.tsx`, `ficha-da-url.ts` e os `.css`.
- Calendário, Tarefas, Mapa e Caderno ficaram fora (outra área), inclusive as gravações da pauta.
- Não conferi o comportamento real do Google Drive (tipos de arquivo, lixeira herdada) nem o tempo real do Supabase (ordem entre o eco e a resposta da gravação), que decidem a confiança dos achados 5 e 7.
