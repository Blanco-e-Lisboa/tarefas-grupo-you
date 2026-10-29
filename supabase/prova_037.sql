-- Prova do 037 (pente fino r2). Roda numa CÓPIA local do banco (Postgres/PGlite com stubs), nunca no projeto real. Sem login, como o despertador.
create temp table r (item text, res text);
create function pg_temp.card(p_tipo text, p_quando text) returns uuid language sql as $$
  insert into public.tarefas (titulo, tipo, empresa_id, etapa, responsavel_id, dono_id, criado_por, formato, postar_redes, postar_em)
  select 'prova', p_tipo, 'you', 'aprovado', p.id, p.id, p.id, 'post', '{instagram}', p_quando from public.pessoas p where p.slug = 'natham'
  returning id $$;
create function pg_temp.chamadas() returns bigint language sql as $$ select count(*) from net.chamadas $$;
create function pg_temp.tem_job(t uuid) returns boolean language sql as $$ select exists (select 1 from cron.job where jobname = private.alarme_nome('postar', t)) $$;

-- B1: sem data, "Tentar de novo" recusa (55000) e não inventa data
do $$ declare t uuid; c text := ''; d text; begin
  t := pg_temp.card('postagem', null);
  insert into public.postagens (tarefa_id, rede, status, erro) values (t, 'instagram', 'erro', 'Estado incerto: x');
  begin perform public.tentar_de_novo(t); exception when others then c := sqlstate; end;
  select postar_em into d from public.tarefas where id = t;
  insert into r values ('B1 sem data', case when c = '55000' and d is null then 'ok' else 'FALHA: sqlstate ' || c || ' data ' || coalesce(d, '-') end);
end $$;

-- B1: data futura, "Tentar de novo" põe na fila e espera a hora (não posta agora); o alarme da hora marcada existe
do $$ declare t uuid; n bigint; s text; begin
  t := pg_temp.card('postagem', to_char(now() at time zone 'America/Sao_Paulo' + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  insert into public.postagens (tarefa_id, rede, status, erro) values (t, 'instagram', 'erro', 'Estado incerto: x');
  n := pg_temp.chamadas();
  perform public.tentar_de_novo(t);
  select status into s from public.postagens where tarefa_id = t;
  insert into r values ('B1 data futura', case when s = 'fila' and pg_temp.chamadas() = n and pg_temp.tem_job(t) then 'ok' else 'FALHA: status ' || s || ' chamou ' || (pg_temp.chamadas() - n) end);
end $$;

-- B1: data que já passou: sai na hora
do $$ declare t uuid; n bigint; begin
  t := pg_temp.card('postagem', '2026-01-01T10:00');
  insert into public.postagens (tarefa_id, rede, status, erro) values (t, 'instagram', 'erro', 'x') on conflict (tarefa_id, rede) do update set status = 'erro';
  n := pg_temp.chamadas();
  perform public.tentar_de_novo(t);
  insert into r values ('B1 data passada', case when pg_temp.chamadas() > n then 'ok' else 'FALHA: nao chamou' end);
end $$;

-- F5: card que deixou de ser Postagem: "Tentar de novo" recusa e o alarme não chama a função (e tira o próprio job)
do $$ declare t uuid; c text := ''; n bigint; begin
  t := pg_temp.card('postagem', to_char(now() at time zone 'America/Sao_Paulo' + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  update public.tarefas set tipo = 'edicao' where id = t;
  perform private.cron_alarme('postar', t, now() + interval '5 minutes', 0);  -- o job que a postar-meta armou antes
  begin perform public.tentar_de_novo(t); exception when others then c := sqlstate; end;
  n := pg_temp.chamadas();
  perform private.alarme_tocou('postar', t, 0);
  insert into r values ('F5+F9', case when c = '42501' and pg_temp.chamadas() = n and not pg_temp.tem_job(t) then 'ok' else 'FALHA: sqlstate ' || c || ' job ' || pg_temp.tem_job(t) end);
end $$;

-- F8: vídeo novo pendente: o alarme não fica tocando; quando a marca sai, a função é chamada
do $$ declare t uuid; n bigint; job boolean; begin
  t := pg_temp.card('postagem', to_char(now() at time zone 'America/Sao_Paulo' + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  update public.tarefas set video_pendente_desde = now() where id = t;
  update public.tarefas set postar_em = '2026-01-01T10:00' where id = t;  -- a hora chega com a marca ainda lá
  job := pg_temp.tem_job(t);
  n := pg_temp.chamadas();
  update public.tarefas set video_pendente_desde = null where id = t;
  insert into r values ('F8', case when not job and pg_temp.chamadas() > n then 'ok' else 'FALHA: job ' || job || ' chamou ' || (pg_temp.chamadas() - n) end);
end $$;

-- F9: programado para mais tarde, um toque velho NÃO tira o alarme novo
do $$ declare t uuid; begin
  t := pg_temp.card('postagem', to_char(now() at time zone 'America/Sao_Paulo' + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  perform private.alarme_tocou('postar', t, 3);
  insert into r values ('F9 alarme novo fica', case when pg_temp.tem_job(t) then 'ok' else 'FALHA: o alarme novo sumiu' end);
end $$;

select item || ' ' || res as prova from r order by item;
