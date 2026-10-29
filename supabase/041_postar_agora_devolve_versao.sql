-- 041 · Pente fino r3, item A1 (conferência do Codex). Depende do 040 (coluna tarefas.versao).
-- "Postar agora" muda a data do post (postar_em) e o número de edição do card sobe. A ficha que mandou continua aberta com o número velho.
-- Antes, a tela LIA o número depois, e podia adotar como sua a edição de outra pessoa feita no mesmo instante (e depois gravar por cima dela).
-- Agora a própria função devolve o número de ANTES e o de DEPOIS da mudança dela, dentro da mesma transação. A tela só adota quando o
-- "antes" é o número que ela viu: se outra pessoa mexeu antes, não adota, e o próximo Salvar da ficha avisa "Este card mudou".
-- Mesmo corpo do postar_agora vivo (027), com a linha travada desde a leitura (FOR UPDATE: ninguém muda o card no meio).
-- NÃO APLICADO.

drop function if exists public.postar_agora(uuid);
create or replace function public.postar_agora(p_tarefa uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_antes text; v_agora text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD"T"HH24:MI'); v_versao bigint;
begin
  select postar_em, versao into v_antes, v_versao from public.tarefas t
  where t.id = p_tarefa and t.etapa = 'aprovado' and t.tipo = 'postagem' and (select private.pode_aprovar(t.aprovador))
    and ((select auth.uid()) is null or (select private.pode_alterar(t.dono_id, t.enviada_por, t.etapa, t.empresa_id)))
  for update;
  if not found then raise exception 'so o Natham ou o aprovador posta agora, e so card de Postagem em Aprovado' using errcode = '42501'; end if;
  if (select public.video_pendente(p_tarefa)) then raise exception 'o video novo ainda nao chegou: espere, suba de novo ou use Postar com o video atual' using errcode = '55000'; end if;
  update public.tarefas set postar_em = v_agora where id = p_tarefa;
  if v_antes is not distinct from v_agora then perform private.alarme_tocou('postar', p_tarefa, 0); end if;
  return jsonb_build_object('antes', v_versao, 'depois', (select t.versao from public.tarefas t where t.id = p_tarefa));
end $function$;

revoke all on function public.postar_agora(uuid) from public, anon;
grant execute on function public.postar_agora(uuid) to authenticated;

notify pgrst, 'reload schema';

-- Conferência depois de colar (só leitura):
--   select pg_get_function_result(oid) from pg_proc where proname = 'postar_agora';  -- jsonb
