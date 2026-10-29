-- 039 · Pente fino r4 (29/10/2026). Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM.
-- Idempotente. Depende do 034, 035, 037 e 038 (aplicar depois deles; convive com o 040 e o 041 do Lince). NÃO aplicado: o Natham cola no SQL Editor.
-- Provado num Postgres local com o mesmo código de produção (supabase/prova_039.sql).
--
--  A6  Duas limpezas do mesmo card: só uma começa (a outra recebe nulo). Cada limpeza recebe um "crachá" (a hora em que começou)
--      e só solta a trava com o próprio crachá: a que terminar primeiro não apaga a trava da outra.
--  A7  O vídeo que chegou é registrado E sai da lista de envios na MESMA gravação (registrar_video). A marca "vídeo novo pendente"
--      só sai quando a lista do card fica vazia, depois do registro. Duas confirmações ao mesmo tempo não liberam a postagem antes da hora.
--  Novo 3 (banco)  Confirmação repetida de um vídeo já registrado também tira o id da lista (video_chegou).
--      Retomada: a tela do Lince guarda o id do envio interrompido ou que falhou e o próximo envio de vídeo do card reusa esse id.
--      Fechar o aviso na tela não mexe no banco: a marca "vídeo novo pendente" fica até o vídeo novo chegar ou o clique "Postar com o vídeo atual".
--      Envio abandonado (aba fechada, envio que nunca chega): na hora do post, se a marca tem menos de 3 horas, fica UM alarme para quando
--      ela fizer 3 horas; com 3 horas, toda rede ainda aberta (fila, enviando, processando) vira erro com o motivo, e a marca FICA.
--      Nada retoma o rascunho antigo sozinho. Quando a marca sai (vídeo novo chegou ou o clique "Postar com o vídeo atual"),
--      essas redes voltam para a fila e a postagem segue.
--  Regra de ouro dos vídeos: vídeo novo pendente só deixa sair o antigo com o clique "Postar com o vídeo atual"; nenhum aviso fechado,
--      prazo ou limpeza libera sozinho.
--  Novo 1  Mover para Postado confere as redes escolhidas AGORA, na mesma gravação (concluir_postagem). Rede acrescentada no meio: o card fica
--      em Aprovado e a função avisa que falta rede, para ela se armar e postar a rede nova.
--  F2  Decisão do Natham (b): card cujas redes escolhidas JÁ têm post publicado não posta de novo. Programar a data, aprovar com data ou
--      "Postar agora": recusado (55000) "Este card já foi postado. Para postar de novo, duplique o card." Combinado com o Lince (tela).
--  Relógios (regra do Natham: acordar quando avisado, nada de perguntar em intervalo)
--      - postagens_riscar (de 5 em 5 minutos) sai. O "feita" da pauta já é riscado pelo gatilho do 315 (tarefas_risca_pauta) quando um card
--        ENTRA em Postado, e pelo 035 quando a pauta muda. Falha nesse gatilho continua sendo só aviso no log: o card entra em Postado igual.
--      - Limpeza dos 7 dias que falha sempre (Drive fora): o alarme tentava de novo sem fim. Agora desiste 30 dias depois do ÚLTIMO prazo
--        armado (entrar em Postado, desligar o Permanente ou arquivo novo rearmam o prazo e zeram essa conta).
begin;

-- ===== A6 =====
drop function if exists public.iniciar_limpeza_card(uuid);
create function public.iniciar_limpeza_card(p_tarefa uuid) returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v timestamptz;
begin
  -- trava de linha: duas limpezas ao mesmo tempo, a segunda espera a primeira gravar e então acha a trava (nulo = não comece)
  update public.tarefas set limpando_desde = clock_timestamp()
  where id = p_tarefa and etapa = 'postado' and (limpando_desde is null or limpando_desde <= now() - interval '10 minutes')
  returning limpando_desde into v;
  return v;
end $$;
revoke all on function public.iniciar_limpeza_card(uuid) from public, anon, authenticated;
grant execute on function public.iniciar_limpeza_card(uuid) to service_role;

drop function if exists public.terminar_limpeza_card(uuid);
create or replace function public.terminar_limpeza_card(p_tarefa uuid, p_desde timestamptz default null) returns void
language sql security definer set search_path = ''
as $$ update public.tarefas set limpando_desde = null where id = p_tarefa and limpando_desde is not null and (p_desde is null or limpando_desde = p_desde) $$;
revoke all on function public.terminar_limpeza_card(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.terminar_limpeza_card(uuid, timestamptz) to service_role;

-- ===== A7 e novo 3 =====
-- O envio sai da lista DEPOIS de o vídeo estar registrado; lista vazia = a marca sai (e o gatilho do 034 rearma a postagem).
create or replace function public.video_chegou(p_tarefa uuid, p_envio text) returns void
language sql security definer set search_path = ''
as $$
  update public.tarefas set videos_pendentes = array_remove(videos_pendentes, p_envio),
    video_pendente_desde = case when cardinality(array_remove(videos_pendentes, p_envio)) = 0 then null else video_pendente_desde end
  where id = p_tarefa and p_envio = any (videos_pendentes)
$$;
revoke all on function public.video_chegou(uuid, text) from public, anon, authenticated;
grant execute on function public.video_chegou(uuid, text) to service_role;

-- Registro do arquivo e saída da lista numa gravação só. Arquivo repetido (mesmo drive_id) dá 23505 e nada muda.
create or replace function public.registrar_video(p_tarefa uuid, p_envio text, p_linha jsonb) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  insert into public.arquivos (tarefa_id, drive_id, nome, tipo, tamanho, papel, ordem, criado_por)
  values (p_tarefa, p_linha->>'drive_id', p_linha->>'nome', p_linha->>'tipo', (p_linha->>'tamanho')::bigint, p_linha->>'papel',
    (p_linha->>'ordem')::int, nullif(p_linha->>'criado_por', '')::uuid)
  returning id into v;
  perform public.video_chegou(p_tarefa, p_envio);
  return v;
end $$;
revoke all on function public.registrar_video(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_video(uuid, text, jsonb) to service_role;

-- ===== Novo 1 =====
-- 'postado': moveu. 'falta': alguma rede escolhida AGORA ainda não tem linha (a função se arma para postá-la). 'espera': o resto.
create or replace function public.concluir_postagem(p_tarefa uuid) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  update public.tarefas t set etapa = 'postado'
  where t.id = p_tarefa and t.etapa = 'aprovado' and cardinality(t.postar_redes) > 0
    and not exists (select 1 from unnest(t.postar_redes) r
      where not exists (select 1 from public.postagens p where p.tarefa_id = t.id and p.rede = r and p.status = 'postado'));
  if found then return 'postado'; end if;
  if exists (select 1 from public.tarefas t, unnest(t.postar_redes) r where t.id = p_tarefa and t.etapa = 'aprovado'
      and not exists (select 1 from public.postagens p where p.tarefa_id = t.id and p.rede = r)) then return 'falta'; end if;
  return 'espera';
end $$;
revoke all on function public.concluir_postagem(uuid) from public, anon, authenticated;
grant execute on function public.concluir_postagem(uuid) to service_role;

-- ===== F2 =====
-- Antes de gravar. O nome "tarefas_y_" faz rodar depois de tarefas_aprovacao e tarefas_volta_postado (ordem alfabética), que já apagaram a data
-- de quem não está em Aprovado/Postado e de quem volta de Postado para Aprovado (voltar sem data continua livre).
create or replace function private.tarefas_ja_postado() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.etapa = 'aprovado' and new.postar_em is not null and new.tipo = 'postagem' and new.empresa_id = 'you' and cardinality(new.postar_redes) > 0
     and (tg_op = 'INSERT' or new.postar_em is distinct from old.postar_em or old.etapa is distinct from 'aprovado')
     and not exists (select 1 from unnest(new.postar_redes) r
       where not exists (select 1 from public.postagens p where p.tarefa_id = new.id and p.rede = r and p.status = 'postado')) then
    raise exception 'Este card já foi postado. Para postar de novo, duplique o card.' using errcode = '55000';
  end if;
  return new;
end $$;
drop trigger if exists tarefas_y_ja_postado on public.tarefas;
create trigger tarefas_y_ja_postado before insert or update on public.tarefas for each row execute function private.tarefas_ja_postado();

-- ===== Relógio da pauta: só por aviso (gatilho tarefas_risca_pauta do 315, que já existe), não de 5 em 5 minutos =====
do $$ begin
  if exists (select 1 from cron.job where jobname = 'postagens_riscar') then perform cron.unschedule('postagens_riscar'); end if;
end $$;

-- ===== Vídeo abandonado (novo 3) =====
create or replace function private.erro_video_abandonado() returns text language sql immutable set search_path = ''
as $$ select 'O video novo nao chegou em 3 horas. Suba o video de novo ou use Postar com o video atual.'::text $$;
revoke all on function private.erro_video_abandonado() from public, anon, authenticated;

-- A marca saiu (vídeo novo chegou ou "Postar com o vídeo atual"): as redes paradas pelo prazo voltam para a fila.
-- AFTER roda em ordem alfabética: "tarefas_abandono_volta" vem antes de "tarefas_alarmes", que rearma a postagem e acha as redes na fila.
create or replace function private.tarefas_abandono_volta() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.postagens set status = 'fila', erro = null, rodadas = 0, tentativas = 0
  where tarefa_id = new.id and status = 'erro' and erro = private.erro_video_abandonado();
  return null;
end $$;
revoke all on function private.tarefas_abandono_volta() from public, anon, authenticated;
drop trigger if exists tarefas_abandono_volta on public.tarefas;
create trigger tarefas_abandono_volta after update of video_pendente_desde on public.tarefas for each row
  when (old.video_pendente_desde is not null and new.video_pendente_desde is null) execute function private.tarefas_abandono_volta();

-- ===== Limpeza: a conta dos 30 dias começa no ÚLTIMO prazo armado (o de 1 h, depois de uma falha, não zera) =====
alter table public.tarefas add column if not exists limpeza_armada_em timestamptz;
create or replace function private.armar_alarme(p_tipo text, p_tarefa uuid, p_quando timestamptz) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- a expressão do cron não tem ano: alarme a mais de ~1 ano tocaria cedo demais e se apagaria sem postar
  if p_quando > now() + interval '300 days' then raise exception 'alarme a mais de 300 dias nao e aceito' using errcode = '22023'; end if;
  -- 039: prazo novo de limpeza (7 dias: Postado, Permanente desligado, arquivo novo) zera a conta de desistir
  if p_tipo = 'limpar' and p_quando > now() + interval '1 day' then update public.tarefas set limpeza_armada_em = now() where id = p_tarefa; end if;
  if p_quando <= now() then perform private.alarme_tocou(p_tipo, p_tarefa, 0); return; end if;
  -- 236: o cron só olha minuto cheio. Hora dentro do minuto que está passando (daqui a menos de 1 min) vai para o PRÓXIMO minuto cheio, senão só tocaria no ano que vem.
  perform private.cron_alarme(p_tipo, p_tarefa, greatest(p_quando, date_trunc('minute', now()) + interval '1 minute'), 0);
end $$;
revoke all on function private.armar_alarme(text, uuid, timestamptz) from public, anon, authenticated;

-- ===== alarme_tocou (o do 037, com o novo 3 e o limite da limpeza) =====
create or replace function private.alarme_tocou(p_tipo text, p_tarefa uuid, p_rodada int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := private.alarme_nome(p_tipo, p_tarefa); v_segredo text; v_rodadas int; v_aberto boolean; v_tem boolean; v_falta boolean; v_desde timestamptz;
  c_teto constant int := 5;  -- combinado com o Correio
begin
  if p_tipo = 'postar' and not private.postagem_automatica() then
    if exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;
    return;
  end if;
  if p_tipo = 'postar' and not exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'aprovado' and t.postar_em is not null
       and t.tipo = 'postagem' and t.empresa_id = 'you'  -- F5: o mesmo que a catraca pega
       and t.postar_em <= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI')) then
    -- F9: fora de programação, o job sai; programado para mais tarde, o job com esse nome é o alarme novo e fica
    if not exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'aprovado' and t.postar_em is not null and t.tipo = 'postagem' and t.empresa_id = 'you')
       and exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;
    return;
  end if;
  if p_tipo = 'limpar' and not exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'postado') then
    if exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;  -- F9
    return;
  end if;
  if exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;
  if p_tipo = 'postar' then
    select video_pendente_desde into v_desde from public.tarefas where id = p_tarefa;
    if v_desde > now() - interval '3 hours' then
      -- F8 + novo 3: vídeo novo a caminho. Não posta e não fica tocando: o gatilho do 034 rearma quando a marca sai; senão, UM alarme quando ela fizer 3 h
      perform private.cron_alarme('postar', p_tarefa, greatest(v_desde + interval '3 hours', date_trunc('minute', now()) + interval '1 minute'), 0);
      return;
    elsif v_desde is not null then
      -- novo 3: o envio foi abandonado. Toda rede aberta vira erro com o motivo (o rascunho fica guardado) e a MARCA FICA: nada retoma o
      -- vídeo antigo sozinho. Quando a marca sai (vídeo novo ou o clique "Postar com o vídeo atual"), tarefas_abandono_volta devolve à fila.
      insert into public.postagens (tarefa_id, rede, status, erro)
      select t.id, r, 'erro', private.erro_video_abandonado()
      from public.tarefas t, unnest(t.postar_redes) r where t.id = p_tarefa
      on conflict (tarefa_id, rede) do update set status = 'erro', erro = excluded.erro where public.postagens.status in ('fila', 'enviando', 'processando');
      return;
    end if;
  end if;
  if p_tipo = 'limpar' and not exists (select 1 from public.arquivos a where a.tarefa_id = p_tarefa and a.drive_id is not null) then return; end if;
  -- limpeza que falha sempre: desiste 30 dias depois do ÚLTIMO prazo armado (os arquivos ficam no Drive; nada se perde)
  if p_tipo = 'limpar' and exists (select 1 from public.tarefas t where t.id = p_tarefa
       and coalesce(t.limpeza_armada_em, t.postado_em + interval '7 days') < now() - interval '30 days') then return; end if;
  if p_tipo = 'postar' then
    select coalesce(max(p.rodadas) filter (where p.status not in ('postado', 'erro')), 0), coalesce(bool_or(p.status not in ('postado', 'erro')), false), count(*) > 0
      into v_rodadas, v_aberto, v_tem from public.postagens p join public.tarefas t on t.id = p.tarefa_id
      where p.tarefa_id = p_tarefa and p.rede = any (t.postar_redes);
    select exists (select 1 from public.tarefas t, unnest(t.postar_redes) r where t.id = p_tarefa
      and not exists (select 1 from public.postagens p where p.tarefa_id = t.id and p.rede = r)) into v_falta;
    if v_tem and not v_aberto and not v_falta then
      if not exists (select 1 from public.tarefas t, unnest(t.postar_redes) r where t.id = p_tarefa
           and not exists (select 1 from public.postagens p where p.tarefa_id = t.id and p.rede = r and p.status = 'postado')) then
        update public.tarefas set etapa = 'postado' where id = p_tarefa and etapa = 'aprovado' and cardinality(postar_redes) > 0;
      end if;
      return;
    end if;
  else
    v_rodadas := 0;
  end if;
  if p_rodada >= c_teto or v_rodadas > c_teto then
    if p_tipo = 'limpar' then
      perform private.cron_alarme('limpar', p_tarefa, now() + interval '1 day', 0);
    else
      insert into public.postagens (tarefa_id, rede, status, erro)
      select t.id, r, 'erro', 'a funcao de postagem nao respondeu depois de varias tentativas'
      from public.tarefas t, unnest(t.postar_redes) r where t.id = p_tarefa and t.etapa = 'aprovado'
      on conflict (tarefa_id, rede) do update set status = 'erro',
        erro = case when public.postagens.status = 'fila' then excluded.erro else 'estado incerto: confira a rede antes de tentar de novo' end
        where public.postagens.status in ('fila', 'enviando', 'processando');
    end if;
    return;
  end if;
  perform private.cron_alarme(p_tipo, p_tarefa, now() + interval '12 minutes', p_rodada + 1);
  select decrypted_secret into v_segredo from vault.decrypted_secrets where name = 'tarefas_funcoes_segredo';
  perform net.http_post(
    url := 'https://uruhjlurcxpjhhgvuzwt.supabase.co/functions/v1/' || case p_tipo when 'limpar' then 'drive' else 'postar-meta' end,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-tarefas-segredo', v_segredo),
    body := jsonb_build_object('acao', p_tipo, 'tarefa_id', p_tarefa),
    timeout_milliseconds := 55000);
end $$;
revoke all on function private.alarme_tocou(text, uuid, int) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- Conferência depois de colar (só leitura):
--   select jobname, schedule, command from cron.job where jobname like 'postagens_%';  -- só postagens_gerar (0 6 * * *), só gerar_tarefas_postagens
--   select pg_get_function_result('public.iniciar_limpeza_card(uuid)'::regprocedure);  -- timestamp with time zone
