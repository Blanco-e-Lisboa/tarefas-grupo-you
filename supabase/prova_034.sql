-- Prova do 034 (pente fino r1). Roda numa CÓPIA local do banco (Postgres/PGlite com stubs), nunca no projeto real.
-- Cada bloco devolve uma linha 'ok <item>' ou 'FALHA <item>: ...'. Sem login (auth.uid nulo), como o despertador.
create temp table r (item text, res text);
create function pg_temp.card(p_empresa text, p_formato text, p_redes text[], p_quando text) returns uuid language sql as $$
  insert into public.tarefas (titulo, tipo, empresa_id, etapa, responsavel_id, dono_id, criado_por, formato, postar_redes, postar_em)
  select 'prova', 'postagem', p_empresa, 'aprovado', p.id, p.id, p.id, p_formato, p_redes, p_quando from public.pessoas p where p.slug = 'natham'
  returning id $$;

-- A4: rede que estourou as voltas (rodadas 6) volta para a fila com "Tentar de novo"
do $$ declare t uuid; s text; n int; begin
  t := pg_temp.card('you', 'reels', '{instagram}', '2026-01-01T10:00');
  delete from public.postagens where tarefa_id = t;
  insert into public.postagens (tarefa_id, rede, status, erro, rodadas, tentativas) values (t, 'instagram', 'erro', 'Estado incerto: a postagem travou', 6, 3);
  select count(*) into n from net.chamadas;
  perform public.tentar_de_novo(t);
  select status into s from public.postagens where tarefa_id = t;
  insert into r values ('A4', case when s = 'fila' and (select count(*) from net.chamadas) > n then 'ok' else 'FALHA: status ' || s end);
end $$;

-- M12: Instagram já postado, Facebook acrescentado depois: o alarme chama a função
do $$ declare t uuid; n int; begin
  t := pg_temp.card('you', 'post', '{instagram,facebook}', '2026-01-01T10:00');
  delete from public.postagens where tarefa_id = t;
  insert into public.postagens (tarefa_id, rede, status) values (t, 'instagram', 'postado');
  select count(*) into n from net.chamadas;
  perform private.alarme_tocou('postar', t, 0);
  insert into r values ('M12', case when (select count(*) from net.chamadas) > n then 'ok' else 'FALHA: nao chamou a funcao' end);
end $$;

-- M13: card sai de Aprovado com rede em "processando": vira erro "estado incerto"
do $$ declare t uuid; s text; e text; begin
  t := pg_temp.card('you', 'reels', '{instagram}', '2027-03-01T10:00');
  insert into public.postagens (tarefa_id, rede, status, conteiner_id) values (t, 'instagram', 'processando', 'c1');
  update public.tarefas set etapa = 'edicao' where id = t;
  select status, erro into s, e from public.postagens where tarefa_id = t;
  insert into r values ('M13', case when s = 'erro' and e ~* 'estado incerto' then 'ok' else 'FALHA: status ' || s end);
end $$;

-- M1: data em card de outra empresa é recusada; card antigo com data salva notas
do $$ declare t uuid; c text := ''; begin
  begin perform pg_temp.card('tu-ecom', 'post', '{instagram}', '2027-03-01T10:00'); exception when others then c := sqlstate; end;
  alter table public.tarefas disable trigger tarefas_so_you_programa;
  t := pg_temp.card('tu-ecom', 'post', '{instagram}', '2027-03-01T10:00');
  alter table public.tarefas enable trigger tarefas_so_you_programa;
  update public.tarefas set notas = 'mexi' where id = t;
  insert into r values ('M1', case when c = '22023' then 'ok' else 'FALHA: sqlstate ' || c end);
exception when undefined_object then insert into r values ('M1', 'FALHA: sem a trava');
end $$;

-- M4: trocar o Tipo de um card programado desarma o alarme; trocar a empresa larga o Tema da antiga
do $$ declare t uuid; o uuid; j int; temas uuid; begin
  t := pg_temp.card('you', 'post', '{instagram}', '2027-03-01T10:00');
  update public.tarefas set tipo = 'edicao' where id = t;
  select count(*) into j from cron.job where jobname = private.alarme_nome('postar', t);
  insert into public.ocasioes (empresa_id, nome) values ('you', 'prova tema ' || t) returning id into o;
  t := pg_temp.card('you', 'post', '{instagram}', null);
  update public.tarefas set ocasiao_id = o where id = t;
  update public.tarefas set empresa_id = 'tu-ecom' where id = t;
  select ocasiao_id into temas from public.tarefas where id = t;
  insert into r values ('M4', case when j = 0 and temas is null then 'ok' else 'FALHA: alarmes ' || j || ' tema ' || coalesce(temas::text, '-') end);
end $$;

-- A8: carrossel aprovado recebe 2º vídeo: o 1º continua no post; Reels troca (o velho vira original)
do $$ declare c uuid; v uuid; p1 text; p2 text; begin
  c := pg_temp.card('you', 'carrossel', '{instagram}', null);
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (c, 'd1-' || c, 'v1', 'video', 1);
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (c, 'd2-' || c, 'v2', 'video', 1);
  select papel into p1 from public.arquivos where drive_id = 'd1-' || c;
  v := pg_temp.card('you', 'reels', '{instagram}', null);
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (v, 'd1-' || v, 'v1', 'video', 1);
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho) values (v, 'd2-' || v, 'v2', 'video', 1);
  select papel into p2 from public.arquivos where drive_id = 'd1-' || v;
  insert into r values ('A8', case when p1 = 'anexo' and p2 = 'original' then 'ok' else 'FALHA: carrossel ' || p1 || ' reels ' || p2 end);
end $$;

-- (M13b saiu: o 037 trocou a regra. "Tentar de novo" sem data agora recusa, ver supabase/prova_037.sql.)

-- bug 5 pós-Codex: a programação estava sem alarme (a função tinha desarmado); a marca de vídeo pendente sai: o alarme volta e a função é chamada
do $$ declare t uuid; n int; begin
  t := pg_temp.card('you', 'reels', '{instagram}', '2026-01-01T10:00');
  update public.tarefas set video_pendente_desde = now() where id = t;
  perform private.desarmar_alarme('postar', t);
  select count(*) into n from net.chamadas;
  update public.tarefas set video_pendente_desde = null where id = t;
  insert into r values ('bug5', case when (select count(*) from net.chamadas) > n then 'ok' else 'FALHA: ninguem chamou a funcao' end);
end $$;

select item || ' ' || res as prova from r order by item;
