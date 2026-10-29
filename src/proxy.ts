// Porteiro (Next 16: "proxy" substitui o antigo middleware). Renova a sessão e manda para /entrar quem não está logado.
// Só a entrada e a Política de Privacidade são públicas. A trava de verdade dos dados é do banco; este porteiro só evita mostrar tela vazia para quem não entrou.
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => request.cookies.set(name, value));
        resposta = NextResponse.next({ request });
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await sb.auth.getClaims();
  const caminho = request.nextUrl.pathname;
  const naEntrada = caminho === "/entrar" || caminho.startsWith("/entrar/") || caminho === "/privacidade"; // páginas públicas: entrada e Política de Privacidade (item 241)
  if (!data?.claims && !naEntrada) {
    const para = request.nextUrl.clone();
    para.pathname = "/entrar";
    para.search = "";
    return NextResponse.redirect(para);
  }
  // r2 B9: quem já está logado e abre /entrar NÃO é mandado para "/" aqui: o porteiro não vê o "#access_token=..." do convite (o navegador
  // não manda essa parte ao servidor), e o convite aberto num navegador com outra pessoa logada se perdia. A tela de entrar decide (TelaEntrar).
  return resposta;
}

export const config = {
  // Tudo, menos arquivos do Next e imagens/fontes da pasta public.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?)$).*)"],
};
