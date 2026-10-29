-- Prova do 042 (pente fino r4, correção final). Roda numa CÓPIA local do banco (Postgres/PGlite com stubs), nunca no projeto real.
create temp table r (item text, res text);
delete from vault.secrets where name in ('n8n_tarefas_volta_url', 'n8n_tarefas_volta_secret');
select vault.create_secret('https://n8n.falso/volta', 'n8n_tarefas_volta_url');
select vault.create_secret('segredo-falso', 'n8n_tarefas_volta_secret');
create function pg_temp.chamadas() returns bigint language sql as $$ select count(*) from net.chamadas where url = 'https://n8n.falso/volta' $$;
create function pg_temp.despertador() returns text language sql as $$ select schedule from cron.job where jobname = 'agenda_saida_despertador' $$;
create function pg_temp.pedido() returns void language sql as $$
  insert into public.agenda_saida (tarefa_id, acao, pessoa_id) select gen_random_uuid(), 'salvar', p.id from public.pessoas p where p.slug = 'natham' $$;

-- Fila vazia: nenhum relógio de 5 em 5 minutos, nenhum despertador
insert into r select 'Fila vazia', case when pg_temp.despertador() is null then 'ok' else 'FALHA: despertador ' || pg_temp.despertador() end;

-- Pedido novo: avisa o n8n na hora e arma UM despertador (uso único, com dia e mês)
do $$ declare n bigint := pg_temp.chamadas(); begin
  perform pg_temp.pedido();
  insert into r values ('Pedido avisa e arma', case when pg_temp.chamadas() = n + 1 and pg_temp.despertador() ~ '^\d+ \d+ \d+ \d+ \*$' then 'ok'
    else 'FALHA: chamadas ' || (pg_temp.chamadas() - n) || ' despertador ' || coalesce(pg_temp.despertador(), '-') end);
end $$;

-- O despertador toca com o pedido parado (aviso perdido): chama o n8n de novo e se arma outra vez
do $$ declare n bigint; begin
  update public.agenda_saida set criado_em = now() - interval '10 minutes';
  n := pg_temp.chamadas();
  perform private.agenda_saida_despertou();
  insert into r values ('Parado: tenta de novo', case when pg_temp.chamadas() = n + 1 and pg_temp.despertador() is not null then 'ok' else 'FALHA' end);
end $$;

-- Tudo entregue: o despertador toca, não chama ninguém e some
do $$ declare n bigint; begin
  update public.agenda_saida set estado = 'feito', feito_em = now();
  n := pg_temp.chamadas();
  perform private.agenda_saida_despertou();
  insert into r values ('Entregue: silencio', case when pg_temp.chamadas() = n and pg_temp.despertador() is null then 'ok' else 'FALHA' end);
end $$;

-- Pedido parado há mais de 1 dia: um último aviso e o despertador não se rearma (vai junto no próximo pedido novo)
do $$ declare n bigint; begin
  perform pg_temp.pedido();
  update public.agenda_saida set criado_em = now() - interval '2 days' where estado = 'pendente';
  n := pg_temp.chamadas();
  perform private.agenda_saida_despertou();
  insert into r values ('Velho: para', case when pg_temp.chamadas() = n + 1 and pg_temp.despertador() is null then 'ok' else 'FALHA' end);
end $$;

select item || ' ' || res as prova from r order by item;
