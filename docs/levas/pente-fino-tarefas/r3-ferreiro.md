# Pente fino Tarefas, rodada 3 (Ferreiro): Conteúdos, Ficha, Pastas, Casca, Entrar

Área: `src/components/conteudos`, `src/components/ficha`, `src/components/pastas`, `src/components/casca`, `src/components/entrar`, `src/proxy.ts` e a camada de dados que elas usam (`repositorio.ts`, `versao-card.ts`, `linha-tarefa.ts`, `anexos.ts`, `envios.ts`, `subindo.ts`, `drive.ts`). Código atual, com os consertos das rodadas 1 e 2 ainda sem commit. Só leitura: nada editado. No banco de produção só li a definição viva de `marcar_video_pendente`. Não repeti o que já está em `r1-lista.md`, nos `r2-*.md` e na `r2-codex.md`.

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

## Alta

### 1. A Esteira reabre sozinha o card do aviso "Abrir o card" e mistura duas fichas: a lixeira apaga um card e o "Postar agora" posta outro
`src/components/conteudos/ficha-da-url.ts:302`, `src/components/casca/AvisoEnvio.tsx:43`, `src/components/conteudos/TelaConteudos.tsx:244`
- Defeito, em três peças:
  - (a) "Abrir o card" do aviso de envio interrompido é um `Link` para `/conteudos?ficha=<id>` que também dispara o evento. Já estando na Esteira, o evento abre a ficha e limpa o endereço (`replaceState`), e logo depois a navegação do `Link` põe `?ficha=<id>` de volta no endereço.
  - (b) `useFichaDaUrl` roda de novo sempre que muda `tarefas.length` e abre o card que estiver no endereço.
  - (c) Na Esteira a `<Ficha>` não tem `key`. Trocar `aberta` com uma ficha aberta deixa o rascunho (`t`) do card velho com a `tarefa`, o `viva` e a lixeira do card novo.
- Cenário: Matheus clica "Abrir o card" no aviso do vídeo interrompido do card X, fecha a ficha de X e segue trabalhando na Esteira. Abre a ficha do card Y. Natham cria um card em outro computador; o tempo real muda a contagem de cards e a Esteira chama `setAberta(X)` com a ficha de Y aberta. A ficha passa a mostrar o rascunho de Y, mas:
  - a lixeira apaga X (`removerTarefa(tarefa.id)`);
  - o bloco Publicação mostra X; "Programar" grava em Y a data escolhida (o `gravar` salva o `t` de Y);
  - "Postar agora" posta X (`postarAgora(salvo.id)`).
  Sem ficha aberta, a de X só pula de volta na tela sem ninguém ter pedido.
- Gravidade: alta (pode apagar ou postar o card errado). Confiança: média (lido no código; não reproduzi a navegação do `Link` na mesma rota).

### 2. Vídeo novo enfileirado antes de o card ser aprovado não segura o post: sai o vídeo antigo
`src/lib/dados/envios.ts:76` e `:55`, com `marcar_video_pendente` (banco vivo: `... where id = p_tarefa and etapa = 'aprovado'`)
- Defeito: a marca "vídeo novo pendente" é pedida uma vez, ao enfileirar (e de novo ao começar, com a mesma promessa). Se o card ainda está em Edição ou Em análise, o banco não marca nada e não dá erro. Quando o card entra em Aprovado com o envio ainda na fila ou subindo, ninguém marca. O bloqueio da Publicação (`subindo`) só existe na aba que está enviando.
- Cenário: Matheus troca o vídeo de um Reels em Análise pelo legendado de 900 MB e salva; o envio leva 15 minutos. Natham, no computador dele, abre o card, aprova e clica "Postar agora". O banco não tem marca, a catraca pega o vídeo que está no card (o antigo, sem legenda) e posta.
- Gravidade: alta. Confiança: alta no mecanismo. O conserto do A7 em andamento (038, ainda não está no disco) muda essa marca; vale conferir se ele cobre o card que entra em Aprovado no meio do envio.

## Média

### 3. r2 B3 (vídeo velho só sai quando o novo chega) não vale no segundo salvar com a ficha aberta
`src/lib/dados/anexos.ts:94` a `:97` e `:129` a `:130`
- Defeito: o vídeo velho fica a salvo porque o seu id vai para `apagarDepois` dentro de `subirUm`. No segundo salvar da mesma ficha, o vídeo novo ainda está pendente, e `subirUm` não roda (o M8 reaproveita o envio que já está no ar). Assim `apagarDepois` continua com o id do velho, `esperam` fica vazio, e `apagarAnexos` manda o velho para a lixeira na hora, antes de o novo chegar.
- Cenário: card Em análise. Natham tira o vídeo, põe o legendado e clica "Aprovar"; a ficha fica aberta, porque decidir grava sem fechar. Ele corrige a descrição e clica Salvar: o vídeo velho vai para a lixeira do Drive. A internet cai no meio do envio do novo, e o card Aprovado fica sem vídeo nenhum.
- Gravidade: média. Confiança: média (caminho lido, não reproduzido).

## Baixa

### 4. Regressão do B8: "Parar" duas vezes, ou numa aba atrasada, mostra erro e devolve o selo
`src/lib/dados/repositorio.ts:372` e `:373`
- Defeito: agora 0 linhas apagadas é tratado como recusa da trava. Só que 0 linhas também é o caso normal "a marca já não existe": outra aba já parou, a tarefa foi apagada e a marca saiu junto, ou o segundo clique chegou depois do primeiro.
- Cenário: Natham clica "Parar" duas vezes rápido na ficha. O primeiro apaga a marca; o segundo apaga 0 linhas, mostra "Não consegui tirar a marca. Tente de novo." e põe na tela o `fazendo` de antes. Numa segunda aba que ainda mostra o selo, "Parar" dá o mesmo erro, e o selo só some recarregando.
- Gravidade: baixa. Confiança: alta.

### 5. Quem está logado troca a senha sem digitar a atual
`src/components/entrar/TelaNovaSenha.tsx:83` a `:93`, com `src/proxy.ts:20` (`/entrar/*` é público)
- Defeito: a tela de nova senha aceita qualquer sessão (`getSession`) e chama `updateUser({ password })`. Não há pedido da senha atual nem confirmação por e-mail.
- Cenário: o Matheus deixa o computador da agência logado e sai. Alguém abre `/entrar/nova-senha`, define uma senha nova e o Matheus fica sem acesso à própria conta (o "esqueci a senha" depende de o Natham mandar convite).
- Gravidade: baixa para média (segurança, precisa de acesso ao computador logado). Confiança: alta no código. Não conferi se o Supabase do projeto está com "Secure password change" ligado; se estiver, ele mesmo pede confirmação.

## O que não cobri
- `MuralIdeias.tsx`, `PrintsIdeia.tsx`, `ideias.ts`, `arvore.ts` e `CardsPasta.tsx` só por cima: a r2 do Lince e a r2 do Codex já passaram pelo mural e pelos prints.
- `PastaDeVidro.tsx`, `ArteCanvas.tsx`, `arte.ts` (desenho), `Menu.tsx`, `EmConstrucao.tsx`, `CartaoEntrar.tsx`: não li a fundo.
- `CampoOcasiao.tsx`, `TagsFicha.tsx`, `CapaQuadro.tsx`, `LinksDrive.tsx`, `TituloFicha.tsx`: só por cima.
- O A7 (038) e o 041 estão sendo feitos agora por outros terminais; o achado 2 depende do que o 038 fizer.
- Nada foi reproduzido rodando o app; os cenários vêm da leitura do código.
