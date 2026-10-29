# Pente fino Tarefas, rodada 2: consertos do Lince

29/10/2026. Itens do território do Lince (Ficha, Esteira, Pastas e a camada de dados; SQL na faixa 040 e 041). F2 espera decisão do Natham e não foi tocado.
Banco de produção só lido. Nada publicado, nada commitado, nenhum SQL aplicado. `npm run check` verde: lint sem erros, tipos, regras, 58 arquivos e 477 testes, build.

Cada item foi confirmado no código antes do conserto. Cada teste novo foi rodado contra o código de antes e falhou lá; a tabela diz quando a prova é outra.

| Item | Situação | Arquivos | Teste / prova |
|---|---|---|---|
| F1 | Consertado (depende do 040) | `supabase/040_versao_do_card.sql`, `src/lib/dados/repositorio.ts`, `src/lib/dados/linha-tarefa.ts` | `repositorio-consertos.test.ts` (F1, 2 testes) |
| F6 | Consertado | `src/lib/dados/versao-card.ts`, `src/lib/dados/repositorio.ts` | `versao-card.test.ts` |
| F7 / B8 | Consertado (depende do 040) | `supabase/040_versao_do_card.sql`, `src/lib/dados/linha-tarefa.ts` | SQL: não rodei (banco só leitura). A frase da tela é coberta pelo `motivoDoBanco`. |
| B1 (tela) | Consertado, combinado com o Bussola (SQL 037 dele) | `src/components/ficha/Publicacao.tsx`, `src/components/ficha/postagem.ts`, `src/lib/dados/postagens.ts`, `src/lib/dados/linha-tarefa.ts`, `src/lib/dados/repositorio.ts` | `postagem.test.ts`, `postagens.test.ts`; `provas/pente-fino-r2-b1/` |
| B2 | Consertado | `src/components/ficha/anexos-vivos.ts` | `anexos-vivos.test.ts` |
| B3 | Consertado | `src/lib/dados/anexos.ts`, `src/lib/dados/envios.ts` | `anexos.test.ts` (r2 B3) |
| B4 | Consertado | `src/lib/dados/anexos.ts` | `anexos.test.ts` (r2 B4) |
| B5 | Consertado em parte | `src/lib/dados/ideias.ts` | `ideias.test.ts` (r2 B5) |
| B6 | Consertado em parte | `src/lib/dados/drive.ts` | `drive-confirmar.test.ts` |
| B7 | Consertado | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` (r2 B7) |
| B9 | Consertado | `src/proxy.ts`, `src/components/entrar/TelaEntrar.tsx` | `src/proxy.test.ts` |

## O que mudou, item por item

- **F1, ficha aberta ressuscitava card apagado.** O 040 agora recusa (código P0002) quando alguém salva com número de edição um card que não existe mais; ele não cai mais no INSERT. A tela manda o número sempre que a ficha é de um card que já existia (tem `id`), mesmo quando o tempo real já tirou o card da memória. Antes, sem o card na memória, a tela tratava o salvar como card novo. Aviso na tela: "Este card foi apagado enquanto você editava. O que você escreveu continua aqui: copie o que quiser guardar e feche a ficha." Card novo (sem id) e as cópias do ⋮ continuam sem número.
- **F7 / B8, card só de leitura dava "chave duplicada".** No 040, o "existe?" agora é conferido sem a trava de ALTERAR. Com o card visível mas só de leitura, o resultado é "sem permissão" (42501), e a tela mostra "Essa tarefa é só para olhar: você não pode mexer nela."
- **F6, "Postar agora" e "Tentar de novo" deixavam a ficha com o número velho.** Depois de mandar, a tela lê o número novo do card e o anota como mudança desta aba (a mesma corrente do A1). O Salvar seguinte da mesma ficha não é mais recusado por uma mudança que foi dela mesma. Limite: se outra pessoa mexeu no card no mesmo instante, essa mudança também conta como desta aba (escrito no código).
- **B1 (tela), card que perdeu a programação.** Contrato do 037 com o Bussola:
  - "Tentar de novo" não inventa mais a data.
  - Card Aprovado com erro mostra também o campo de data. O botão grava a data e as redes e depois chama `tentar_de_novo`: data passada sai na hora, data futura sai na hora marcada.
  - Sem data, a ficha pede "Escolha a data e a hora." (e o 55000 do banco vira essa mesma frase).
  - A confirmação do "estado incerto" ("Já olhei o perfil...") continua.
  - Rede na fila com a data ainda por vir aparece como "Programado", não "Postando". A Esteira também não fica relendo a cada 15 s por causa dela.
  - De quebra: a releitura chamava `tarefas.some(postando)`, que passava o índice da lista como se fosse a hora. Agora a chamada é explícita.
- **B2, anexo em dobro na ficha aberta.** O anexo que chega pelo card vivo só entra se a ficha ainda não tem aquele id. O salvar já põe o id novo no item da ficha, e por isso a foto entrava duas vezes.
- **B3, trocar o vídeo.** Quando a pessoa tira o vídeo velho e põe um novo (que sobe em segundo plano), o velho não é mais apagado no salvar: a fila de envios o apaga quando o novo CHEGA. Se o envio cair no meio, o card continua com o vídeo velho.
- **B4, carrossel com vídeo no meio.** Cada anexo guardado leva a posição que tem na ficha, a mesma que o vídeo em segundo plano recebe. A foto que vem depois do vídeo passa para a posição seguinte; antes, as duas ficavam com a mesma ordem.
- **B5, mural de ideias.** A leitura descartada por uma gravação agora é refeita: na hora, se a gravação já acabou, ou quando ela acaba. **Em parte:** a gravação da folha ainda manda a folha inteira. Se outra pessoa mexeu na mesma folha e a leitura nova ainda não chegou, o próximo campo mexido regrava o resto. Fechar isso pede um número de edição por ideia, como o A1 dos cards: mudança de banco, fora desta rodada.
- **B6, recusa do servidor ao confirmar o envio.** Qualquer recusa do servidor (4xx, menos 408 e 429) tira a anotação do envio e mostra o motivo dele (ex.: "Você não pode mexer nos anexos deste card."), em vez de "tente de novo" para sempre. **Em parte:** o arquivo que chegou ao Drive e foi recusado continua solto na pasta. Só o servidor pode mandá-lo para a lixeira, porque a tela não tem permissão (pendência para o Bussola, `drive/acoes.ts`).
- **B7, leitura dos cards atropelada por gravação já terminada.** A camada conta as gravações que terminam. A leitura que uma gravação atropelou é refeita na hora, se a gravação já acabou, ou quando ela acaba. A leitura atropelada só por outra leitura continua só descartada (vale a mais nova).
- **B9, convite com outra pessoa logada.** O porteiro (`proxy.ts`) não manda mais quem está logado para fora de `/entrar`, porque ele não enxerga o `#access_token=...` do convite. A tela de entrar decide: com convite, cria a sessão do convidado e vai para "Escolha sua senha"; sem convite e já logado, vai para dentro (o que o porteiro fazia). **Muda na prática:** abrir o convite do Lucas no computador do Natham troca a sessão para a do Lucas, e o Natham precisa entrar de novo depois.

## Combinado com o Bussola (servidor, não publicado)

- **037 (B1):** regra do `tentar_de_novo` acima.
- **F4:** a troca de capa responde o MESMO `arquivo_id` da capa velha. A tela aguenta: a capa velha não é apagada pela tela, e a nova entra com o id que voltar.
- **F10:** `confirmar_envio` grava o tipo real do arquivo. Capa que não é imagem volta 422 "A capa precisa ser uma imagem.", que a tela mostra pelo B6.

## Pendências e riscos

- **040 e 037 não aplicados.** F1 e F7/B8 só valem com o 040; B1 só fica completo com o 037 e com a função `drive` publicada.
- **B5:** gravação da folha inteira (falta número de edição por ideia).
- **B6:** arquivo recusado fica solto no Drive (servidor).
- **F6:** a mudança de outra pessoa no mesmo instante do "Postar agora" pode ser contada como desta aba.
- **Prova de tela:** só o B1 mudou o que se vê (`provas/pente-fino-r2-b1/`: o erro e a data perdida são simulados no navegador, porque o banco falso não tem esse estado). B9, B2 e os outros não mudam a tela e foram conferidos por teste.
