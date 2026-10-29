-- 034 · Pente fino r1 (29/10/2026), consertos de banco da postagem. Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM.
-- Idempotente. Depende do 019, 027, 032 e 033. NÃO aplicado: o Natham cola no SQL Editor (ou pede ao Claude com ok).
-- Provado num Postgres local com o mesmo código de produção (supabase/prova_034.sql).
--
--  A4  "Tentar de novo" zera as voltas (rodadas) e as tentativas: antes, a rede que estourou as voltas voltava para erro na hora.
--      Pós-Codex (M13): "Tentar de novo" em card que perdeu a data põe a data de agora (é "postar agora"); antes a fila parava em "Postando".
--      ATENÇÃO: o 037 (pente fino r2, B1) troca esta regra: sem data, "Tentar de novo" recusa e pede a data. Cole o 037 depois deste.
--      Pós-Codex (bug 5): a marca "vídeo novo pendente" saindo rearma o alarme do card programado.
--  M12 Rede acrescentada depois (ex.: Facebook num card que já saiu no Instagram) é publicada: o alarme só encerra quando TODA rede do card tem linha.
--  M13 Card que perde a data ou sai de Aprovado com rede em "enviando"/"processando": a linha vira erro "estado incerto" (a ficha para de mostrar
--      "Postando…" e volta a mostrar os botões). O rascunho na Meta fica guardado: "Tentar de novo" confere na Meta antes de publicar.
--  M1  Data de post só em card da You (decisão do Natham, 29/10): gravar ou mudar a data de um card Aprovado de outra empresa é recusado (22023),
--      e card com data não troca de empresa para fora da You. Card de outra empresa vai para Postado a mão.
--  M4  Trocar Tipo ou Empresa de card Aprovado arma/desarma o alarme (antes só etapa e data mexiam nele). Empresa nova não herda o Tema da antiga.
--  A8  Carrossel em Aprovado: vídeo novo NÃO vira os outros em "original" (só Reels/Story têm um vídeo só para trocar pelo legendado).
begin;

-- A4
create or replace function public.tentar_de_novo(p_tarefa uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'aprovado' and (select private.pode_aprovar(t.aprovador))
      and ((select auth.uid()) is null or (select private.pode_alterar(t.dono_id, t.enviada_por, t.etapa, t.empresa_id)))) then
    raise exception 'so o Natham ou o aprovador tenta de novo' using errcode = '42501';
  end if;
  if (select public.video_pendente(p_tarefa)) then raise exception 'o video novo ainda nao chegou: espere, suba de novo ou use Postar com o video atual' using errcode = '55000'; end if;
  delete from public.postagens p using public.tarefas t where t.id = p_tarefa and p.tarefa_id = t.id and p.status in ('fila', 'erro') and not p.rede = any (t.postar_redes);
  -- 034 (A4): pedido explícito de quem aprova = sequência nova; voltas e tentativas antigas não contam
  update public.postagens p set status = 'fila', erro = null, rodadas = 0, tentativas = 0 from public.tarefas t
    where p.tarefa_id = p_tarefa and t.id = p.tarefa_id and p.status = 'erro' and p.rede = any (t.postar_redes);
  -- 034 pós-Codex (M13): card sem data (a programação saiu no meio) = "tentar de novo" é postar agora; sem isso a fila ficava parada em "Postando"
  update public.tarefas set postar_em = to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI') where id = p_tarefa and postar_em is null;
  perform private.alarme_tocou('postar', p_tarefa, 0);
end $$;
revoke all on function public.tentar_de_novo(uuid) from public, anon;
grant execute on function public.tentar_de_novo(uuid) to authenticated;

-- M12 (alarme_tocou do 027 + v_falta)
create or replace function private.alarme_tocou(p_tipo text, p_tarefa uuid, p_rodada int) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := private.alarme_nome(p_tipo, p_tarefa); v_segredo text; v_rodadas int; v_aberto boolean; v_tem boolean; v_falta boolean;
  c_teto constant int := 5;  -- combinado com o Correio
begin
  if p_tipo = 'postar' and not private.postagem_automatica() then
    if exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;
    return;
  end if;
  if p_tipo = 'postar' and not exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'aprovado' and t.postar_em is not null
       and t.postar_em <= to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI')) then return; end if;
  if p_tipo = 'limpar' and not exists (select 1 from public.tarefas t where t.id = p_tarefa and t.etapa = 'postado') then return; end if;
  if p_tipo = 'postar' and exists (select 1 from public.tarefas t where t.id = p_tarefa and t.video_pendente_desde is not null) then
    if exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;
    perform private.cron_alarme('postar', p_tarefa, now() + interval '1 minute', p_rodada);
    return;
  end if;
  if exists (select 1 from cron.job where jobname = v_nome) then perform cron.unschedule(v_nome); end if;
  if p_tipo = 'limpar' and not exists (select 1 from public.arquivos a where a.tarefa_id = p_tarefa and a.drive_id is not null) then return; end if;
  if p_tipo = 'postar' then
    select coalesce(max(p.rodadas) filter (where p.status not in ('postado', 'erro')), 0), coalesce(bool_or(p.status not in ('postado', 'erro')), false), count(*) > 0
      into v_rodadas, v_aberto, v_tem from public.postagens p join public.tarefas t on t.id = p.tarefa_id
      where p.tarefa_id = p_tarefa and p.rede = any (t.postar_redes);
    -- 034 (M12): rede do card ainda sem linha (acrescentada depois) = ainda há o que postar; a catraca cria a linha dela
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

-- M13 + M4 (tarefas_alarmes do 033)
create or replace function private.tarefas_alarmes() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.desarmar_alarme('postar', old.id);
    perform private.desarmar_alarme('limpar', old.id);
    return old;
  end if;
  -- 034 (M4): só Postagem da You programa (a catraca só pega esses); trocar tipo ou empresa também arma/desarma
  if new.etapa = 'aprovado' and new.postar_em is not null and new.tipo = 'postagem' and new.empresa_id = 'you' then
    if tg_op = 'INSERT' or old.etapa is distinct from 'aprovado' or old.postar_em is distinct from new.postar_em
       or old.tipo is distinct from new.tipo or old.empresa_id is distinct from new.empresa_id
       or (old.video_pendente_desde is not null and new.video_pendente_desde is null) then  -- pós-Codex (bug 5): o vídeo novo chegou, rearma
      perform private.armar_alarme('postar', new.id, new.postar_em::timestamp at time zone 'America/Sao_Paulo');
    end if;
  else
    perform private.desarmar_alarme('postar', new.id);
    delete from public.postagens where tarefa_id = new.id and status = 'fila';  -- 033
    -- 034 (M13): o que estava a caminho da Meta não some (pode ter saído): vira erro "estado incerto", e a ficha volta a mostrar os botões
    update public.postagens set status = 'erro', erro = 'Estado incerto: a programação saiu no meio da postagem. Confira a rede antes de tentar de novo.'
      where tarefa_id = new.id and status in ('enviando', 'processando');
  end if;
  if new.etapa = 'postado' and (tg_op = 'INSERT' or old.etapa is distinct from 'postado') then
    if exists (select 1 from public.arquivos a where a.tarefa_id = new.id and a.drive_id is not null) then
      perform private.armar_alarme('limpar', new.id, now() + interval '7 days');
    end if;
  elsif new.etapa is distinct from 'postado' then
    perform private.desarmar_alarme('limpar', new.id);
  end if;
  return new;
end $$;
drop trigger if exists tarefas_alarmes on public.tarefas;
create trigger tarefas_alarmes after insert or update of etapa, postar_em, tipo, empresa_id, video_pendente_desde or delete on public.tarefas
  for each row execute function private.tarefas_alarmes();

-- M1 + M4 (tema): antes de gravar. Roda depois de tarefas_aprovacao (ordem alfabética), que já apagou a data de quem não está em Aprovado/Postado.
create or replace function private.tarefas_so_you_programa() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.empresa_id is distinct from old.empresa_id and new.ocasiao_id is not null
     and not exists (select 1 from public.ocasioes o where o.id = new.ocasiao_id and o.empresa_id = new.empresa_id) then
    new.ocasiao_id := null;  -- o Tema é da empresa antiga: o card fica "Sem tema" na nova
  end if;
  -- Só quando a data MUDA (ou o card com data troca de empresa): salvar sem mexer na data passa, mesmo em card antigo com data.
  if new.etapa = 'aprovado' and new.postar_em is not null and new.empresa_id is distinct from 'you'
     and (tg_op = 'INSERT' or new.postar_em is distinct from old.postar_em or new.empresa_id is distinct from old.empresa_id) then
    raise exception 'Postagem automatica so para a You: card de outra empresa vai para Postado a mao.' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists tarefas_so_you_programa on public.tarefas;
create trigger tarefas_so_you_programa before insert or update on public.tarefas for each row execute function private.tarefas_so_you_programa();

-- A8 (arquivos_video_novo do 027)
create or replace function private.arquivos_video_novo() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.tarefa_id is not null and new.tipo = 'video' and new.papel = 'anexo'
     and exists (select 1 from public.tarefas t where t.id = new.tarefa_id and t.etapa = 'aprovado' and t.formato is distinct from 'carrossel') then
    update public.arquivos set papel = 'original' where tarefa_id = new.tarefa_id and tipo = 'video' and papel = 'anexo' and id <> new.id;
  end if;
  -- o vídeo novo chegou: a marca sai também no carrossel (034)
  if new.tarefa_id is not null and new.tipo = 'video' and new.papel = 'anexo' then
    update public.tarefas set video_pendente_desde = null where id = new.tarefa_id and video_pendente_desde is not null;
  end if;
  return null;
end $$;
revoke all on function private.arquivos_video_novo() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
