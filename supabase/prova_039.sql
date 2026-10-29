-- Prova do 039 (pente fino r4). Roda numa CÓPIA local do banco (Postgres/PGlite com stubs), nunca no projeto real.
create temp table r (item text, res text);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1', 'prova-natham@local') on conflict do nothing;
update public.pessoas set user_id = '00000000-0000-0000-0000-0000000000a1' where slug = 'natham';
create function pg_temp.logado() returns void language sql as $$ select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1"}', false) $$;
create function pg_temp.sem_login() returns void language sql as $$ select set_config('request.jwt.claims', '{}', false) $$;
create function pg_temp.card(p_etapa text, p_quando text) returns uuid language sql as $$
  insert into public.tarefas (titulo, tipo, empresa_id, etapa, responsavel_id, dono_id, criado_por, formato, postar_redes, postar_em)
  select 'prova', 'postagem', 'you', p_etapa, p.id, p.id, p.id, 'reels', '{instagram}', p_quando from public.pessoas p where p.slug = 'natham'
  returning id $$;
create function pg_temp.chamadas() returns bigint language sql as $$ select count(*) from net.chamadas $$;
create function pg_temp.marca(t uuid) returns boolean language sql as $$ select video_pendente_desde is not null from public.tarefas where id = t $$;
create function pg_temp.passou() returns text language sql as $$ select to_char(now() at time zone 'America/Sao_Paulo' - interval '1 minute', 'YYYY-MM-DD"T"HH24:MI') $$;

-- A6: a segunda limpeza não começa; a primeira (crachá vencido) não solta a trava da que assumiu depois
do $$ declare t uuid; a timestamptz; b timestamptz; c timestamptz; e text := ''; begin
  t := pg_temp.card('postado', null);
  a := public.iniciar_limpeza_card(t);
  b := public.iniciar_limpeza_card(t);
  update public.tarefas set limpando_desde = now() - interval '11 minutes' where id = t returning limpando_desde into a;  -- a primeira passou dos 10 min
  c := public.iniciar_limpeza_card(t);
  perform public.terminar_limpeza_card(t, a);  -- a primeira termina com o crachá dela
  begin update public.tarefas set etapa = 'edicao' where id = t; exception when others then e := sqlstate; end;
  perform public.terminar_limpeza_card(t, c);
  update public.tarefas set etapa = 'edicao' where id = t;
  insert into r values ('A6', case when b is null and c is not null and e = '55006' then 'ok' else 'FALHA: segunda ' || coalesce(b::text, 'nulo') || ' sqlstate ' || e end);
end $$;

-- A7: duas confirmações; a primeira registra e a postagem NÃO acorda; a segunda registra e acorda
do $$ declare t uuid; n bigint; m1 boolean; n1 bigint; begin
  t := pg_temp.card('aprovado', to_char(now() at time zone 'America/Sao_Paulo' + interval '2 days', 'YYYY-MM-DD"T"HH24:MI'));
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'e1');
  perform public.marcar_video_pendente(t, 'e2');
  perform pg_temp.sem_login();
  update public.tarefas set postar_em = pg_temp.passou() where id = t;
  n := pg_temp.chamadas();
  perform public.registrar_video(t, 'e1', jsonb_build_object('drive_id', 'v1-' || t, 'nome', 'v1', 'tipo', 'video', 'tamanho', 1, 'papel', 'anexo', 'ordem', 0));
  m1 := pg_temp.marca(t); n1 := pg_temp.chamadas();
  perform public.registrar_video(t, 'e2', jsonb_build_object('drive_id', 'v2-' || t, 'nome', 'v2', 'tipo', 'video', 'tamanho', 1, 'papel', 'anexo', 'ordem', 1));
  insert into r values ('A7', case when m1 and n1 = n and not pg_temp.marca(t) and pg_temp.chamadas() > n1
    and (select count(*) from public.arquivos where tarefa_id = t) = 2 then 'ok' else 'FALHA: marca depois do 1o ' || m1 || ', chamou no 1o ' || (n1 - n) end);
end $$;

-- Novo 3: confirmação repetida (vídeo já registrado) também tira o id da lista e solta a marca
do $$ declare t uuid; begin
  t := pg_temp.card('aprovado', null);
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'e1');
  perform pg_temp.sem_login();
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (t, 'v-' || t, 'v', 'video', 1);  -- registrado por outra volta
  perform public.video_chegou(t, 'e1');
  insert into r values ('Novo 3 repetida', case when not pg_temp.marca(t) and (select cardinality(videos_pendentes) from public.tarefas where id = t) = 0 then 'ok' else 'FALHA: ainda pendente' end);
end $$;

-- Bug 1 (r4 final): tirar o envio da lista (tela antiga) NÃO libera a postagem vencida; a marca fica até o vídeo chegar ou o clique
do $$ declare t uuid; n bigint; begin
  t := pg_temp.card('aprovado', null);
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'e1');
  perform pg_temp.sem_login();
  update public.tarefas set postar_em = pg_temp.passou() where id = t;
  n := pg_temp.chamadas();
  -- a tela fecha o aviso do envio que falhou: a 1a versão do 039 tirava da lista por desistir_envio (e soltava a marca); hoje a tela não mexe no banco
  if exists (select 1 from pg_proc where proname = 'desistir_envio') then perform public.desistir_envio(t, 'e1'); end if;
  update public.tarefas set videos_pendentes = '{}' where id = t;  -- nem a lista vazia solta a marca
  insert into r values ('Bug 1 lista vazia nao libera', case when pg_temp.marca(t) and pg_temp.chamadas() = n
    and not exists (select 1 from public.postagens where tarefa_id = t and status in ('fila', 'enviando')) then 'ok' else 'FALHA' end);
end $$;

-- Novo 3 + bug 2: envio abandonado. UM alarme para as 3 h; com 3 h, TODA rede aberta (até processando) vira erro e a marca FICA; nada é chamado.
-- Depois, só o clique "Postar com o vídeo atual" (ou o vídeo novo chegar) devolve as redes à fila e chama a função.
do $$ declare t uuid; job text; n bigint; s1 text; s2 text; n2 bigint; s3 text; begin
  t := pg_temp.card('aprovado', null);
  update public.tarefas set postar_redes = '{instagram,facebook}' where id = t;
  perform pg_temp.logado();
  perform public.marcar_video_pendente(t, 'morto');
  perform pg_temp.sem_login();
  insert into public.postagens (tarefa_id, rede, status, conteiner_id) values (t, 'instagram', 'processando', '123|abc');  -- rascunho do vídeo antigo
  update public.tarefas set postar_em = pg_temp.passou() where id = t;
  select schedule into job from cron.job where jobname = private.alarme_nome('postar', t);
  update public.tarefas set video_pendente_desde = now() - interval '4 hours' where id = t;
  n := pg_temp.chamadas();
  perform private.alarme_tocou('postar', t, 0);
  select status into s1 from public.postagens where tarefa_id = t and rede = 'instagram';
  select status into s2 from public.postagens where tarefa_id = t and rede = 'facebook';
  n2 := pg_temp.chamadas();
  perform private.alarme_tocou('postar', t, 0);  -- tocar de novo também não solta nada
  insert into r values ('Novo 3 abandonado', case when job is not null and s1 = 'erro' and s2 = 'erro' and pg_temp.marca(t) and n2 = n and pg_temp.chamadas() = n
    and not exists (select 1 from cron.job where jobname = private.alarme_nome('postar', t)) then 'ok' else 'FALHA: job ' || coalesce(job, '-') || ' ' || coalesce(s1, '-') || '/' || coalesce(s2, '-') end);
  perform pg_temp.logado();
  perform public.liberar_video_pendente(t);  -- o clique explícito
  perform pg_temp.sem_login();
  select status into s3 from public.postagens where tarefa_id = t and rede = 'instagram';
  insert into r values ('Novo 3 clique libera', case when s3 = 'fila' and pg_temp.chamadas() > n then 'ok' else 'FALHA: ' || coalesce(s3, '-') end);
end $$;

-- Novo 1: rede acrescentada no meio: não move para Postado e avisa que falta; com tudo postado, move
do $$ declare t uuid; a text; b text; e text; begin
  t := pg_temp.card('aprovado', null);
  insert into public.postagens (tarefa_id, rede, status) values (t, 'instagram', 'postado');
  update public.tarefas set postar_redes = '{instagram,facebook}' where id = t;
  a := public.concluir_postagem(t);
  insert into public.postagens (tarefa_id, rede, status) values (t, 'facebook', 'postado');
  b := public.concluir_postagem(t);
  select etapa into e from public.tarefas where id = t;
  insert into r values ('Novo 1', case when a = 'falta' and b = 'postado' and e = 'postado' then 'ok' else 'FALHA: ' || a || '/' || b || ' etapa ' || e end);
end $$;

-- F2: card já postado volta para Aprovado (sem data, livre); programar de novo é recusado; card com rede ainda sem post programa
do $$ declare t uuid; u uuid; c text := ''; d text := ''; begin
  t := pg_temp.card('aprovado', null);
  insert into public.postagens (tarefa_id, rede, status) values (t, 'instagram', 'postado');
  update public.tarefas set etapa = 'postado' where id = t;
  update public.tarefas set etapa = 'aprovado' where id = t;  -- voltar é livre
  begin update public.tarefas set postar_em = '2026-12-01T10:00' where id = t; exception when others then c := sqlstate || ' ' || sqlerrm; end;
  u := pg_temp.card('aprovado', null);
  update public.tarefas set postar_redes = '{instagram,facebook}' where id = u;
  insert into public.postagens (tarefa_id, rede, status) values (u, 'instagram', 'postado'), (u, 'facebook', 'erro');
  begin update public.tarefas set postar_em = '2026-12-01T10:00' where id = u; exception when others then d := sqlstate; end;
  insert into r values ('F2', case when c = '55000 Este card já foi postado. Para postar de novo, duplique o card.' and d = '' then 'ok' else 'FALHA: ' || c || ' / ' || d end);
end $$;

-- Relógio da pauta: o de 5 em 5 minutos saiu, a geração diária não risca, e só UM gatilho risca quando o card entra em Postado
do $$ declare p uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date; tg uuid; t uuid; feito boolean; begin
  perform pg_temp.logado();
  p := public.salvar_planejada(jsonb_build_object('empresa_id', 'you', 'formato', 'reels', 'hora', '10:00', 'titulo', 'Pauta', 'repete', 'data',
    'data', hoje::text, 'responsavel', 'matheus'));
  perform pg_temp.sem_login();
  select g.tarefa_id into tg from public.postagens_planejadas_geradas g where g.planejada_id = p and g.dia = hoje;
  update public.tarefas set concluida = false where id = tg;
  t := pg_temp.card('aprovado', null);
  insert into public.postagens (tarefa_id, rede, status) values (t, 'instagram', 'postado');
  update public.tarefas set etapa = 'postado' where id = t;
  select concluida into feito from public.tarefas where id = tg;
  insert into r values ('Pauta avisada', case when tg is not null and feito and not exists (select 1 from cron.job where jobname = 'postagens_riscar')
    and (select command from cron.job where jobname = 'postagens_gerar') not like '%riscar%'
    and (select count(*) from pg_trigger where tgrelid = 'public.tarefas'::regclass and tgname like '%risca%') = 1
    then 'ok' else 'FALHA: tarefa ' || coalesce(tg::text, '-') || ' feita ' || coalesce(feito::text, '-') end);
end $$;

-- Bug 4: falha na pauta (início impossível, 31/02) não impede o card de entrar em Postado
do $$ declare t uuid; e text; begin
  t := pg_temp.card('aprovado', null);
  set local session_replication_role = replica;  -- só para gravar o início impossível que o formato de texto aceita
  update public.tarefas set inicio = '2026-02-31T10:00' where id = t;
  set local session_replication_role = origin;
  insert into public.postagens (tarefa_id, rede, status) values (t, 'instagram', 'postado');
  begin update public.tarefas set etapa = 'postado' where id = t; exception when others then e := sqlerrm; end;
  insert into r values ('Bug 4 pauta nao trava', case when e is null and (select etapa from public.tarefas where id = t) = 'postado' then 'ok' else 'FALHA: ' || coalesce(e, '-') end);
end $$;

-- Limpeza que falha sempre: 30 dias depois do ÚLTIMO prazo armado o alarme desiste (não chama a função nem se rearma)
do $$ declare t uuid; n bigint; ok1 boolean; begin
  t := pg_temp.card('aprovado', null);
  insert into public.postagens (tarefa_id, rede, status) values (t, 'instagram', 'postado');
  update public.tarefas set etapa = 'postado' where id = t;
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (t, 'd-' || t, 'f', 'imagem', 1);
  set local session_replication_role = replica;  -- só para envelhecer as datas na prova (o gatilho do banco protege postado_em)
  update public.tarefas set postado_em = now() - interval '45 days', limpeza_armada_em = now() - interval '38 days' where id = t;
  set local session_replication_role = origin;
  n := pg_temp.chamadas();
  perform private.alarme_tocou('limpar', t, 5);
  ok1 := pg_temp.chamadas() = n and not exists (select 1 from cron.job where jobname = private.alarme_nome('limpar', t));
  -- Bug 3: desligar o Permanente (ou arquivo novo) rearma 7 dias: o corte conta desse prazo novo, e a limpeza acontece
  perform public.armar_alarme_servico('limpar', t, 7 * 24 * 60);
  n := pg_temp.chamadas();
  perform private.alarme_tocou('limpar', t, 0);
  insert into r values ('Limpeza desiste e prazo novo vale', case when ok1 and pg_temp.chamadas() = n + 1 then 'ok' else 'FALHA: desistiu ' || ok1 end);
end $$;

-- resultado
select item || ' ' || res as prova from r order by item;
