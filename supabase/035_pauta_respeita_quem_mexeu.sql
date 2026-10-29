-- 035 · Pente fino r1 (29/10/2026), pauta de postagens (315). Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM.
-- Idempotente. Depende do 315 (supabase/_colar/2026-10-26-315-01-pauta.sql e 2026-10-27-315-*). NÃO aplicado: o Natham cola no SQL Editor.
-- Provado num Postgres local com o mesmo código de produção (supabase/prova_035.sql).
--
--  M2  A pauta não apaga mais a tarefa que alguém editou. Versão pós-Codex: em vez de comparar só 4 campos, a tarefa gerada ganha a marca
--      "editada" quando QUALQUER campo dela é mudado por alguém com login (duração, cor, links, notas, hora, tudo; só "feita" não conta),
--      e tarefa com tag também conta como editada. A sincronização e o "Apagar todos" deixam a editada como está.
--      Analogia: a pauta só recolhe a folha que ela escreveu e ninguém rabiscou; qualquer rabisco põe um carimbo "mexida".
--  B4  Desmarcar "feita" numa tarefa da pauta fica valendo (decisão do Natham, 29/10): o relógio de 5 em 5 minutos não risca de novo essa tarefa.
begin;

alter table public.postagens_planejadas_geradas
  add column if not exists editada boolean not null default false,      -- M2: alguém com login mexeu na tarefa
  add column if not exists desmarcada boolean not null default false;   -- B4: alguém tirou o "feita" à mão

-- M2: tarefas já geradas antes deste arquivo. Editada = diferente do que a pauta gera hoje para aquele dia, ou de qualquer valor com que ela nasce,
-- ou com tag. Dia que saiu da pauta sem tarefa apagada (não acontece: salvar a série sincroniza) conta como editada: na dúvida, não se apaga.
with esperado as (
  select g.planejada_id, g.dia, (
    o.planejada_id is null
    or (t.dono_id, t.responsavel_id, t.inicio, t.titulo, coalesce(t.notas, '')) is distinct from (o.responsavel_id, o.responsavel_id,
         to_char(o.dia, 'YYYY-MM-DD') || 'T' || o.hora, private.titulo_da_pauta(o.empresa_id, o.formato, o.titulo), private.notas_da_pauta(o.redes))
    or (t.tipo, t.empresa_id, t.rede, t.etapa, t.fim, t.dia_inteiro, t.cor, t.objetivo, t.links, t.aprovador, t.vai_pro_google, t.formato, t.legenda,
        t.ocasiao_id, t.linha_caderno, t.cor_linha, t.enviada_por)
       is distinct from ('outro', null::text, null::text, null::text, null::text, false, 'etiqueta-5', null::text, '[]'::jsonb, null::text, false, null::text, null::text,
        null::uuid, null::int, null::text, null::uuid)
    or exists (select 1 from public.tarefa_tags tt where tt.tarefa_id = t.id)) as mexida
  from public.postagens_planejadas_geradas g
  join public.tarefas t on t.id = g.tarefa_id
  left join private.ocorrencias((select coalesce(min(dia), current_date) from public.postagens_planejadas_geradas),
                                (select coalesce(max(dia), current_date) from public.postagens_planejadas_geradas)) o
    on o.planejada_id = g.planejada_id and o.dia = g.dia and o.hora is not null
)
update public.postagens_planejadas_geradas g set editada = true
from esperado e where e.planejada_id = g.planejada_id and e.dia = g.dia and e.mexida and not g.editada;

-- M2: de agora em diante, o carimbo vem de um gatilho. Sem login (relógio, funções da pauta) não carimba; "feita" e os campos que o banco mexe sozinho não contam.
create or replace function private.tarefas_pauta_editada() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (to_jsonb(new) - array['concluida', 'updated_at', 'versao']) is distinct from (to_jsonb(old) - array['concluida', 'updated_at', 'versao']) then
    update public.postagens_planejadas_geradas set editada = true where tarefa_id = new.id and not editada;
  end if;
  return null;
end $$;
revoke all on function private.tarefas_pauta_editada() from public, anon, authenticated;
drop trigger if exists tarefas_pauta_editada on public.tarefas;
create trigger tarefas_pauta_editada after update on public.tarefas for each row
  when (old.planejada_id is not null) execute function private.tarefas_pauta_editada();

-- M2: sincronizar pula a tarefa editada (o resto igual ao 315)
create or replace function private.sincronizar_planejada(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare g record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  for g in
    select l.dia, l.tarefa_id, o.planejada_id is not null as vale,
      (t.dono_id, t.inicio, t.titulo, coalesce(t.notas, '')) is distinct from (o.responsavel_id, to_char(o.dia, 'YYYY-MM-DD') || 'T' || o.hora,
        private.titulo_da_pauta(o.empresa_id, o.formato, o.titulo), private.notas_da_pauta(o.redes)) as mudou,
      l.editada or exists (select 1 from public.tarefa_tags tt where tt.tarefa_id = t.id) as editada
    from public.postagens_planejadas_geradas l
    join public.tarefas t on t.id = l.tarefa_id and not t.concluida
      and not exists (select 1 from public.arquivos a where a.tarefa_id = t.id)
    left join private.ocorrencias(v_hoje, (select max(x.dia) from public.postagens_planejadas_geradas x where x.planejada_id = p_id)) o
      on o.planejada_id = l.planejada_id and o.dia = l.dia
    where l.planejada_id = p_id and l.dia >= v_hoje
  loop
    continue when g.editada;  -- 035 (M2): alguém mexeu nesta tarefa; a pauta não apaga nem refaz
    if not g.vale then
      delete from public.tarefas where id = g.tarefa_id;
    elsif g.mudou then
      delete from public.tarefas where id = g.tarefa_id;
      delete from public.postagens_planejadas_geradas where planejada_id = p_id and dia = g.dia;
    end if;
  end loop;
  perform private.gerar_tarefas_postagens(14, p_id);
  perform private.riscar_postagens(null, v_hoje, v_hoje);
end $$;
revoke all on function private.sincronizar_planejada(uuid) from public, anon, authenticated;

-- M2: "Apagar todos" leva só as tarefas futuras que ninguém editou (o resto igual ao 315)
create or replace function public.apagar_planejada(p_id uuid, p_escopo text default 'todos', p_dia date default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_antiga public.postagens_planejadas; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not (select private.sou_natham()) then
    raise exception 'Só o Natham monta o calendário de postagens' using errcode = '42501';
  end if;
  if p_escopo not in ('todos', 'dia', 'proximos') then raise exception 'escopo invalido: %', p_escopo using errcode = '22023'; end if;
  select * into v_antiga from public.postagens_planejadas where id = p_id for update;
  if not found then return; end if;
  if p_escopo in ('dia', 'proximos') and p_dia is null then raise exception 'falta o dia do escopo' using errcode = '22023'; end if;

  if p_escopo = 'dia' and v_antiga.repete = 'semana' then
    insert into public.postagens_planejadas_excecoes (planejada_id, dia, tipo) values (p_id, p_dia, 'pula')
    on conflict (planejada_id, dia) do update set tipo = 'pula', hora = null, responsavel_id = null, titulo = null;
    perform private.sincronizar_planejada(p_id);
  elsif p_escopo = 'proximos' and v_antiga.repete = 'semana' and p_dia > v_antiga.inicio then
    update public.postagens_planejadas set fim = p_dia - 1 where id = p_id;
    delete from public.postagens_planejadas_excecoes where planejada_id = p_id and dia >= p_dia;
    perform private.sincronizar_planejada(p_id);
  else
    delete from public.tarefas t using public.postagens_planejadas_geradas l
    where l.planejada_id = p_id and l.dia >= v_hoje and t.id = l.tarefa_id and not t.concluida
      and not exists (select 1 from public.arquivos a where a.tarefa_id = t.id)
      and not l.editada and not exists (select 1 from public.tarefa_tags tt where tt.tarefa_id = t.id);  -- 035 (M2)
    delete from public.postagens_planejadas where id = p_id;
  end if;
end $$;
revoke all on function public.apagar_planejada(uuid, text, date) from public, anon;
grant execute on function public.apagar_planejada(uuid, text, date) to authenticated;

-- B4: quem tira ou põe o "feita" à mão fica anotado (o relógio e os gatilhos rodam sem login e não contam)
create or replace function private.tarefas_feita_a_mao() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is not null then
    update public.postagens_planejadas_geradas set desmarcada = not new.concluida where tarefa_id = new.id and desmarcada is distinct from (not new.concluida);
  end if;
  return null;
end $$;
revoke all on function private.tarefas_feita_a_mao() from public, anon, authenticated;
drop trigger if exists tarefas_feita_a_mao on public.tarefas;
create trigger tarefas_feita_a_mao after update of concluida on public.tarefas for each row
  when (old.concluida is distinct from new.concluida) execute function private.tarefas_feita_a_mao();

-- B4: o relógio pula a desmarcada (o resto igual ao 315)
create or replace function private.riscar_postagens(p_empresa text default null, p_de date default null, p_ate date default null) returns integer
language plpgsql security definer set search_path = ''
as $$
declare v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int;
begin
  update public.tarefas t set concluida = true
  from public.postagens_calendario(coalesce(p_de, v_hoje - 7), coalesce(p_ate, v_hoje)) c
  join public.postagens_planejadas_geradas g on g.planejada_id = c.planejada_id and g.dia = c.dia
  where c.estado = 'feita' and (p_empresa is null or c.empresa_id = p_empresa) and t.id = g.tarefa_id and not t.concluida
    and not g.desmarcada;  -- 035 (B4)
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.riscar_postagens(text, date, date) from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
