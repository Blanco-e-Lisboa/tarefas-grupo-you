-- Prova do 035 (pente fino r1). Roda numa CÓPIA local do banco (Postgres/PGlite com stubs), nunca no projeto real.
create temp table r (item text, res text);
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'prova-matheus@local');
update public.pessoas set user_id = '00000000-0000-0000-0000-0000000000aa' where slug = 'matheus';

-- M2: série toda semana às 10:00; o Matheus escreve nas notas de uma tarefa; o Natham muda a série para 11:00
do $$ declare p uuid; t uuid; t2 uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date; editada text; cor2 text; novas int; total int; begin
  insert into public.postagens_planejadas (empresa_id, formato, redes, hora, responsavel_id, repete, dias_semana, inicio)
  select 'you', 'post', '{instagram}', '10:00', id, 'semana', '{0,1,2,3,4,5,6}', hoje from public.pessoas where slug = 'matheus' returning id into p;
  perform private.gerar_tarefas_postagens(14, p);
  select tarefa_id into t from public.postagens_planejadas_geradas where planejada_id = p and dia = hoje + 3;
  select tarefa_id into t2 from public.postagens_planejadas_geradas where planejada_id = p and dia = hoje + 5;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', false);  -- o Matheus, logado
  update public.tarefas set notas = 'roteiro do Matheus' where id = t;
  update public.tarefas set cor = 'etiqueta-9', fim = to_char(hoje + 5, 'YYYY-MM-DD') || 'T12:00' where id = t2;  -- só cor e duração (Codex)
  perform set_config('request.jwt.claims', '{}', false);
  update public.postagens_planejadas set hora = '11:00' where id = p;
  perform private.sincronizar_planejada(p);
  select notas into editada from public.tarefas where id = t;
  select cor into cor2 from public.tarefas where id = t2;
  select count(*) filter (where inicio like '%T11:00'), count(*) into novas, total from public.tarefas where planejada_id = p;
  insert into r values ('M2', case when editada = 'roteiro do Matheus' and cor2 = 'etiqueta-9' and novas = total - 2 then 'ok'
    else 'FALHA: notas ' || coalesce(editada, 'APAGADAS') || ', cor ' || coalesce(cor2, 'APAGADA') || ', 11h ' || novas || ' de ' || total end);
end $$;

-- B4: o relógio risca a tarefa de hoje; o Matheus desmarca; o relógio roda de novo e respeita
do $$ declare p uuid; t uuid; hoje date := (now() at time zone 'America/Sao_Paulo')::date; feita boolean; begin
  insert into public.postagens_planejadas (empresa_id, formato, redes, hora, responsavel_id, repete, data, inicio)
  select 'you', 'story', '{instagram}', '09:00', id, 'data', hoje, hoje from public.pessoas where slug = 'matheus' returning id into p;
  perform private.gerar_tarefas_postagens(14, p);
  select tarefa_id into t from public.postagens_planejadas_geradas where planejada_id = p;
  insert into public.tarefas (titulo, tipo, empresa_id, etapa, formato, responsavel_id, dono_id, criado_por, inicio)
  select 'story postado', 'outro', 'you', 'postado', 'story', id, id, id, to_char(hoje, 'YYYY-MM-DD') from public.pessoas where slug = 'natham';
  perform private.riscar_postagens();
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000aa"}', false);
  update public.tarefas set concluida = false where id = t;
  perform set_config('request.jwt.claims', '{}', false);
  perform private.riscar_postagens();
  select concluida into feita from public.tarefas where id = t;
  insert into r values ('B4', case when not feita then 'ok' else 'FALHA: o relogio marcou de novo' end);
end $$;

select item || ' ' || res as prova from r order by item;
