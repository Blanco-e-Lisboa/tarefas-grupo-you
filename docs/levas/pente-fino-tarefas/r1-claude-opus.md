# Pente fino Tarefas, rodada 1 (claude-opus)

Área: Caderno (`src/app/tarefas`, `src/components/tarefas`), Calendário (inclui `postagens/`), Mapa, `src/components/ui`, `src/lib/atraso.ts` e a camada `src/lib/dados` que essas telas usam. Só leitura: nenhum arquivo do app editado, nada escrito no banco. Conferi no banco de produção (só SELECT) a função `salvar_tarefa`, os gatilhos de `tarefas` e as travas de `agenda_feitos`, `fazendo_agora` e `tags`.

Formato: título | arquivo:linha | defeito | cenário | gravidade | confiança.

## Alta

### 1. Duplicar ou "Criar tarefa para" um card Aprovado/Postado cria um segundo card programado para postar
`src/components/tarefas/TelaTarefas.tsx:240` e `:244` (menu aparece em `src/components/tarefas/Folha.tsx:201`)
- Defeito: as duas ações copiam a tarefa inteira (`{ ...t, id: undefined }`), inclusive `etapa`, `postarEm`, `legenda`, `postarRedes`, `formato`. O menu ⋮ aparece para card de conteúdo no Caderno (só o Excluir some). `salvar_tarefa` faz INSERT com `postar_em` e o gatilho `tarefas_alarmes` arma o alarme de postar no INSERT de card `aprovado` + `postagem`. Os anexos NÃO viram linha nova no banco (a cópia só os mostra na tela até recarregar), então o card novo vai para a postagem automática sem mídia.
- Cenário: card de Postagem da You em Aprovado, programado para 30/10 18:00, com início no dia 29. Natham abre o Caderno do dia 29 e clica ⋮ > "Duplicar pro dia seguinte" (ou "Criar tarefa para… Matheus"). Nasce outro card Aprovado com `postar_em` 30/10 18:00 (a data do post não anda +1) e a mesma legenda. Às 18:00 o alarme dispara para os dois: o original posta e a cópia cai em erro de postagem (sem vídeo), ou fica "Postando" e travada. Se o original estava em Postado, a cópia nasce Postado (`postado_em = now()`) e o gatilho `tarefas_risca_pauta` conta um post que não existiu na pauta daquele dia. Natham, Matheus e Adrian passam na trava `pode_aprovar`, então o banco aceita.
- Gravidade: alta. Confiança: alta (função e gatilhos lidos no banco).

## Média

### 2. "Duplicar pro dia seguinte" no Caderno de outra pessoa manda a cópia para o caderno de quem clicou
`src/components/tarefas/TelaTarefas.tsx:240` com `src/lib/dados/repositorio.ts:150`
- Defeito: a cópia vai sem `id` e sem `enviarPara`, então `dono = antes?.dono ?? nova.enviarPara ?? eu` vira quem está logado, e `enviadaPor` fica vazio. `criarPara` passa `enviarPara`; `duplicar` não.
- Cenário: Natham abre "Caderno de Matheus", numa tarefa que ele mesmo mandou ao Matheus clica ⋮ > Duplicar. A cópia nasce com dono Natham e responsável Matheus: some do Caderno do Matheus (que é onde o Natham olhava) e aparece no do Natham. O Matheus nunca a vê no Caderno dele.
- Gravidade: média. Confiança: alta.

### 3. Mover ou arrastar um card Aprovado programado muda só o início; o post sai no dia antigo
`src/components/tarefas/TelaTarefas.tsx:235` (`noDiaSeguinte`, usado por "Mover pro dia seguinte" na :241 e "Marcar horário" na :232) e `src/components/calendario/logica.ts:112` (`mover`, arrastar no Calendário)
- Defeito: as três ações trocam `inicio`/`fim` e mantêm `postarEm`. Para card de Postagem, a data que vale para postar (e para o Mapa e o atraso, `quandoDe` em `src/lib/atraso.ts:8`) é `postarEm`.
- Cenário: card Aprovado com início e post no dia 30 às 18:00. Matheus arrasta no Calendário para o dia 2/11. O bloco passa a aparecer no dia 2 no Calendário e no Caderno, mas o alarme continua no dia 30 e posta no dia 30; o Mapa e a Fila seguem mostrando o dia 30. Ninguém é avisado de que a programação não mudou.
- Gravidade: média. Confiança: alta.

### 4. O tempo real (sino do banco) de agenda, "feito" da agenda, pauta e anotações para de funcionar depois de trocar de tela
`src/lib/dados/tempo-real.ts:26` e `:28`; atinge `agenda.ts:61`, `agenda-feitos.ts:123`, `postagens-planejadas.ts:79`, `anotacoes.ts:27`
- Defeito: ao sair a última tela que ouve, o canal é removido com `void sb.removeChannel(canal)`, que é assíncrono: o canal só sai da lista do cliente depois que o servidor responde. A tela nova chama `ligarTempoReal` com o MESMO nome no mesmo instante; o `realtime-js` 2.118 devolve o canal que está saindo (`RealtimeClient.channel` devolve o existente com o mesmo tópico), `.on()` e `.subscribe()` não fazem nada nele (não está "fechado") e, quando o servidor confirma a saída, ele é destruído. Sem erro, sem aviso. A esteira escapa porque a casca (`AvisoErro`, `Menu`) mantém o repositório sempre assinado.
- Cenário: Natham abre o Caderno e vai para o Calendário (ou volta). Um compromisso novo entra no Google, ou o Matheus marca um compromisso como feito: a tela não atualiza até trocar de aba do navegador ou recarregar. Mesmo com a pauta de postagens (sair do Calendário e voltar).
- Gravidade: média (a volta à aba ainda relê). Confiança: média (li o código da biblioteca; não reproduzi no navegador).

### 5. Anotações do dia: falha ao gravar é calada e duas gravações fora de ordem deixam o texto velho no banco
`src/lib/dados/anotacoes.ts:51` a `:53`
- Defeito: (a) se o `upsert` falha, nada aparece na tela e não há nova tentativa sozinha (só "na próxima digitação"); (b) cada pausa de 600 ms dispara um `upsert` sem ordem garantida, e a resposta não confere qual texto chegou por último.
- Cenário (a): Matheus no celular, sinal cai, ele escreve "Não esquecer: ligar para o contador" e fecha a aba. O texto nunca chega ao banco e ele não foi avisado. Cenário (b): escreve, pausa (grava "ligar"), escreve mais, pausa (grava "ligar para o contador"); a primeira resposta chega depois da segunda no banco. Recarregou: aparece só "ligar".
- Gravidade: média. Confiança: média (a) alta, (b) média.

### 6. Salvar manda a linha inteira: a mudança de outra pessoa é desfeita sem aviso
`src/lib/dados/repositorio.ts:166` e `:176` (função `salvar_tarefa` no banco atualiza todas as colunas)
- Defeito: todo salvar envia título, notas, concluída, início, fim, cor etc. da cópia que a tela tem. Não há conferência de versão (`updated_at`). O último a salvar ganha, campo a campo.
- Cenário: Matheus abre a ficha de uma tarefa pelo Caderno e fica 10 minutos escrevendo as notas. Nesse meio tempo o Natham, no "Caderno de Matheus", marca a mesma tarefa como feita. Matheus salva a ficha: a tarefa volta a "não feita" (e qualquer horário que o Natham tenha mudado volta junto). Nenhum dos dois vê aviso.
- Gravidade: média. Confiança: média (depende de a ficha guardar o rascunho inteiro; a ficha fica fora da minha área e não a li).

### 7. "Mudar empresa…" pelo ⋮ em card de conteúdo leva o tema da empresa antiga (e "Nenhuma" deixa o alarme armado)
`src/components/tarefas/TelaTarefas.tsx:248` com `src/lib/dados/repositorio-regras.ts:12` (`campoOcasiao`)
- Defeito: a ação troca só `empresaId`. O `ocasiaoId` continua o da empresa antiga e vai ao banco. Com "Nenhuma", o card perde a empresa mas mantém `etapa` e `postar_em`; o gatilho de alarme não olha a empresa.
- Cenário: card Aprovado da You com tema "Black Friday" da You; no Caderno, Matheus clica ⋮ > Mudar empresa > Beec. O card da Beec fica com a pasta de tema da You no Drive (vídeo novo sobe para a pasta errada). Com "Nenhuma", o card sai da Esteira e do Mapa, mas o alarme continua e às 18:00 a postagem tenta sair sem empresa.
- Gravidade: média para baixa. Confiança: média (não li a função `postar-meta` nem a do Drive).

## Baixa

### 8. A migração das "feitas" antigas do navegador apaga a lista antes de os dados chegarem
`src/components/tarefas/TelaTarefas.tsx:64` a `:70`
- Defeito: o efeito roda uma vez, na montagem; abrindo direto em `/tarefas`, `tarefas` ainda está vazio, nada é migrado e a chave `grade:tarefas-feitas` é apagada.
- Cenário: alguém que ainda tinha o visto guardado só no navegador abre o Caderno pelo endereço: os vistos somem para sempre.
- Gravidade: baixa (dado antigo). Confiança: alta.

### 9. Dois salvar seguidos da mesma tarefa: se o primeiro falha, a tela apaga o segundo
`src/lib/dados/repositorio.ts:197`
- Defeito: o salvar que falha volta a tarefa para o `antes` que ele mesmo viu, por cima do que o salvar seguinte já pôs na tela. O segundo salvar ainda carrega a mudança do primeiro (que "falhou") para o banco.
- Cenário: arrasta a tarefa para 10:00 e, logo em seguida, troca a cor pelo ⋮; a rede falha no primeiro. A tela volta ao horário e à cor de antes, o banco fica com 10:00 e a cor nova, até a próxima releitura.
- Gravidade: baixa. Confiança: média.

### 10. A cópia de uma tarefa mostra os anexos do original; tirar um anexo da cópia apaga o do original
`src/lib/dados/repositorio.ts:204` com `src/lib/dados/anexos.ts:65` a `:67`
- Defeito: `duplicar`/`criarPara` copiam `arquivos` com os ids do original; depois do salvar, a cópia guarda esses ids na tela. Se a ficha da cópia salvar sem um deles antes da próxima releitura, `sincronizarAnexos` apaga a linha e o arquivo (Drive ou Storage) que são do original.
- Cenário: duplica uma tarefa com foto, abre a cópia na hora e tira a foto "da cópia". A foto some do original.
- Gravidade: baixa (janela curta: o tempo real relê em menos de 1 s). Confiança: baixa.

### 11. "Parar" o selo "fazendo agora" que o banco não deixa apagar some só na tela
`src/lib/dados/repositorio.ts:336`
- Defeito: `delete` barrado pela trava devolve 0 linhas sem erro; a tela trata como feito.
- Cenário: tarefa enviada que ficou só leitura depois de marcada; clicar em parar some com o selo, que volta na próxima releitura.
- Gravidade: baixa. Confiança: média.

### 12. Arrastar no Caderno uma tarefa que passa da meia-noite a transforma em 15 minutos
`src/components/tarefas/TelaTarefas.tsx:228`
- Defeito: a duração é calculada só pelas horas (`fim 01:00 - início 22:00` dá negativo) e vira 15 min.
- Cenário: tarefa 22:00 até 01:00 do dia seguinte, arrastada para 20:00: grava 20:00 às 20:15.
- Gravidade: baixa. Confiança: alta.

### 13. Arrastar no Calendário uma tarefa de dia inteiro de vários dias perde o fim
`src/components/calendario/logica.ts:115` e `:124`
- Defeito: `fim: undefined` ao soltar em dia inteiro ou num dia do mês/ano.
- Cenário: "Viagem" de 3 a 5/11 (dia inteiro), arrastada para 10/11: vira só 10/11.
- Gravidade: baixa. Confiança: alta.

### 14. Leituras da pauta e da agenda sem ordem: a resposta mais velha pode pisar na mais nova
`src/lib/dados/postagens-planejadas.ts:57` e `src/lib/dados/agenda.ts:74`
- Defeito: duas leituras do mesmo período em voo (aviso do tempo real + volta à aba, ou salvar + aviso) gravam o resultado na ordem em que chegam, não na ordem em que saíram.
- Cenário: Natham salva uma postagem e, no mesmo segundo, chega o aviso de outra mudança; a leitura que saiu antes do salvar volta por último e o bloco novo some até a próxima leitura.
- Gravidade: baixa. Confiança: baixa.

## O que não cobri
- A Ficha (`src/components/ficha`), o Drive (`drive.ts`), ideias, pastas e a função `postar-meta`: fora da área; o achado 6 e parte do 1 e do 7 dependem delas e não as li.
- Não rodei o app nem reproduzi no navegador; tudo é leitura de código mais consulta somente leitura ao banco.
- Não revisei as funções SQL da pauta (`postagens_calendario`, `salvar_planejada`, `apagar_planejada`), nem as travas de `tarefas` além de `salvar_tarefa`, `marcar_feita` e dos gatilhos.
- CSS, acessibilidade e a animação da folha (`virar.ts`) só por cima, procurando estado preso; nada achado.
