-- 040 · Pente fino r1, item A1: a ficha aberta não grava mais a cópia velha por cima do que outra pessoa mudou.
-- Analogia: cada card ganha um número de edição (versao). Quem abre a ficha anota o número; ao salvar, se o número do banco
-- já é outro, o salvar é recusado (código 40001) e a tela avisa "Este card mudou enquanto você editava", sem perder o rascunho.
-- O número só sobe quando muda o que a ficha grava (título, etapa, notas, data do post, tags...). Marca de vídeo pendente,
-- linha e cor do Caderno e a data de entrada em Postado NÃO sobem o número: não são edição de ninguém.
-- NÃO APLICADO. O app funciona antes e depois de colar: sem a coluna, a tela não manda número e o salvar segue como antes.

alter table public.tarefas add column if not exists versao bigint not null default 0;

create or replace function private.tarefas_versao()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  -- quem já mexeu no número (o salvar_tarefa) decide; senão, sobe sozinho se algum campo de edição mudou
  if new.versao is not distinct from old.versao and (
       old.titulo, old.tipo, old.empresa_id, old.rede, old.etapa, old.responsavel_id, old.inicio, old.fim, old.dia_inteiro, old.cor,
       old.concluida, old.objetivo, old.notas, old.links, old.aprovador, old.postar_em, old.formato, old.conserto, old.legenda,
       old.postar_redes, old.ocasiao_id, old.capa_quadro_ms, old.conserto_texto
     ) is distinct from (
       new.titulo, new.tipo, new.empresa_id, new.rede, new.etapa, new.responsavel_id, new.inicio, new.fim, new.dia_inteiro, new.cor,
       new.concluida, new.objetivo, new.notas, new.links, new.aprovador, new.postar_em, new.formato, new.conserto, new.legenda,
       new.postar_redes, new.ocasiao_id, new.capa_quadro_ms, new.conserto_texto
     ) then
    new.versao := old.versao + 1;
  end if;
  return new;
end $function$;

-- "zz_": os gatilhos BEFORE rodam em ordem alfabética; este olha a linha já arrumada pelos outros (aprovação, volta de Postado).
drop trigger if exists zz_tarefas_versao on public.tarefas;
create trigger zz_tarefas_versao before update on public.tarefas
  for each row execute function private.tarefas_versao();

-- salvar_tarefa: mesmo corpo de antes (007 + 019 + 027) com o número de edição. p_versao null = sem conferência (quem não manda).
-- Devolve o número novo, para a tela anotar e o próximo salvar dela não ser recusado à toa.
drop function if exists public.salvar_tarefa(jsonb, text[]);
create or replace function public.salvar_tarefa(p jsonb, p_tags text[] default '{}'::text[], p_versao bigint default null)
returns bigint
language plpgsql
set search_path to ''
as $function$
declare
  r public.tarefas;
  v_linhas int;
  v_atual bigint;
begin
  r := jsonb_populate_record(null::public.tarefas, p);
  if r.id is null then raise exception 'salvar_tarefa: falta o id'; end if;
  -- r2 F7/B8: "existe?" sem trava (vale a regra de LER). O FOR UPDATE também exige a regra de ALTERAR: card visível mas só de leitura
  -- parecia "não existe" e caía no INSERT (chave duplicada). Agora é "sem permissão", como antes do 040.
  if exists (select 1 from public.tarefas t where t.id = r.id) then
    select t.versao into v_atual from public.tarefas t where t.id = r.id for update;
    if not found then raise exception 'sem permissao para alterar a tarefa' using errcode = '42501'; end if;
    if p_versao is not null and v_atual <> p_versao then
      raise exception 'card mudou enquanto a ficha estava aberta' using errcode = '40001';
    end if;
    update public.tarefas t set
      titulo = r.titulo, tipo = r.tipo, empresa_id = r.empresa_id, rede = r.rede, etapa = r.etapa,
      responsavel_id = r.responsavel_id, inicio = r.inicio, fim = r.fim, dia_inteiro = r.dia_inteiro, cor = r.cor,
      concluida = r.concluida, objetivo = r.objetivo, notas = r.notas, links = r.links, aprovador = r.aprovador,
      postar_em = case when p ? 'postar_em' then r.postar_em else t.postar_em end,
      formato = case when p ? 'formato' then r.formato else t.formato end,
      conserto = case when p ? 'conserto' then coalesce(r.conserto, false) else t.conserto end,
      legenda = case when p ? 'legenda' then r.legenda else t.legenda end,
      postar_redes = case when p ? 'postar_redes' then coalesce(r.postar_redes, '{instagram,facebook}') else t.postar_redes end,
      ocasiao_id = case when p ? 'ocasiao_id' then r.ocasiao_id else t.ocasiao_id end,
      capa_quadro_ms = case when p ? 'capa_quadro_ms' then r.capa_quadro_ms else t.capa_quadro_ms end,
      conserto_texto = case when p ? 'conserto_texto' then nullif(btrim(r.conserto_texto), '') else t.conserto_texto end
    where t.id = r.id;
    get diagnostics v_linhas = row_count;
    if v_linhas = 0 then raise exception 'sem permissao para alterar a tarefa'; end if;
    -- só as tags mudaram: a linha não mudou, mas é edição, então o número sobe
    if (select coalesce(array_agg(x.tag_id order by x.tag_id), '{}') from public.tarefa_tags x where x.tarefa_id = r.id)
       is distinct from (select coalesce(array_agg(x order by x), '{}') from unnest(coalesce(p_tags, '{}')) x) then
      update public.tarefas t set versao = t.versao + 1 where t.id = r.id;
    end if;
    delete from public.tarefa_tags where tarefa_id = r.id;
  elsif p_versao is not null then
    -- r2 F1: quem manda número de edição está salvando um card que JÁ existia. Não existe mais = alguém apagou: recusa, nunca ressuscita
    raise exception 'card apagado enquanto a ficha estava aberta' using errcode = 'P0002';
  else
    insert into public.tarefas (id, titulo, tipo, empresa_id, rede, etapa, responsavel_id, inicio, fim, dia_inteiro, cor,
      concluida, objetivo, notas, links, aprovador, dono_id, criado_por, enviada_por, vai_pro_google, postar_em, formato,
      legenda, postar_redes, ocasiao_id, capa_quadro_ms)
    values (r.id, r.titulo, r.tipo, r.empresa_id, r.rede, r.etapa, r.responsavel_id, r.inicio, r.fim, r.dia_inteiro, r.cor,
      r.concluida, r.objetivo, r.notas, r.links, r.aprovador, r.dono_id, r.criado_por, r.enviada_por, coalesce(r.vai_pro_google, false),
      r.postar_em, r.formato, r.legenda, coalesce(r.postar_redes, '{instagram,facebook}'), r.ocasiao_id, r.capa_quadro_ms);
  end if;
  insert into public.tarefa_tags (tarefa_id, tag_id) select r.id, unnest(p_tags);
  return (select t.versao from public.tarefas t where t.id = r.id);
end $function$;

revoke all on function public.salvar_tarefa(jsonb, text[], bigint) from public, anon;
grant execute on function public.salvar_tarefa(jsonb, text[], bigint) to authenticated;

notify pgrst, 'reload schema';

-- Conferência depois de colar (só leitura):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname = 'salvar_tarefa';  -- 1 linha, 3 argumentos
--   select count(*) from public.tarefas where versao <> 0;                                                  -- 0 logo depois de colar
