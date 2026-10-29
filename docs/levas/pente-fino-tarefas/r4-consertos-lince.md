# Pente fino Tarefas, rodada 4: consertos do Lince

29/10/2026. Itens do `r3-codex.md` que são do Lince (telas e dados), a tela do F2 (b) com o Bussola e a auditoria da regra do Natham (economizar execuções).
Banco de produção só lido (duas consultas: métodos de entrada em `auth.mfa_amr_claims` e gatilhos que tocam o sino). Nada publicado, nada commitado, nenhum SQL novo (a faixa 045 e 046 não foi precisa). `npm run check` verde: lint sem erros (19 avisos, os mesmos de antes), tipos, regras, 61 arquivos e 506 testes (numa primeira rodada falhou 1 teste da função `drive`, que o Bussola editava naquela hora; a rodada seguinte passou inteira), build.

Cada teste novo foi rodado contra o código sem o conserto e falhou lá (voltando só a linha consertada).

| Item | Situação | Arquivos | Teste / prova |
|---|---|---|---|
| N3 | Consertado | `src/components/ficha/Ficha.tsx` | `provas/pente-fino-r4/n3-organizando-pasta-*` |
| Ferreiro 5 | Consertado | `src/components/entrar/convite.ts`, `TelaNovaSenha.tsx`, `TelaEntrar.tsx` | `convite.test.ts`; `provas/pente-fino-r4/f5-senha-atual-*` |
| Novo 2 | Consertado | `src/lib/dados/ideias.ts` | `ideias.test.ts` (r4 novo 2) |
| Novo 3 (tela) | Consertado (com o 039 do Bussola) | `src/lib/dados/envios.ts`, `src/lib/dados/subindo.ts`, `src/components/casca/AvisoEnvio.tsx` | `envios-aba.test.ts` (r4 novo 3, dois testes) |
| Novo 4 | Consertado | `src/components/ficha/anexos-vivos.ts` | `anexos-vivos.test.ts` (r4 novo 4) |
| Novo 5 | Consertado | `src/lib/dados/repositorio.ts` | `repositorio-consertos.test.ts` (r4 novo 5) |
| F2 (b), tela | Feito (depende do SQL 039 do Bussola) | `src/components/ficha/postagem.ts`, `Publicacao.tsx`, `src/lib/dados/linha-tarefa.ts` | `postagem.test.ts`, `repositorio.test.ts`; `provas/pente-fino-r4/f2b-ja-postado-*` |
| Auditoria | 2 consertos, o resto conferido | `src/lib/dados/repositorio.ts`, `src/lib/dados/anotacoes.ts` | `repositorio-consertos.test.ts`, `anotacoes.test.ts` (r4) |

## O que mudou, item por item

- **N3, campos liberados antes de a pasta do Drive terminar.** A ficha agora só libera os campos (e o "Salvando...") depois de `organizarCard` responder. Na prova, a chamada ao Drive foi segurada: os campos ficam travados e voltam quando ela termina.
- **Ferreiro 5, dispensa da senha atual dependia de uma chave editável do navegador.**
  - A chave saiu. A dispensa agora vem do próprio token da sessão: o Supabase grava nele (com a assinatura dele) como a pessoa entrou (`amr`).
  - Só dispensa a sessão aberta há menos de 1 hora por um link do e-mail (convite, "esqueci a senha"). Qualquer outra sessão, ou um token estranho, pede a senha atual.
  - Um token editado à mão até engana a tela, mas não passa no Supabase: ele confere a assinatura ao trocar a senha.
  - Em produção só há sessões com "password" hoje (conferido em `auth.mfa_amr_claims`). Por isso o caminho do convite foi conferido por teste, não por um convite real.
- **Novo 2, limpeza do print apagava arquivo que outra gravação tinha guardado.** Quando acrescentar um print falha, a limpeza não apaga mais o que a folha ainda mostra. Isso cobre o caso de uma gravação seguinte da mesma folha (ex.: tirar outro print) já ter levado esse arquivo para o banco.
- **Novo 3, retomar o envio deixava uma pendência sem dono.** Ao escolher o vídeo de novo depois de recarregar, o envio reusa o id do envio interrompido do mesmo card. Com isso, a confirmação tira esse id da lista do banco (038).
  - O id fica guardado na aba mesmo depois de "Abrir o card" tirar o aviso.
  - Descartar (×) o envio interrompido, ou um vídeo que falhou, chama `desistir_envio` (039 do Bussola): o id sai da lista. Sem o 039 a chamada não acha a função e nada acontece.
  - Com o 039, o servidor registra o vídeo e tira o id da lista juntos (contrato do Bussola). Reusar o id é compatível com isso: marcar o mesmo id de novo não duplica.
- **Novo 4, vídeo entregue continuava pendente na ficha aberta.** O vídeo que chega em segundo plano toma o lugar do provisório de mesmo nome que ainda estava "pendente". Antes os dois ficavam, e o Programar pedia "Salve a ficha antes".
- **Novo 5, "Parar" contava a reconferência com erro como sucesso.** Se a consulta que confere a marca falha, o selo volta e aparece "Não consegui tirar a marca".
- **F2 (b), card já postado (decisão do Natham, contrato do 039 do Bussola).** Quando toda rede escolhida já tem post publicado, a Publicação mostra "Este card já foi postado. Para postar de novo, duplique o card." e desliga Programar e Postar agora.
  - Acender uma rede sem post (ex.: o Facebook que deu erro) libera os botões. O "Tentar de novo" não muda.
  - A recusa do banco (55000 com essa frase) aparece na tela exatamente como o banco escreve.

## Auditoria: economizar execuções

| Onde | O que fazia | Situação |
|---|---|---|
| `repositorio.ts` (Postando) | Relia a Esteira inteira a cada 15 s enquanto algum card postava e por 2 min depois do "Postar agora". | **Tirado.** A resposta da postagem chega pelo tempo real: a tabela `postagens` toca o sino "esteira" (`tocar_sino`, conferido no banco), e a Esteira já ouve esse sino. |
| `anotacoes.ts` (Caderno) | Com falha ao gravar, tentava de novo a cada 5 s, sem fim (banco fora do ar = uma chamada a cada 5 s). | **Limitado a 3 tentativas.** Depois espera a próxima digitação ou a saída da aba. O último aviso diz "confira a internet e digite de novo para gravar". |
| Esteira (`TelaConteudos`, "hoje" a cada minuto) | Relógio local. | Fica: não chama o servidor. |
| Mapa (`aCadaMinuto`) | Relógio local. | Fica: não chama o servidor. |
| Calendário (relógio de 30 s) | Relógio local. A pauta só é lida de novo quando a semana muda (`usePostagensCalendario(de, ate)`). | Fica. |
| Caderno (`TelaTarefas`, meia-noite) | Um alarme único na virada do dia, local. | Fica. |
| `envios.ts` (sinal de vida, 10 s) | Só o armazenamento do navegador, sem servidor. | Fica. |
| Volta à aba (`visibilitychange`) e tempo real | Leitura quando avisado. | Fica (é o modelo certo). |

## Pendências e riscos

- **F2 (b)** só vale com o SQL 039 do Bussola aplicado. Antes disso, a tela já trava os botões, mas o banco ainda aceitaria.
- **Novo 3**: depende do 039 e da função `drive` do Bussola publicados. Se a aba for fechada (não recarregada), ou se a pessoa clicar "Abrir o card" e não escolher o vídeo de novo, o id fica na lista. Nesse caso o banco do Bussola dá a postagem como erro depois de 3 horas de marca ("O vídeo novo não chegou em 3 horas..."), ou quem aprova usa "Postar com o vídeo atual".
- **Postando sem a releitura de 15 s:** se o tempo real cair, o resultado aparece ao voltar para a aba ou recarregar.
- **Ferreiro 5:** o prazo de 1 hora é um corte meu. Quem abrir o convite e só escolher a senha depois de 1 hora vai ver o pedido da senha atual (que ainda não tem). Aí precisa de um link novo. Os nomes do `amr` para convite e recuperação (`invite`, `recovery`) vêm do servidor de login do Supabase; não houve um convite real nesta sessão para ver.
- **Novo 4:** o vídeo entregue é casado com o provisório pelo nome do arquivo. Dois vídeos com o mesmo nome no mesmo card trocariam o primeiro que aparecer.

## Correção final

Base: `r4-codex.md`. `npm run check` verde: lint sem erros (19 avisos, os mesmos), tipos, regras, 61 arquivos e 507 testes, build. Os testes novos foram rodados contra o comportamento de antes e falharam lá. Regra de ouro dos vídeos: com vídeo novo pendente, o antigo só sai pelo clique em "Postar com o vídeo atual".

| Item | Situação | Arquivos | Teste / prova |
|---|---|---|---|
| Parte 4, bug 1 (lado da tela) | Consertado | `src/lib/dados/envios.ts`, `src/lib/dados/subindo.ts`, `src/components/casca/AvisoEnvio.tsx` | `envios-aba.test.ts` (regra de ouro); `provas/pente-fino-r4/final-aviso-envio-*` |
| Novo 3 (retomar nos primeiros 30 s) | Consertado | `src/lib/dados/envios.ts` | `envios-aba.test.ts` (novo 3, suspeito) |
| Ferreiro 5 | Tela como está; garantia é no Supabase | nenhum | nenhum |

- **Bug 1, fechar o aviso de envio liberava o vídeo antigo.**
  - "Tirar da lista" (×) e "Fechar painel" agora só escondem o aviso. A tela não chama mais `desistir_envio`, e a chamada saiu do código (`subindo.ts`).
  - A pendência continua no banco. O id do envio interrompido, ou do vídeo que falhou, fica guardado na aba, e o próximo envio de vídeo do mesmo card o reusa: quando esse vídeo chega, a pendência sai.
  - O aviso com falha ou interrompido ganhou a frase: "O post deste card espera o vídeo novo. Tirar este aviso não muda isso: para postar com o vídeo atual, use o botão na ficha do card."
  - O "×" do painel diz "Só esconde os avisos" ao passar o mouse.
  - Liberar o antigo continua só pelo botão "Postar com o vídeo atual" da ficha, que pede confirmação.
- **Novo 3, retomar nos primeiros 30 s depois de recarregar.** Antes, o envio velho ainda estava entre os "suspeitos" (N6) e a retomada criava outro id. Agora ela reusa também o id do suspeito do mesmo card, que sai da lista e não aparece mais depois como "interrompido".
- **Ferreiro 5.** A tela fica como está (pede a senha atual fora da sessão do link). A tela sozinha não garante isso: quem controla o navegador consegue chamar a troca de senha direto. A garantia de verdade é ligar **"Require current password when changing password"** no Auth do Supabase. **Decisão do Natham.**
- **Para o Bussola:** a tela não chama `desistir_envio` em nenhum lugar. Se ninguém mais usar essa função do 039, ela pode sair.

## Abas duplicadas (achado médio do Ferreiro, `r4-final-ferreiro.md`)

Confirmado no código (`envios.ts`, `idParaRetomar`): a retomada reusava QUALQUER envio suspeito do card. Em uma aba duplicada, o suspeito pode ser o envio vivo da outra aba. O vídeo B escolhido na cópia ficava com o mesmo id do vídeo A ainda subindo. Quando A chegava, a marca saía e o post vencido saía com A, com B ainda a caminho.

- **Conserto:** o suspeito só é reusado se o sinal de vida dele parou há mais de um ciclo (10 s, mais 2 s de folga). A aba recarregada não renova mais o sinal do envio dela, então ele é reusado como antes. A aba duplicada viva renova a cada 10 s, então o vídeo novo ganha um id próprio, e o post espera os dois.
- **Arquivo:** `src/lib/dados/envios.ts` (o ciclo de 10 s virou a constante `CICLO_MS`, usada também no relógio do sinal).
- **Teste:** `envios-aba.test.ts`, "r4 abas (Ferreiro)". Ele falhou antes do conserto (B reusava o id de A) e passa depois. O teste da retomada em 30 s agora simula o sinal parado há 15 s.
- **Limite:** escolher o vídeo de novo nos primeiros ~12 s depois de recarregar ainda gera um id novo, porque não dá para saber se o envio é desta aba. Nesse caso o envio velho vira "interrompido" em até 30 s e o id dele é reusado no próximo envio do card, como no novo 3. Aba duplicada em segundo plano há mais de 5 minutos: o navegador pode espaçar o relógio dela, e o sinal pode parecer parado.
- `npm run check` verde: lint sem erros (19 avisos, os mesmos), tipos, regras, 61 arquivos e 508 testes, build.
