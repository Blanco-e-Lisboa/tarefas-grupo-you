-- 038 · Pente fino r3 (29/10/2026). Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM.
-- Idempotente. Depende do 027, 034, 035 e 037 (aplicar depois deles) e do 315 da pauta. NÃO aplicado: o Natham cola no SQL Editor.
-- Provado num Postgres local com o mesmo código de produção (supabase/prova_038.sql).
--
--  A6  A limpeza dos 7 dias TRAVA o card: a função drive pede ao banco para começar (iniciar_limpeza_card); enquanto limpa, tirar o card
--      de Postado é recusado (55006 "Os arquivos deste card estão sendo apagados do Drive agora. Tente de novo em alguns minutos.").
--      A trava vence sozinha em 10 minutos (a função cai antes disso). Analogia: placa "limpando, não entre" na porta enquanto o faxineiro trabalha.
--  A7  Vídeo novo pendente sem janela: cada envio de vídeo entra numa lista do card (videos_pendentes, pelo id do envio da fila);
--      a confirmação do envio tira o id da lista ANTES de registrar o vídeo; a marca "vídeo novo pendente" só sai quando a lista fica vazia.
--      Com dois vídeos do mesmo card, a postagem não acorda entre o primeiro e o segundo. Combinado com o Lince (p_envio, envio_id).
--      Achado 2 do r3-ferreiro: a lista vale em QUALQUER etapa; quando o card entra em Aprovado com a lista não vazia, a marca liga.
--      "Postar com o vídeo atual" (liberar) limpa a lista. Sem p_envio (tela antiga), tudo funciona como antes.
--  N7  Pauta: apagar o título só de um dia da série ("Só este dia") fica vazio de verdade; antes voltava o título da série.
begin;

-- ===== A6 =====
alter table public.tarefas add column if not exists limpando_desde timestamptz;

create or replace function public.iniciar_limpeza_card(p_tarefa uuid) returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  -- trava de linha: ou a volta de etapa entra antes (e a limpeza não começa), ou a limpeza entra antes (e a volta espera a trava vencer ou sair)
  update public.tarefas set limpando_desde = now() where id = p_tarefa and etapa = 'postado';
  return found;
end $$;
revoke all on function public.iniciar_limpeza_card(uuid) from public, anon, authenticated;
grant execute on function public.iniciar_limpeza_card(uuid) to service_role;

create or replace function public.terminar_limpeza_card(p_tarefa uuid) returns void
language sql security definer set search_path = ''
as $$ update public.tarefas set limpando_desde = null where id = p_tarefa and limpando_desde is not null $$;
revoke all on function public.terminar_limpeza_card(uuid) from public, anon, authenticated;
grant execute on function public.terminar_limpeza_card(uuid) to service_role;

create or replace function private.tarefas_espera_limpeza() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if old.etapa = 'postado' and new.etapa is distinct from 'postado' and old.limpando_desde > now() - interval '10 minutes' then
    raise exception 'Os arquivos deste card estao sendo apagados do Drive agora. Tente de novo em alguns minutos.' using errcode = '55006';
  end if;
  return new;
end $$;
drop trigger if exists tarefas_espera_limpeza on public.tarefas;
create trigger tarefas_espera_limpeza before update of etapa on public.tarefas for each row execute function private.tarefas_espera_limpeza();

-- ===== A7 =====
alter table public.tarefas add column if not exists videos_pendentes text[] not null default '{}';

-- A lista vale em qualquer etapa; a marca (video_pendente_desde) só liga em Aprovado, como antes.
drop function if exists public.marcar_video_pendente(uuid);
create or replace function public.marcar_video_pendente(p_tarefa uuid, p_envio text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not (select private.pode_mexer_anexos(p_tarefa)) then raise exception 'sem permissao para mexer nos anexos deste card' using errcode = '42501'; end if;
  update public.tarefas set
    videos_pendentes = case when p_envio is null or p_envio = any (videos_pendentes) then videos_pendentes else videos_pendentes || p_envio end,
    video_pendente_desde = case when etapa = 'aprovado' then coalesce(video_pendente_desde, now()) else video_pendente_desde end
  where id = p_tarefa;
end $$;
revoke all on function public.marcar_video_pendente(uuid, text) from public, anon;
grant execute on function public.marcar_video_pendente(uuid, text) to authenticated;

-- A função drive (chave de serviço) tira o envio da lista ANTES de registrar o vídeo que chegou.
create or replace function public.video_chegando(p_tarefa uuid, p_envio text) returns void
language sql security definer set search_path = ''
as $$ update public.tarefas set videos_pendentes = array_remove(videos_pendentes, p_envio) where id = p_tarefa and p_envio = any (videos_pendentes) $$;
revoke all on function public.video_chegando(uuid, text) from public, anon, authenticated;
grant execute on function public.video_chegando(uuid, text) to service_role;

-- Vídeo novo registrado: Reels/Story trocam o velho (034, A8); a marca só sai quando não há outro envio do card na lista.
create or replace function private.arquivos_video_novo() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tarefa_id is not null and new.tipo = 'video' and new.papel = 'anexo'
     and exists (select 1 from public.tarefas t where t.id = new.tarefa_id and t.etapa = 'aprovado' and t.formato is distinct from 'carrossel') then
    update public.arquivos set papel = 'original' where tarefa_id = new.tarefa_id and tipo = 'video' and papel = 'anexo' and id <> new.id;
  end if;
  if new.tarefa_id is not null and new.tipo = 'video' and new.papel = 'anexo' then
    update public.tarefas set video_pendente_desde = null
    where id = new.tarefa_id and video_pendente_desde is not null and cardinality(videos_pendentes) = 0;  -- 038 (A7)
  end if;
  return null;
end $$;
revoke all on function private.arquivos_video_novo() from public, anon, authenticated;

-- "Postar com o vídeo atual": quem aprova desiste do vídeo novo; a lista inteira sai junto (o resto igual ao 027).
create or replace function public.liberar_video_pendente(p_tarefa uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.tarefas t where t.id = p_tarefa and (select private.pode_aprovar(t.aprovador))
      and ((select auth.uid()) is null or (select private.pode_alterar(t.dono_id, t.enviada_por, t.etapa, t.empresa_id)))) then
    raise exception 'so o Natham ou o aprovador libera a postagem com o video atual' using errcode = '42501';
  end if;
  update public.tarefas set video_pendente_desde = null, videos_pendentes = '{}'
  where id = p_tarefa and (video_pendente_desde is not null or cardinality(videos_pendentes) > 0);
  if exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'aprovado' and t.postar_em is not null
      and t.postar_em <= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI')) then
    perform private.alarme_tocou('postar', p_tarefa, 0);
  end if;
end $$;
revoke all on function public.liberar_video_pendente(uuid) from public, anon;
grant execute on function public.liberar_video_pendente(uuid) to authenticated;

-- Card que ENTRA em Aprovado com vídeo ainda subindo: a marca liga. Roda depois de tarefas_aprovacao (ordem alfabética), que apaga a marca fora de Aprovado.
create or replace function private.tarefas_pendentes_ao_aprovar() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.etapa = 'aprovado' and cardinality(new.videos_pendentes) > 0 and new.video_pendente_desde is null
     and (tg_op = 'INSERT' or old.etapa is distinct from 'aprovado') then
    new.video_pendente_desde := now();
  end if;
  return new;
end $$;
drop trigger if exists tarefas_pendentes_ao_aprovar on public.tarefas;
create trigger tarefas_pendentes_ao_aprovar before insert or update on public.tarefas for each row execute function private.tarefas_pendentes_ao_aprovar();

-- ===== N7 (salvar_planejada do 315, igual ao de produção; só o título de "Só este dia" mudou) =====
create or replace function public.salvar_planejada(p jsonb, p_escopo text default 'todos', p_dia date default null) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := nullif(p->>'id', '')::uuid;
  v_antiga public.postagens_planejadas;
  v_repete text := coalesce(nullif(p->>'repete', ''), 'semana');
  v_data date := nullif(p->>'data', '')::date;
  v_dias int[] := case when jsonb_typeof(p->'dias_semana') = 'array'
    then (select array_agg(distinct x::int order by x::int) from jsonb_array_elements_text(p->'dias_semana') x) end;
  v_redes text[] := case when jsonb_typeof(p->'redes') = 'array' then array(select jsonb_array_elements_text(p->'redes')) else '{instagram,facebook}' end;
  v_resp uuid := (select id from public.pessoas where slug = coalesce(nullif(p->>'responsavel', ''), 'matheus'));
  v_inicio date;
  v_fim date := nullif(p->>'fim', '')::date;
  v_novo uuid;
begin
  if not (select private.sou_natham()) then
    raise exception 'Só o Natham monta o calendário de postagens' using errcode = '42501';
  end if;
  if p_escopo not in ('todos', 'dia', 'proximos') then raise exception 'escopo invalido: %', p_escopo using errcode = '22023'; end if;
  if v_resp is null then raise exception 'responsavel desconhecido: %', p->>'responsavel' using errcode = '22023'; end if;
  if v_repete = 'data' then v_inicio := v_data; v_dias := null; v_fim := null;
  else v_inicio := coalesce(nullif(p->>'inicio', '')::date, (now() at time zone 'America/Sao_Paulo')::date); v_data := null;
  end if;
  if v_id is not null then
    select * into v_antiga from public.postagens_planejadas where id = v_id for update;
    if not found then raise exception 'postagem planejada não existe (foi apagada?)' using errcode = 'P0002'; end if;
  end if;

  if v_id is not null and p_escopo in ('dia', 'proximos') and p_dia is null then
    raise exception 'falta o dia do escopo' using errcode = '22023';
  end if;

  if v_id is not null and p_escopo = 'dia' then  -- só este dia: hora, responsável e título valem só nele
    insert into public.postagens_planejadas_excecoes as e (planejada_id, dia, tipo, hora, responsavel_id, titulo)
    values (v_id, p_dia, 'muda', nullif(p->>'hora', ''), case when nullif(p->>'responsavel', '') is not null then v_resp end,
      -- 038 (N7): título mandado vazio = vazio neste dia ('', não nulo; nulo seria "usar o da série"). Sem a chave, segue o da série.
      case when p ? 'titulo' then coalesce(btrim(p->>'titulo'), '') end)
    on conflict (planejada_id, dia) do update set tipo = 'muda', hora = excluded.hora, responsavel_id = excluded.responsavel_id, titulo = excluded.titulo;
    perform private.sincronizar_planejada(v_id);
    return v_id;
  end if;

  if v_id is not null and p_escopo = 'proximos' and v_antiga.repete = 'semana' and p_dia > v_antiga.inicio then
    update public.postagens_planejadas set fim = p_dia - 1 where id = v_id;
    delete from public.postagens_planejadas_excecoes where planejada_id = v_id and dia >= p_dia;
    insert into public.postagens_planejadas (empresa_id, formato, redes, hora, responsavel_id, titulo, repete, data, dias_semana, inicio, fim, criado_por)
    values (p->>'empresa_id', p->>'formato', v_redes, nullif(p->>'hora', ''), v_resp, nullif(btrim(p->>'titulo'), ''), v_repete, v_data, v_dias,
      case when v_repete = 'data' then v_data else p_dia end, v_fim, (select private.minha_pessoa()))
    returning id into v_novo;
    update public.postagens_planejadas_geradas set planejada_id = v_novo where planejada_id = v_id and dia >= p_dia;
    perform private.sincronizar_planejada(v_id);
    perform private.sincronizar_planejada(v_novo);
    return v_novo;
  end if;

  if v_id is null then
    insert into public.postagens_planejadas (empresa_id, formato, redes, hora, responsavel_id, titulo, repete, data, dias_semana, inicio, fim, criado_por)
    values (p->>'empresa_id', p->>'formato', v_redes, nullif(p->>'hora', ''), v_resp, nullif(btrim(p->>'titulo'), ''), v_repete, v_data, v_dias, v_inicio, v_fim,
      (select private.minha_pessoa()))
    returning id into v_id;
  else
    update public.postagens_planejadas set empresa_id = p->>'empresa_id', formato = p->>'formato', redes = v_redes, hora = nullif(p->>'hora', ''),
      responsavel_id = v_resp, titulo = nullif(btrim(p->>'titulo'), ''), repete = v_repete, data = v_data, dias_semana = v_dias,
      inicio = v_inicio, fim = v_fim
    where id = v_id;
  end if;
  perform private.sincronizar_planejada(v_id);
  return v_id;
end $$;
revoke all on function public.salvar_planejada(jsonb, text, date) from public, anon;
grant execute on function public.salvar_planejada(jsonb, text, date) to authenticated;

notify pgrst, 'reload schema';
commit;
