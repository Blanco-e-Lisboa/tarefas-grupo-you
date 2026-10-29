# Pente fino Tarefas, rodada 1: consertos do Lince

29/10/2026. Itens da `r1-lista.md` do território do Lince (Ficha, Esteira, Pastas, Configurações, Entrar, Casca, anexos, envios, ideias, repositorio.ts), mais o B8, que o Ferreiro pediu.
Banco de produção só lido. Nada publicado, nada commitado. `npm run check` passando (lint sem erro, tipos, regras, 51 arquivos e 436 testes, build).

Cada item foi confirmado no código antes do conserto. Os testes novos foram rodados contra o código antigo e falharam lá (os 6 do repositorio-consertos.test.ts conferidos trocando o repositorio.ts pela versão do último commit).

| Item | Situação | Arquivos | Teste / prova |
|---|---|---|---|
| A1 | Consertado (depende do SQL 040, **não aplicado**) | `supabase/040_versao_do_card.sql`, `src/lib/dados/repositorio.ts`, `src/lib/dados/linha-tarefa.ts`, `src/lib/dados/tipos.ts`, `src/components/ficha/Ficha.tsx` | `repositorio-consertos.test.ts` (A1, 2 testes) |
| A3 | Consertado | `src/components/pastas/MuralIdeias.tsx`, `src/components/pastas/folha.ts` | `folha.test.ts`; `provas/pente-fino-a3/` |
| M1 (tela) | Consertado | `src/components/ficha/postagem.ts`, `src/components/ficha/Publicacao.tsx`, `src/lib/dados/linha-tarefa.ts` | `postagem.test.ts`; `provas/pente-fino-m1/` |
| M7 | Consertado | `src/lib/dados/envios.ts` (só o topo; o resto é do Bussola, A7) | `envios-aba.test.ts` |
| M8 | Consertado | `src/lib/dados/anexos.ts` | `anexos.test.ts` |
| M9 | Consertado | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` |
| M10 | Consertado | `src/lib/dados/anexos.ts`, `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` |
| M11 | Consertado | `src/components/ficha/Anexos.tsx`, `src/components/ficha/Ficha.tsx` | `provas/pente-fino-m20/` (0 envios depois de Descartar) |
| M14 | Consertado | `src/lib/dados/anexos.ts`, `src/lib/dados/drive.ts` | `anexos.test.ts` |
| M18 | Consertado | `src/components/ficha/postagem.ts`, `src/components/ficha/Publicacao.tsx` | `postagem.test.ts` |
| M20 (tela) | Consertado | `src/components/ficha/taxa-video.ts`, `src/components/ficha/Anexos.tsx` | `taxa-video.test.ts`; `provas/pente-fino-m20/` |
| M21 | Consertado | `src/lib/dados/ideias.ts`, `src/components/pastas/PrintsIdeia.tsx` | `ideias.test.ts` (M21) |
| B7 | Consertado | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` |
| B8 (pedido do Ferreiro) | Consertado | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` |
| B12 | Consertado | `src/components/conteudos/TelaConteudos.tsx` | sem teste (relógio da tela: confere o dia a cada minuto) |
| B13 | Consertado | `src/components/pastas/TelaPastas.tsx` | `provas/pente-fino-b13/` (Tipo oferece só Roteiro, Gravação, Edição, Postagem) |
| B14 | Consertado | `src/components/casca/BotaoSair.tsx` | sem teste automático (depende do Supabase de verdade) |
| B15 | Consertado | `src/components/pastas/CardsPasta.tsx`, `src/components/configuracoes/TelaConfiguracoes.tsx` | `provas/pente-fino-b15/` |

Nenhum item ficou "não confirmado". O SQL 041 não foi usado.

## O que mudou, item por item

- **A1, ficha velha por cima.** Cada card ganha um número de edição (`versao`). Ele sobe sozinho quando muda algo que a ficha grava: título, etapa, notas, data do post, legenda, tags etc. A marca de vídeo pendente, a linha e a cor do Caderno não sobem o número. O `salvar_tarefa` novo recebe o número que a tela viu e recusa com 40001 se o do banco for outro. A tela mostra: "Este card mudou enquanto você editava (outra pessoa ou a postagem automática). O que você escreveu continua aqui: copie o que quiser guardar, feche e abra o card de novo." A ficha fica aberta com o rascunho. Dois salvar seguidos da mesma aba não se recusam entre si: a camada guarda o número que o 1º deixou e manda esse no 2º. **Antes de colar o 040, nada muda:** a tela só manda o número quando a coluna existe.
- **A3, mural.** O campo só grava ao sair se a pessoa digitou algo desde que entrou nele. A mudança de outra pessoa passa a aparecer nos campos que não estão em uso.
- **M1 (tela).** O bloco Publicação de card da Tu Ecom ou da Beec diz: "Só a You programa postagem. Card da Tu Ecom ou da Beec: publique nas redes você mesmo e arraste o card para Postado." O card da Esteira diz: "Só a You programa: publique e arraste para Postado". A recusa da trava do banco do Bussola (código 22023) vira frase em português. Combinado com o Bussola: a trava só recusa quando a data muda; salvar sem mexer na data passa.
- **M7.** A lista de envios fica guardada por aba (`sessionStorage`), não mais no navegador todo.
- **M8.** O mesmo arquivo que ainda está subindo não sobe de novo: o segundo salvar espera o mesmo envio.
- **M9.** Os anexos sobem fora da trava de leitura. A tela continua recebendo o que os outros mudam durante um envio longo, e o anexo que ainda sobe continua aparecendo.
- **M10.** Se a leitura dos anexos falha, os cards mantêm os anexos que já tinham, e aparece o aviso "Não consegui ler os anexos dos cards agora...". Apagar um card que o banco diz ter anexo vai pelo caminho que tira os arquivos junto, em vez de dar a mensagem errada de aprovação.
- **M11.** O vídeo escolhido na ficha só entra na fila de envio ao clicar Salvar. "Descartar alterações" não sobe nada. **Muda na prática:** antes, num card já existente, o vídeo começava a subir assim que era escolhido; agora começa no Salvar e continua em segundo plano depois que a ficha fecha.
- **M14.** Ao trocar a capa, a capa velha só é apagada depois que a nova chegou ao Drive, logo antes de a nova ser registrada (o banco aceita uma capa por card). Os outros anexos tirados também só saem depois que os novos subiram. Se o envio falhar, nada some.
- **M18.** "Horário que ainda não passou" e o dia mínimo do campo de data usam a hora de Brasília, a mesma que o banco usa.
- **M20 (tela).** Ao anexar um vídeo, o navegador lê a duração e a ficha avisa em vermelho quando a taxa média passa de 25 Mbps. Na prova, um vídeo de 72 Mbps gerou o aviso. É só aviso: o vídeo continua anexado.
- **M21.** Tirar um print só apaga o arquivo depois de o banco guardar a folha sem ele. Apagar a ideia apaga os prints dela depois de o banco confirmar.
- **B7.** Um salvar que falha só desfaz a tela se ela ainda mostra o que ele pôs. Depois de uma falha, a tela relê o banco.
- **B8.** "Parar" que a trava do banco barra (0 linhas, sem erro) agora mantém a marca e avisa. Limite conhecido: se a marca já tinha sido tirada em outra aba, também aparece o aviso.
- **B12.** O "hoje" da Esteira é conferido a cada minuto.
- **B13.** Pelas Pastas, a ficha abre em "só olhar" para quem não pode mexer, e o Tipo oferece só os tipos de card.
- **B14.** Se o "sair" do servidor falha (sem internet), a sessão sai pelo menos deste navegador. A lista de envios da aba e as anotações de envio ao Drive são apagadas ao sair.
- **B15.** "Criar pasta", "Renomear" e "Incluir empresa" travam enquanto gravam ("Salvando...", "Incluindo...").

## Arquivos novos

- `src/lib/dados/linha-tarefa.ts`: tradução linha do banco <-> card e as frases das recusas. Saíram do repositorio.ts para ele caber no limite de 350 linhas; o repositorio.ts reexporta tudo, então quem importa não muda.
- `src/lib/dados/versao-card.ts`: a corrente do número de edição do A1 (um salvar por card de cada vez, com o número que o anterior deixou). Saiu do repositorio.ts (agora com 342 linhas).
- `src/lib/dados/envio-em-partes.ts`: o protocolo do envio retomável do Drive (`enviarEmPartes`, `ondeParou`), sem estado. Saiu do drive.ts (agora com 309 linhas), que o reexporta; os testes da função drive continuam importando de `drive`.
- `src/components/ficha/taxa-video.ts`, `src/components/pastas/folha.ts`.
- Testes: `src/lib/dados/repositorio-consertos.test.ts`, `src/lib/dados/anexos.test.ts`, `src/lib/dados/envios-aba.test.ts`, `src/components/ficha/taxa-video.test.ts`, `src/components/pastas/folha.test.ts`. Também foram acrescentados casos em `ideias.test.ts` e `postagem.test.ts`.
- Provas: `provas/pente-fino-m20/fotos.mjs` (gera todas as capturas na cópia de exemplo) e as pastas `pente-fino-m20`, `-m1`, `-b13`, `-b15` e `-a3`.

## Pendências e riscos

- **040 não aplicado.** Sem ele o A1 não vale. Ao colar, o `salvar_tarefa` muda de forma (ganha `p_versao` e devolve o número): o arquivo apaga a versão antiga e recria. O app atual continua funcionando antes e depois.
- **A1 sem captura de tela:** o banco falso da cópia de exemplo não tem a coluna `versao`. A prova é o teste.
- **A1 não junta as edições:** quando o card mudou, a pessoa copia o que escreveu e reabre. Não há botão de "gravar por cima".
- **B2 (aviso do Bussola):** criar e renomear Tema agora volta 403 para o Adrian. A tela já mostra a mensagem do servidor no campo Tema e nas Pastas. Não escondi os botões, porque o B2 está marcado como "espera decisão" na minha ordem.
- **Não conferido em navegador real:** B12, B14, M7, M8, M9, M10 e M14 foram conferidos por teste e não em navegador real.

## Correções após o Codex

Conferência: `r1-conferencia-codex.md`. Concordei com todos os apontamentos do meu território e corrigi todos; não há discordância a registrar.
Cada teste novo foi rodado contra o código de antes da correção e falhou lá, exceto os dois indicados na tabela. `npm run check` verde: lint sem erros, tipos, regras, 53 arquivos e 453 testes, build.

| Item | O que estava errado | Correção | Arquivos | Teste |
|---|---|---|---|---|
| Bug novo 4 / A1 | Salvar sem mudança devolve o mesmo número (5 -> 5); a tela anotava "5 leva a 5" e o salvar seguinte girava para sempre. | Só anota quando o número sobe. | `src/lib/dados/versao-card.ts` | `repositorio-consertos.test.ts` ("salvar sem mudança... não trava"). Sem a correção ele não falha, ele trava; o Codex reproduziu a trava. |
| Bug novo 2 / A7 | Dois vídeos do mesmo card: o 1º chega e o banco tira a marca "vídeo pendente"; o 2º seguia subindo sem a marca. | Quando um vídeo chega e ainda há outro vídeo do mesmo card na fila, a marca é pedida de novo na hora; o que espera usa essa marca nova. A marca só sai de vez quando o último chega. | `src/lib/dados/envios.ts` (`rodar`; combinado com o Bussola, que fez o A7) | `envios-mesmo-card.test.ts` |
| Bug novo 3 / M14 | A tela apagava a capa velha antes de registrar a nova. Sendo o último arquivo do card, `apagar_anexo` mandava para a lixeira a pasta, com a capa nova já dentro. | A tela não apaga mais a capa velha do Drive: manda `substitui_arquivo_id` no `confirmar_envio`. O servidor (Bussola, `drive/acoes.ts`) confere a nova, só então tira a velha (mesmo card e mesmo papel, senão 409) e não mexe na pasta. Capa no Supabase (card sem empresa) continua saindo logo antes de a nova ser registrada. | `src/lib/dados/anexos.ts`, `src/lib/dados/drive.ts`; servidor: `supabase/functions/drive/acoes.ts` (Bussola) | `anexos.test.ts` (M14) |
| Bug novo 6 / M9 | O fim do envio trocava a lista inteira de anexos do card pela lista daquele salvar; o anexo que chegou durante o envio (de outra pessoa) sumia da tela. | Ao terminar, a lista nova é a deste salvar mais o que chegou durante ele (ids que este salvar não viu). | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` ("o fim do envio não apaga...") |
| M7 | Aba duplicada (ou aberta a partir de outra) ganha uma cópia da lista da aba de origem e mostrava como "interrompido" um envio vivo. | Cada aba com envio no ar dá um sinal de vida a cada 10 s no navegador (`grade:envios-vivos`). Envio que ainda dá sinal (menos de 30 s) não entra como "interrompido" na cópia; o que parou de dar sinal entra. | `src/lib/dados/envios.ts` (só o topo) | `envios-aba.test.ts` (aba duplicada) |
| M21 | Apagar print não conferia a resposta do armário (Storage) nem tentava de novo. | `apagarPrints` confere a resposta; o que não saiu fica anotado no navegador (`grade:prints-a-apagar`) e sai na próxima leitura do mural ou no próximo print apagado. | `src/lib/dados/ideias.ts` | `ideias.test.ts` (M21, conferência do Codex) |
| B14 | Sair limpava só a aba onde a pessoa clicou; as outras abas seguiam com a lista e os envios na memória. | Sair deixa um recado no navegador (`grade:saiu`); as outras abas ouvem, limpam o que é delas e voltam para a tela de entrar. A limpeza agora também apaga os sinais de vida dos envios. | `src/components/casca/sair.ts` (novo), `src/components/casca/BotaoSair.tsx` | `sair.test.ts`. Código novo: não há versão antiga para falhar. |

### Riscos destas correções

- **M14 depende da função `drive` publicada com o `substitui_arquivo_id`.** Com a função antiga no ar, trocar uma capa do Drive é recusado com "Este card já tem capa. Tire a atual antes." (409). Nada se perde, mas a troca não acontece até a publicação.
- **A7:** entre o 1º vídeo chegar (o banco tira a marca) e a marca nova voltar, há o tempo de uma chamada ao banco, menos de 1 s. Só fecharia de vez se a regra morasse no banco: a marca contaria os envios abertos do card.
- **B14:** a aba que está subindo um vídeo, ao receber o recado de saída, recarrega. O navegador pode perguntar "Sair do site?" por causa do envio no ar.
