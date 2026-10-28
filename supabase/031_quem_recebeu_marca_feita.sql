-- 031 · Tarefa ENVIADA: quem RECEBEU (o dono) agora marca e desmarca "feita". O resto continua só leitura para ele (009).
-- Uma função só para isso, em vez de abrir a política de update: ela troca SÓ a coluna concluida.
-- Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM. Idempotente.
-- APLICADO em 28/10/2026 pelo Claude com ok do Natham (migration quem_recebeu_marca_feita). Testado como Matheus: marca; título segue travado.
create or replace function public.marcar_feita(p_tarefa uuid, p_feita boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  update public.tarefas t set concluida = p_feita
  where t.id = p_tarefa
    and (t.dono_id = (select private.minha_pessoa()) or (select private.pode_alterar(t.dono_id, t.enviada_por, t.etapa, t.empresa_id)));
  if not found then raise exception 'so quem recebeu ou quem pode editar marca a tarefa como feita' using errcode = '42501'; end if;
end $$;
revoke all on function public.marcar_feita(uuid, boolean) from public, anon;
grant execute on function public.marcar_feita(uuid, boolean) to authenticated;
