-- Prova do 038 (pente fino r3). Roda numa CÓPIA local do banco (Postgres/PGlite com stubs), nunca no projeto real.
create temp table r (item text, res text);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'prova-natham@local');
update public.pessoas set user_id = '00000000-0000-0000-0000-0000000000a1' where slug = 'natham';
create function pg_temp.logado() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false) $$;
create function pg_temp.sem_login() returns void language sql as $$ select set_config('request.jwt.claims', '{}', false) $$;
create function pg_temp.card(p_etapa text, p_quando text) returns uuid language sql as $$
  insert into public.tarefas (titulo, tipo, empresa_id, etapa, responsavel_id, dono_id, criado_por, formato, postar_redes, postar_em)
  select 'prova', 'postagem', 'you', p_etapa, p.id, p.id, p.id, 'reels', '{instagram}', p_quando from public.pessoas p where p.slug = 'natham'
  returning id $$;
create function pg_temp.chamadas() returns bigint language sql as $$ select count(*) from net.chamadas $$;

-- A6: enquanto a limpeza trabalha, o card não sai de Postado; depois sai
do $$ declare t uuid; c text := ''; ok text; nao text; e text; begin  -- ok/nao em texto: o 038 devolve sim/não, o 039 devolve o crachá ou nulo
  t := pg_temp.card('postado', null);
  ok := public.iniciar_limpeza_card(t)::text;
  begin update public.tarefas set etapa = 'edicao' where id = t; exception when others then c := sqlstate; end;
  perform public.terminar_limpeza_card(t);
  update public.tarefas set etapa = 'edicao' where id = t;
  select etapa into e from public.tarefas where id = t;
  nao := public.iniciar_limpeza_card(t)::text;  -- já não está em Postado: a limpeza não começa
  insert into r values ('A6', case when coalesce(ok, 'false') <> 'false' and c = '55006' and e = 'edicao' and coalesce(nao, 'false') = 'false' then 'ok' else 'FALHA: iniciou ' || coalesce(ok, '-') || ' sqlstate ' || c || ' etapa ' || e end);
end $$;

-- A7: dois vídeos do mesmo card; o primeiro chega e a postagem NÃO acorda; o segundo chega e acorda
do $$ declare t uuid; n bigint; marca1 boolean; n1 bigint; begin
  t := pg_temp.card('aprovado', to_char(now() at time zone 'America/Sao_Paulo' + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'e1');
  perform public.marcar_video_pendente(t, 'e2');
  perform public.marcar_video_pendente(t, 'e2');  -- repetir é seguro
  perform pg_temp.sem_login();
  update public.tarefas set postar_em = '2026-01-01T10:00' where id = t;  -- a hora chega com os vídeos subindo
  n := pg_temp.chamadas();
  perform public.video_chegando(t, 'e1');
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (t, 'v1-' || t, 'v1', 'video', 1);
  select video_pendente_desde is not null into marca1 from public.tarefas where id = t;
  n1 := pg_temp.chamadas();
  perform public.video_chegando(t, 'e2');
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (t, 'v2-' || t, 'v2', 'video', 1);
  insert into r values ('A7', case when marca1 and n1 = n and pg_temp.chamadas() > n1 and not (select video_pendente_desde is not null from public.tarefas where id = t)
    then 'ok' else 'FALHA: marca depois do 1o ' || marca1 || ', chamou no 1o ' || (n1 - n) end);
end $$;

-- Achado 2 do r3-ferreiro: vídeo enfileirado em Edição; o card é aprovado no meio do envio: a marca liga
do $$ declare t uuid; m boolean; begin
  t := pg_temp.card('edicao', null);
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'e1');
  update public.tarefas set etapa = 'aprovado' where id = t;
  perform pg_temp.sem_login();
  select video_pendente_desde is not null into m from public.tarefas where id = t;
  insert into r values ('A7 ao aprovar', case when m then 'ok' else 'FALHA: aprovou sem a marca' end);
end $$;

-- A7: "Postar com o vídeo atual" limpa a lista
do $$ declare t uuid; l text[]; begin
  t := pg_temp.card('aprovado', null);
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'e9');
  perform public.liberar_video_pendente(t);
  perform pg_temp.sem_login();
  select videos_pendentes into l from public.tarefas where id = t;
  insert into r values ('A7 liberar', case when cardinality(l) = 0 then 'ok' else 'FALHA: lista ' || l::text end);
end $$;

-- N7: título apagado só num dia da série fica vazio nesse dia
do $$ declare p uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date; tit text; begin
  perform pg_temp.logado();
  p := public.salvar_planejada(jsonb_build_object('empresa_id', 'you', 'formato', 'post', 'hora', '10:00', 'titulo', 'Série X', 'repete', 'semana',
    'dias_semana', jsonb_build_array(0, 1, 2, 3, 4, 5, 6), 'inicio', hoje::text, 'responsavel', 'matheus'));
  perform public.salvar_planejada(jsonb_build_object('id', p, 'empresa_id', 'you', 'formato', 'post', 'hora', '10:00', 'titulo', null, 'repete', 'semana',
    'dias_semana', jsonb_build_array(0, 1, 2, 3, 4, 5, 6), 'responsavel', 'matheus'), 'dia', hoje + 2);
  perform pg_temp.sem_login();
  select coalesce(o.titulo, '<nulo>') into tit from private.ocorrencias(hoje + 2, hoje + 2) o where o.planejada_id = p;
  insert into r values ('N7', case when tit = '' then 'ok' else 'FALHA: titulo do dia = ' || tit end);
end $$;

select item || ' ' || res as prova from r order by item;
