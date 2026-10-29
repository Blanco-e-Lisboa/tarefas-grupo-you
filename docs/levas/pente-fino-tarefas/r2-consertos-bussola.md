# Pente fino Tarefas, rodada 2: consertos de banco e servidor (Bussola)

29/10/2026. Itens: F3, F4, F5, F8, F9, F10 (de `r2-ferreiro.md`) e a parte do banco do B1 (de `r2-bussola.md`). F2 espera decisão do Natham: não mexi.
Nada aplicado no banco de produção (só leitura), nada publicado, nenhum commit.

Provas: SQL na cópia local do banco (a mesma da rodada 1, que bate com a produção nas funções de postagem), sem o SQL novo (falha) e com ele colado 2 vezes (passa), junto com 034, 035, 036 e o 040 do Lince. Funções: Vitest com Meta, Drive e banco falsos; cada teste novo também foi rodado contra o código de antes numa cópia temporária e falhou lá.
`npm run check` verde: lint 0 erros (19 avisos de arquivos de outros), tipos, regras, 57 arquivos e 473 testes, build. Numa das rodadas, um teste novo do Lince (`ideias.test.ts`, r2 B5) falhou uma vez por tempo com a máquina ocupada; passou isolado 2 vezes e na rodada completa seguinte.

| Item | Situação | O que mudou | Arquivos | Teste |
|---|---|---|---|---|
| B1 (parte do banco) | Consertado | `tentar_de_novo` não inventa mais data: card sem data recusa com 55000 "Escolha a data e a hora do post antes de tentar de novo." Com data, as redes com erro voltam para a fila; data que passou sai na hora, data futura sai na hora marcada. Programar data nova sozinho NÃO religa rede com erro (pode ser "estado incerto": decide a pessoa). Combinado com o Lince: a tela mostra o campo de data também com erro, grava a data e chama `tentar_de_novo`; "fila" com data futura aparece como "Programado". | `supabase/037_alarme_e_tentar_de_novo.sql`; o `034` ganhou um aviso no cabeçalho | `supabase/prova_037.sql` (B1 sem data, data futura, data passada) |
| F3 | Consertado | Sem a duração medida pelo Drive, o vídeo segue como antes e a Meta decide. Só barra quando a duração existe e passa de 25 Mbps. A classe `ErroEspera` saiu (não tinha mais uso). | `supabase/functions/postar-meta/redes.ts`, `meta.ts` | `postar.test.ts` "F3" (trocou o teste "M20 pós-Codex", que provava a regra antiga) |
| F4 | Consertado | Troca de capa numa gravação só: a linha da capa velha passa a apontar para o arquivo novo (mesmo `arquivo_id`); se o banco falha, nada muda e a capa velha segue no card e no Drive. Só depois o arquivo velho vai para a lixeira (se a lixeira falhar, fica solto no Drive com um registro no log, e o card já está com a capa nova). O Lince confirmou que a tela aceita o mesmo id. | `supabase/functions/drive/acoes.ts` | `drive.test.ts` "F4" (banco cai na troca) e "M14 (pós-Codex)" (agora confere o mesmo id) |
| F5 | Consertado | Alarme e `tentar_de_novo` conferem Tipo Postagem e empresa You, como a catraca. Card fora disso: o alarme não chama a função nem dá erro falso, e `tentar_de_novo` recusa (42501). | `037` | `prova_037.sql` F5+F9 |
| F8 | Consertado | Card esperando vídeo novo: o alarme sai e não fica tocando a cada minuto. Quando a marca sai, o gatilho do 034 rearma e posta. | `037` | `prova_037.sql` F8 |
| F9 | Consertado | Toque que acha o card fora de programação tira o próprio job do cron (o job não toca de novo no ano seguinte). Se o card está programado para mais tarde, o job fica (é o alarme novo). | `037` | `prova_037.sql` F5+F9 e "F9 alarme novo fica" |
| F10 | Consertado | `confirmar_envio` não recusa mais o arquivo depois de subir inteiro: grava o tipo real (os primeiros bytes; sem reconhecer, o tipo guardado no Drive). Vídeo mandado como documento entra como vídeo e segue a regra do legendado (o objetivo do B3 da rodada 1 continua). Capa que não é imagem: 422 "A capa precisa ser uma imagem." | `supabase/functions/drive/acoes.ts` | `drive.test.ts` "B3/F10" (2 casos) e "F10: capa que não é imagem" |

## Observações

- O caso M13b da `prova_034.sql` ("Tentar de novo" sem data posta na hora) saiu: o 037 trocou essa regra de propósito (B1). A prova nova está no `prova_037.sql`.
- Dois testes do `prova_037.sql` já passavam antes ("B1 data futura" e "F9 alarme novo fica"): eles guardam o que não pode quebrar com o conserto.
- O teste "F10: capa que não é imagem" também passava antes (o código antigo recusava tudo que não batia); ficou para guardar a regra da capa.

## Para aplicar (Natham decide)

SQL na ordem: `034`, `035`, `036`, `037` (e o `040` do Lince, que convive). Depois publicar `postar-meta` e `drive`.
