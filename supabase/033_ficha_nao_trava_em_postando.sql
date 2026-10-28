-- 033 · A ficha não fica presa em "Postando…". Achado no 1º teste real (28/10, Depoimento - Nicolas): a função caiu, a linha da
-- rede ficou em 'fila', o card voltou para Análise e foi aprovado de novo (o 032 tira a data). Sem data não há alarme, mas a linha
-- 'fila' seguia lá: a ficha mostrava "Postando…" e escondia os botões para programar de novo.
-- Conserto: quando o card perde a data ou sai de Aprovado, apaga as linhas em 'fila' (nunca chegaram à Meta). 'enviando' e
-- 'processando' ficam: podem já estar na Meta, e a catraca confere antes de qualquer nova tentativa.
-- Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM. Idempotente.
-- APLICADO em 28/10/2026 pelo Claude a pedido do Natham ("resolva", migration ficha_nao_trava_em_postando). Conferido em begin/rollback.
create or replace function private.tarefas_alarmes() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.desarmar_alarme('postar', old.id);
    perform private.desarmar_alarme('limpar', old.id);
    return old;
  end if;
  if new.etapa = 'aprovado' and new.postar_em is not null and new.tipo = 'postagem' then  -- 236: só Postagem programa nas redes
    if tg_op = 'INSERT' or old.etapa is distinct from 'aprovado' or old.postar_em is distinct from new.postar_em then
      perform private.armar_alarme('postar', new.id, new.postar_em::timestamp at time zone 'America/Sao_Paulo');
    end if;
  else
    perform private.desarmar_alarme('postar', new.id);
    delete from public.postagens where tarefa_id = new.id and status = 'fila';  -- 033
  end if;
  if new.etapa = 'postado' and (tg_op = 'INSERT' or old.etapa is distinct from 'postado') then
    -- 236: só arma a limpeza se o card tem arquivo no DRIVE (anexo antigo do Supabase não é limpo)
    if exists (select 1 from public.arquivos a where a.tarefa_id = new.id and a.drive_id is not null) then
      perform private.armar_alarme('limpar', new.id, now() + interval '7 days');
    end if;
  elsif new.etapa is distinct from 'postado' then
    perform private.desarmar_alarme('limpar', new.id);
  end if;
  return new;
end $$;

-- O card que ficou preso no teste: aprovado, sem data, com a linha 'fila' da tentativa que caiu.
delete from public.postagens p using public.tarefas t
where p.tarefa_id = t.id and p.status = 'fila' and t.postar_em is null;
