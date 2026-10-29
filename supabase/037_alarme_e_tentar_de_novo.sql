-- 037 · Pente fino r2 (29/10/2026), alarme da postagem e "Tentar de novo". Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM.
-- Idempotente. Depende do 034 (aplicar depois dele). NÃO aplicado: o Natham cola no SQL Editor.
-- Provado num Postgres local com o mesmo código de produção (supabase/prova_037.sql).
--
--  B1  "Tentar de novo" não inventa mais data. Card sem data: recusa (55000) "Escolha a data e a hora do post antes de tentar de novo."
--      Com data: as redes com erro voltam para a fila; data que já passou sai na hora, data futura sai na hora marcada.
--      Programar uma data nova sozinho NÃO religa rede com erro (pode ser "estado incerto": quem decide é a pessoa, pelo Tentar de novo).
--      Combinado com o Lince: a tela grava a data e depois chama tentar_de_novo.
--  F5  Alarme e "Tentar de novo" conferem Tipo Postagem e empresa You, como a catraca: card fora disso não toca à toa nem ganha erro falso.
--  F8  Card esperando vídeo novo não faz mais o alarme tocar a cada minuto: o alarme sai e volta sozinho quando a marca sai (gatilho do 034).
--  F9  Toque que acha o card fora de programação tira o próprio job do cron (senão o job tocava de novo no mesmo dia do ano seguinte).
--      Só não tira quando o card está programado para mais tarde: aí o job com esse nome é o alarme novo.
begin;

create or replace function public.tentar_de_novo(p_tarefa uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_quando text;
begin
  select t.postar_em into v_quando from public.tarefas t
  where t.id = p_tarefa and t.etapa = 'aprovado' and t.tipo = 'postagem' and t.empresa_id = 'you' and (select private.pode_aprovar(t.aprovador))  -- F5
    and ((select auth.uid()) is null or (select private.pode_alterar(t.dono_id, t.enviada_por, t.etapa, t.empresa_id)));
  if not found then raise exception 'so o Natham ou o aprovador tenta de novo, e so card de Postagem da You em Aprovado' using errcode = '42501'; end if;
  if v_quando is null then raise exception 'Escolha a data e a hora do post antes de tentar de novo.' using errcode = '55000'; end if;  -- B1
  if (select public.video_pendente(p_tarefa)) then raise exception 'o video novo ainda nao chegou: espere, suba de novo ou use Postar com o video atual' using errcode = '55000'; end if;
  delete from public.postagens p using public.tarefas t where t.id = p_tarefa and p.tarefa_id = t.id and p.status in ('fila', 'erro') and not p.rede = any (t.postar_redes);
  update public.postagens p set status = 'fila', erro = null, rodadas = 0, tentativas = 0 from public.tarefas t
    where p.tarefa_id = p_tarefa and t.id = p.tarefa_id and p.status = 'erro' and p.rede = any (t.postar_redes);
  -- data já passou: o alarme toca agora; futura: o alarme armado pela data (gatilho do 034) toca na hora e acha as linhas na fila
  perform private.alarme_tocou('postar', p_tarefa, 0);
end $$;
revoke all on function public.tentar_de_novo(uuid) from public, anon;
grant execute on function public.tentar_de_novo(uuid) to authenticated;

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
  -- F8: vídeo novo pendente: não posta e não fica tocando; o gatilho do 034 rearma o alarme quando a marca sai
  if p_tipo = 'postar' and exists (select 1 from public.tarefas t where t.id = p_tarefa and t.video_pendente_desde is not null) then return; end if;
  if p_tipo = 'limpar' and not exists (select 1 from public.arquivos a where a.tarefa_id = p_tarefa and a.drive_id is not null) then return; end if;
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
