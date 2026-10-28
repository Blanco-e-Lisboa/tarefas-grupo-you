-- 032 · (1) Trava: card que volta de Postado para Aprovado perde a data do post. Card postado À MÃO (sem registro em postagens)
-- voltaria a postar sozinho na hora marcada (ou na hora, se já passou) e sairia duas vezes. Sem data, alguém precisa programar de novo.
-- (2) Liga a postagem automática (mesmo conteúdo do 019b). Na hora de ligar havia 0 cards em Aprovado: nada dispara.
-- APLICADO em 28/10/2026 pelo Claude com ok do Natham (migration trava_volta_postado_e_liga). Conferido: ligado, relógio de minuto tirado, card Postado→Aprovado fica sem data, nenhum alarme armado.
-- Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM. Idempotente.
-- Para desligar: update private.interruptores set ligado = false where nome = 'postagem_automatica';
--   e  select cron.schedule('tarefas_postar_vencidos', '* * * * *', $c$select private.postar_vencidos()$c$);
begin;

create or replace function private.tarefas_volta_postado() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.etapa = 'postado' and new.etapa = 'aprovado' then new.postar_em := null; end if;
  return new;
end $$;
-- BEFORE roda em ordem alfabética: depois de tarefas_antes e tarefas_aprovacao (que já exige quem aprova para entrar em Aprovado)
drop trigger if exists tarefas_volta_postado on public.tarefas;
create trigger tarefas_volta_postado before update of etapa on public.tarefas
  for each row execute function private.tarefas_volta_postado();

update private.interruptores set ligado = true where nome = 'postagem_automatica';
do $$ declare r record; begin
  for r in select id, postar_em from public.tarefas where etapa = 'aprovado' and tipo = 'postagem' and postar_em is not null loop
    perform private.armar_alarme('postar', r.id, r.postar_em::timestamp at time zone 'America/Sao_Paulo');
  end loop;
end $$;
do $$ begin
  if exists (select 1 from cron.job where jobname = 'tarefas_postar_vencidos') then perform cron.unschedule('tarefas_postar_vencidos'); end if;
end $$;

commit;
