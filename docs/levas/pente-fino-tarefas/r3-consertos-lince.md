# Pente fino Tarefas, rodada 3: consertos do Lince

29/10/2026. Itens da conferência do Codex (`r2-codex.md`) e da rodada 3 do Ferreiro (`r3-ferreiro.md`) que são do Lince (telas e dados; SQL 041). F2 espera o Natham e não foi tocado.
Banco de produção só lido. Nada publicado, nada commitado, nenhum SQL aplicado. `npm run check` verde: lint sem erros, tipos, regras, 61 arquivos e 491 testes, build.

Cada item foi confirmado no código antes do conserto. Cada teste novo foi rodado contra o código de antes e falhou lá; a tabela diz quando a prova é outra.

| Item | Situação | Arquivos | Teste / prova |
|---|---|---|---|
| A1 (Codex) | Consertado (depende do SQL 041) | `supabase/041_postar_agora_devolve_versao.sql`, `src/lib/dados/versao-card.ts`, `src/lib/dados/repositorio.ts` | `versao-card.test.ts` |
| A7 (Codex) e Ferreiro 2 | Consertado, com o Bussola (SQL 038 dele) | `src/lib/dados/subindo.ts`, `src/lib/dados/envios.ts`, `src/lib/dados/drive.ts` | `envios-lista.test.ts`, `subindo.test.ts` |
| N3 | Consertado | `src/components/ficha/Ficha.tsx` | `provas/pente-fino-r3/n3-salvando-*` |
| N4 | Consertado | `src/lib/dados/ideias.ts`, `src/components/pastas/PrintsIdeia.tsx`, `src/components/pastas/MuralIdeias.tsx` | `ideias.test.ts` (r3 N4) |
| N5 | Consertado | `src/lib/dados/anexos.ts` | `anexos.test.ts` (r3 N5) |
| N6 | Consertado | `src/lib/dados/envios.ts` | `envios-aba.test.ts` (r3 N6 e aba duplicada) |
| Ferreiro 1 | Consertado | `src/components/conteudos/ficha-da-url.ts`, `src/components/conteudos/TelaConteudos.tsx`, `src/components/casca/AvisoEnvio.tsx` | `provas/pente-fino-r3/f1-*` |
| Ferreiro 3 | Consertado | `src/lib/dados/anexos.ts`, `src/lib/dados/envios.ts` | `anexos.test.ts` (r3 Ferreiro 3) |
| Ferreiro 4 | Consertado | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` (r3 Ferreiro 4) |
| Ferreiro 5 | Consertado | `src/components/entrar/convite.ts` (novo), `TelaNovaSenha.tsx`, `TelaEntrar.tsx` | `convite.test.ts`; `provas/pente-fino-r3/f5-*` |

## O que mudou, item por item

- **A1, "Postar agora" adotava a edição de outra pessoa.** Antes, a tela LIA o número de edição depois do "Postar agora" e o anotava como seu. Se outra pessoa mexesse no card nesse meio tempo, a ficha velha gravava por cima. Agora o próprio `postar_agora` (SQL 041) devolve o número de antes e o de depois da mudança dele, com a linha travada. A tela só adota o número se o "antes" for o que ela viu. Se outra pessoa mexeu, não adota, e o próximo Salvar da ficha avisa "Este card mudou". O "Tentar de novo" (037) não muda o card, então não há nada a anotar. Sem o 041, não anota nada (o Salvar pode avisar "mudou" depois de um "Postar agora"; nada é gravado por cima).
- **A7 e Ferreiro 2, marca de "vídeo novo pendente" com dois vídeos, ou com o card aprovado no meio do envio.** Contrato do 038 com o Bussola: cada vídeo marca o card com o id do SEU envio (`p_envio`) e o confirma com o mesmo id (`envio_id` no `confirmar_envio`). O banco guarda a lista em qualquer etapa e liga a marca quando o card entra em Aprovado com a lista não vazia. A marca só sai quando a lista esvazia. Sem o 038, a API não conhece `p_envio`: a tela pede a marca de novo sem ele (como antes). A remarcação do outro vídeo do mesmo card, depois que um chega, ficou e usa o id do próprio envio: com o 038 isso não duplica nada; sem ele, mantém a proteção de antes.
- **N3, digitar durante "Salvando..." perdia o texto.** A ficha trava os campos (e o título) enquanto grava. Se a gravação falha, eles voltam a funcionar. Optei por travar em vez de "gravar o texto final": a gravação leva o que estava na hora do clique, e travar deixa isso claro sem uma segunda gravação escondida.
- **N4, print que terminava de subir recriava a ideia apagada.** Colocar e tirar print agora muda SÓ a lista de prints de uma ideia que existe (`update`, nunca `upsert`). Se a ideia foi apagada (aqui ou por outra pessoa), ela sai da tela, o arquivo sai do armário e aparece "Esta ideia foi apagada; o print não foi guardado." O "tirar print" tinha o mesmo furo e usa o mesmo caminho.
- **N5, ordem das imagens antigas do Supabase.** A ordem nova do carrossel é gravada também para elas. O banco não deixa a tela mudar a coluna direto (conferido: o login só tem leitura e inclusão em `arquivos.ordem`), mas a função `drive` (`ordenar_anexos`) grava a ordem de qualquer arquivo do card.
- **N6, recarregar a própria aba escondia o envio interrompido.** O envio guardado com sinal de vida recente fica de lado ("suspeito"). Se o sinal vence (no máximo 30 s), vira "interrompido". Se a outra aba avisa que acabou (sinal negativo, gravado quando o envio chega, falha ou é descartado), some sem aviso. A aba duplicada continua sem mostrar como interrompido o envio vivo da outra (M7). **Muda na prática:** depois de recarregar no meio de um envio, o aviso "Envio interrompido" aparece em até 30 segundos, não na hora.
- **Ferreiro 1, ficha misturada na Esteira.**
  - A `<Ficha>` da Esteira ganhou `key` (o card): trocar de card monta uma ficha nova.
  - O endereço `?ficha=` é lido UMA vez, ao abrir a tela, e o pedido vale até o card chegar. Antes, toda mudança na contagem de cards relia o endereço e reabria o card dele.
  - "Abrir o card" no aviso de envio, já estando na Esteira, só avisa a tela e não navega (a navegação punha o `?ficha=` de volta).
- **Ferreiro 3, vídeo velho apagado no 2º salvar.** No 2º salvar com a ficha aberta, o vídeo novo ainda sobe pelo envio do 1º. Os vídeos velhos tirados da ficha vão para ESSE envio (`apagarQuandoChegar`) e só saem quando ele chega. Se o novo já chegou, saem na hora.
- **Ferreiro 4, "Parar" com 0 linhas.** 0 linhas apagadas só é recusa se a marca continua lá (a tela confere). Se ela já não existe (2º clique, outra aba parou), o selo sai sem erro.
- **Ferreiro 5, trocar a senha sem a atual.** "Escolha sua senha" só dispensa a senha atual na aba que chegou pelo link do convite ou do "esqueci a senha" (a tela de entrar marca isso ao criar a sessão do link). Com uma sessão comum, a tela vira "Trocar a senha" e pede a senha atual, conferida no Supabase antes da troca.

## Extra (para caber no limite de linhas, sem espremer)

- Saiu do `repositorio.ts` o caminho de reserva de antes do SQL 007 (gravar direto na tabela quando `salvar_tarefa` não existia). A função existe em produção (conferido na rodada 1). O reserva gravava só parte dos campos, e poderia passar por cima da conferência de versão se a API demorasse a enxergar o 040. Agora a falha aparece como "Não consegui salvar". `repositorio.ts`: 330 linhas.
- `ideias.ts`: `escrever` aceita o aviso como função (para dizer "ideia apagada" ou "não consegui").
- Nova frase da tela: 55006 (A6 do Bussola) = "Os arquivos deste card estão sendo apagados do Drive agora. Tente de novo em alguns minutos."

## Pendências e riscos

- **SQL não aplicados.** A1 depende do 041 (que depende do 040). A7 e o Ferreiro 2 dependem do 038 do Bussola e da função `drive` publicada com o `envio_id`.
- **041 troca o tipo de resposta do `postar_agora`** (de nada para `{ antes, depois }`): ele apaga a função e recria. Só a tela chama essa função (conferido no repositório).
- **N6:** o aviso de interrompido depois de recarregar demora até 30 s.
- **Ferreiro 1:** conferido na tela (prova); a lógica do endereço é de componente e não tem teste automático (o projeto não tem testes de tela).
- **N3:** conferido na tela (prova); sem teste automático pelo mesmo motivo.
