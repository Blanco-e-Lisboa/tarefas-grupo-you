-- 042 · Pente fino r4, correção final (29/10/2026). Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM.
-- Idempotente. Depende do 010 e do 012 (agenda do Google). NÃO aplicado: o Natham cola no SQL Editor.
-- Provado num Postgres local com o mesmo código de produção (supabase/prova_042.sql).
--
-- Regra do Natham: acordar quando avisado, nada de perguntar em intervalo.
-- Antes (012): o despertador conferia a fila de 5 em 5 minutos, o dia todo, mesmo vazia (288 vezes por dia).
-- Agora: quem entra na fila toca a campainha do n8n na hora (igual ao 012) e arma UM despertador para daqui a 6 minutos.
-- Ele toca uma vez: se achar pedido parado, chama o n8n de novo; só se arma outra vez enquanto houver pedido pendente de menos de 1 dia
-- (erro do Google que o n8n vai tentar de novo, confirmação perdida). Fila vazia = nenhum despertador = zero execução.
-- Pedido que passou de 1 dia sem sair continua na fila e vai junto no próximo aviso (o n8n pega todos os pendentes).
begin;

create or replace function private.agenda_saida_armar() returns void
language plpgsql security definer set search_path = ''
as $$
declare v timestamp := (date_trunc('minute', now()) + interval '6 minutes') at time zone 'UTC';
begin
  -- mesmo nome = o cron só atualiza (cada pedido novo empurra o despertador; nunca há dois)
  perform cron.schedule('agenda_saida_despertador',
    format('%s %s %s %s *', extract(minute from v)::int, extract(hour from v)::int, extract(day from v)::int, extract(month from v)::int),
    $cmd$select private.agenda_saida_despertou()$cmd$);
end $$;
revoke all on function private.agenda_saida_armar() from public, anon, authenticated;

create or replace function private.agenda_saida_despertou() returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- uso único: a expressão do cron não tem ano, sem isto tocaria de novo no ano seguinte
  if exists (select 1 from cron.job where jobname = 'agenda_saida_despertador') then perform cron.unschedule('agenda_saida_despertador'); end if;
  perform private.agenda_saida_avisar_n8n(true);
  if exists (select 1 from public.agenda_saida where estado = 'pendente' and criado_em > now() - interval '1 day') then
    perform private.agenda_saida_armar();
  end if;
end $$;
revoke all on function private.agenda_saida_despertou() from public, anon, authenticated;

-- Gatilho (do 012): nunca pode quebrar o salvar da tarefa. Toca a campainha e arma o despertador único.
create or replace function private.agenda_saida_campainha() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.agenda_saida_avisar_n8n(false);
  perform private.agenda_saida_armar();
  return null;
exception when others then
  raise warning 'agenda_saida_campainha: aviso ao n8n falhou: %', sqlerrm;
  return null;
end $$;
revoke all on function private.agenda_saida_campainha() from public, anon, authenticated;

-- Tira o relógio de 5 em 5 minutos; se já houver pedido pendente agora, deixa um despertador único para ele.
do $$ begin
  if exists (select 1 from cron.job where jobname = 'agenda_saida_despertador') then perform cron.unschedule('agenda_saida_despertador'); end if;
  if exists (select 1 from public.agenda_saida where estado = 'pendente') then perform private.agenda_saida_armar(); end if;
end $$;

commit;

-- Conferência depois de colar (só leitura):
--   select jobname, schedule, command from cron.job where jobname = 'agenda_saida_despertador';  -- nenhuma linha com a fila vazia
