-- 036 · Pente fino r1 (29/10/2026), item B5. Projeto Tarefas - Grupo You (uruhjlurcxpjhhgvuzwt). NUNCA no CRM. Idempotente. Depende do 022.
-- NÃO aplicado: o Natham cola no SQL Editor.
-- contar_cards_da_tag conta TODOS os cards com a tag (inclusive os privados de outra pessoa), de propósito: é o aviso antes de editar ou
-- apagar a tag. Só que qualquer login perguntava. Agora só quem pode editar e apagar tag pergunta (Natham e Matheus, a mesma regra de tags_trava).
-- Para os outros o banco recusa e a tela cai na contagem dos cards que a pessoa vê (repositorio.ts, contarCardsDaTag devolve null).
create or replace function public.contar_cards_da_tag(p_tag text) returns integer
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not (select private.sou_natham_ou_matheus()) then raise exception 'sem permissao' using errcode = '42501'; end if;
  return (select count(*)::int from public.tarefa_tags where tag_id = p_tag);
end $$;
revoke all on function public.contar_cards_da_tag(text) from public, anon;
grant execute on function public.contar_cards_da_tag(text) to authenticated;
