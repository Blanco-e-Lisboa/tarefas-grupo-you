// Função `postar-meta` (Deno). Deploy: supabase functions deploy postar-meta --no-verify-jwt (a checagem é própria: x-tarefas-segredo).
// Secrets: META_PUBLISHER_TOKEN (já está), POSTAR_DE_VERDADE (só "sim" publica; qualquer outro valor para antes de publicar).
import { baixarDoDrive, duracaoVideo, env } from "../_shared/google.ts";
import { criarManipulador } from "./estado.ts";
import { paraJpg } from "./jpg.ts";

Deno.serve(criarManipulador({
  env,
  fetch: (...a) => fetch(...a),
  baixarDrive: (id, range) => baixarDoDrive(id, range),
  duracaoDrive: (id) => duracaoVideo(id),
  paraJpg,
  waitUntil: (p) => EdgeRuntime.waitUntil(p),
}));
