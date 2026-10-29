# Pente fino Tarefas, rodada 1: lista consolidada

29/10/2026. Fontes: r1-claude-banco.md (Bussola), r1-claude-opus.md (Ferreiro), r1-lince.md (Lince), r1-codex.md (Vigia/Codex). Repetidos foram juntados; a fonte vem entre colchetes (B, F, L, C + número do achado no relatório de origem).

Antes de consertar, cada achado é reproduzido ou confirmado no código. Se não se confirmar, sai da lista.

## Altos

| # | Problema | Fonte |
|---|---|---|
| A1 | Ficha aberta grava a cópia velha por cima do que outra pessoa mudou (etapa, data do post, notas, tags). Pode voltar card Postado para Aprovado e causar post duplicado. | L1, F6, C5 |
| A2 | Duplicar ou "Criar tarefa para" num card Aprovado/Postado cria um segundo card programado para postar, sem mídia; e tirar anexo da cópia apaga o do original. | F1, F10, C1 |
| A3 | Mural de ideias desfaz a edição de outra pessoa só de passar pelo campo. | L2 |
| A4 | "Tentar de novo" não destrava post que estourou as rodadas, e não zera as tentativas automáticas. | B1, B7 |
| A5 | Post continua saindo depois que alguém volta o card para Edição ou tira a programação. | C3 |
| A6 | Limpeza de 7 dias apaga os arquivos mesmo se o card voltou para Edição no meio. | C2 |
| A7 | Vídeo legendado esperando na fila de envio não bloqueia a postagem: sai o vídeo antigo. | C4 |
| A8 | Carrossel em Aprovado: cada vídeo novo transforma todos os anteriores em "original"; só o último é postado. | C7 |
| A9 | Mover/arrastar card programado muda o dia na tela, mas o post sai no dia antigo. | F3 |

## Médios

| # | Problema | Fonte |
|---|---|---|
| M1 | Postagem de outras empresas (Tu Ecom, Beec) programada nunca vai para Postado e mostra erro falso. **Decisão.** | B2 |
| M2 | Pauta apaga e recria a tarefa que o responsável editou (perde notas e horário). | B3 |
| M3 | A trava "card de conteúdo só se apaga pela Esteira" (029) nunca foi aplicada em produção. **Decisão.** | B4, L8 |
| M4 | Trocar Tipo ou Empresa de card Aprovado não desarma o alarme; empresa nova leva o tema da antiga. | B6, F7 |
| M5 | Tempo real (agenda, feitos, pauta, anotações) para de atualizar depois de trocar de tela. | F4 |
| M6 | Anotações do dia: falha ao gravar é calada e gravações fora de ordem deixam texto velho. | F5, C11 |
| M7 | Envios entre abas: envio vivo aparece como "interrompido" na outra aba e o vídeo sobe 2 vezes. | L3 |
| M8 | Mexer no card enquanto sobe imagem manda a mesma imagem de novo (carrossel com fotos repetidas). | L4 |
| M9 | Durante upload longo a tela para de receber o que os outros mudam. | L5 |
| M10 | Falha ao ler anexos vira "card sem anexo", e apagar mostra mensagem errada de aprovação. | L6 |
| M11 | Vídeo escolhido na ficha sobe mesmo clicando em "Descartar alterações". | L7 |
| M12 | Rede acrescentada depois de um post (ex.: Facebook) nunca é publicada. | C8 |
| M13 | "Postando" fica preso sem programação e esconde os botões. | C9 |
| M14 | Trocar a capa apaga a antiga antes de a nova subir; se falhar, fica sem capa. | C10 |
| M15 | Agenda pessoal do Adrian some do filtro e perde a origem. | C14 |
| M16 | Link do vídeo do Drive deixa baixar até 1 GB pedindo "os últimos bytes" (fura o teto de 4 MB). | C15 |
| M17 | Duplicar no Caderno de outra pessoa manda a cópia para o seu Caderno. | F2 |
| M18 | Checagem "horário que ainda não passou" usa o relógio do computador, não o de Brasília. | L14, C13 |
| M19 | Post recuperado depois de queda pode gravar o link de outro post (busca só pela legenda). | B10, C12 |
| M20 | Vídeo acima de 25 Mbps não é barrado antes de ir para a Meta (caso Nicolas). | Natham |
| M21 | Prints das ideias: arquivo apagado antes de gravar; ideia apagada deixa prints órfãos. | L10, C6 |

## Baixos

| # | Problema | Fonte |
|---|---|---|
| B1 | Trava 029 (quando aplicada) se burla com o cabeçalho User-Agent "Deno/". | B5 |
| B2 | Qualquer login cria e renomeia Tema (e as pastas no Drive). **Decisão.** | B8 |
| B3 | Tipo do anexo vem do navegador e não é conferido com o Drive. | B9 |
| B4 | Desmarcar "feita" numa tarefa da pauta volta a marcar em 5 min. **Decisão.** | B11 |
| B5 | `contar_cards_da_tag` revela quantas tarefas privadas dos outros usam uma tag. | B12 |
| B6 | Migração das "feitas" antigas do navegador apaga a lista antes de ler. | F8 |
| B7 | Dois salvar seguidos: se o 1º falha, a tela desfaz o 2º. | F9 |
| B8 | Parar o selo "fazendo agora" barrado pelo banco some só na tela. | F11 |
| B9 | Arrastar tarefa que passa da meia-noite vira 15 minutos. | F12 |
| B10 | Arrastar tarefa de vários dias (dia inteiro) perde o fim. | F13 |
| B11 | Leituras da pauta/agenda fora de ordem: a mais velha pisa na mais nova. | F14 |
| B12 | O "hoje" da Esteira não vira à meia-noite com a aba aberta. | L9 |
| B13 | Pastas abre a ficha sem o modo "só olhar" e com tipos errados. | L11 |
| B14 | Sair sem internet não sai, e o próximo usuário herda os envios. | L12 |
| B15 | Duplo clique cria duas pastas ou duas empresas. | L13 |
| B16 | Proteção contra senha vazada desligada no Supabase (chave no painel). | Alerta Supabase |

## Pendências do Natham (anotado em 29/10)

- B16: ligar a proteção contra senha vazada no painel do Supabase (Auth > Password security). Natham decidiu resolver depois.
- Ferreiro 5 (r3): ligar "Require current password when changing password" no Auth do Supabase. A tela já pede a senha atual, mas só o servidor garante. Junto com o B16.
