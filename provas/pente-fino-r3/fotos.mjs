// Prova do pente fino r3 (Lince). Cópia de exemplo (npm run exemplo: app 3101, banco falso 3201). Não fala com o banco de verdade.
// N3: durante "Salvando..." os campos da ficha ficam travados (a gravação é segurada no navegador e depois cancelada: nada é gravado).
// Ferreiro 1: a ficha de outro card aberta não é trocada quando a contagem de cards muda (um card de prova é criado e apagado no banco falso).
// Ferreiro 5: "Trocar a senha" com sessão comum pede a senha atual.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const PASTA = fileURLToPath(new URL("./", import.meta.url));
const TAMANHOS = [[1903, 900], [1440, 760], [390, 844]];
const marca = () => { document.getElementById("iw")?.remove(); const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; document.body.append(d); };
const X = "Reels: dica rápida de IR", Y = "Post: plano Beec de novembro";

const nav = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--window-position=-32000,0"] });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 760 } });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
const foto = async (nome, ver) => { for (const [w, h] of TAMANHOS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500); if (ver) await p.locator(ver).first().scrollIntoViewIfNeeded().catch(() => {}); await p.evaluate(marca); await p.screenshot({ path: `${PASTA}${nome}-${w}.png` }); } await p.setViewportSize({ width: 1440, height: 760 }); };
const fechar = async () => { await p.locator("dialog.ficha[open] .ficha-fechar").first().click(); await p.locator("dialog[open] button", { hasText: "Descartar" }).click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(300); };
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
await p.goto("http://127.0.0.1:3101/conteudos", { waitUntil: "networkidle" });
const banco = (caminho, init = {}) => p.evaluate(async ([c, i]) => {
  const tok = JSON.parse(atob(document.cookie.match(/sb-127-auth-token=base64-([^;]+)/)[1].replace(/-/g, "+").replace(/_/g, "/"))).access_token;
  const r = await fetch(`http://127.0.0.1:3201${c}`, { ...i, headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" } });
  return r.status === 204 ? null : r.json();
}, [caminho, init]);
const todas = await banco("/rest/v1/tarefas?select=*");
const idDe = (t) => todas.find((x) => x.titulo === t).id;

// N3
let segurada;
await p.route("**/rest/v1/rpc/salvar_tarefa", (r) => { segurada = r; });
await p.locator(".conteudos-titulo", { hasText: Y }).first().click();
await p.locator("dialog.ficha[open]").waitFor();
await p.locator("#ficha-notas").fill("texto do clique");
await p.locator("dialog.ficha[open] button[type=submit]").click();
await p.waitForTimeout(500);
console.log("N3 notas travadas durante Salvando:", await p.locator("#ficha-notas").isDisabled(), "| botão:", await p.locator("dialog.ficha[open] button[type=submit]").innerText());
await foto("n3-salvando", "#ficha-notas");
await segurada.abort();
await p.unroute("**/rest/v1/rpc/salvar_tarefa");
await p.waitForTimeout(500);
console.log("N3 depois da falha, notas liberadas:", !(await p.locator("#ficha-notas").isDisabled()));
await fechar();
await p.locator(".aviso-erro-fechar").first().click().catch(() => {});

// Ferreiro 1
await p.goto(`http://127.0.0.1:3101/conteudos?ficha=${idDe(X)}`, { waitUntil: "networkidle" });
await p.locator("dialog.ficha[open]").waitFor();
console.log("F1 abriu pelo endereço:", await p.locator("dialog.ficha[open] .ficha-titulo").inputValue(), "| endereço agora:", new URL(p.url()).search || "(limpo)");
await fechar();
await p.locator(".conteudos-titulo", { hasText: Y }).first().click();
await p.locator("dialog.ficha[open]").waitFor();
const novo = crypto.randomUUID();
await banco("/rest/v1/rpc/salvar_tarefa", { method: "POST", body: JSON.stringify({ p: { id: novo, titulo: "Prova r3 (apagar)", tipo: "outro" } }) });
await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); // a tela relê: a contagem de cards muda
await p.waitForTimeout(1500);
console.log("F1 ficha aberta depois de a contagem mudar:", await p.locator("dialog.ficha[open] .ficha-titulo").inputValue());
await foto("f1-ficha-nao-troca");
await fechar();
await banco(`/rest/v1/tarefas?id=eq.${novo}`, { method: "DELETE" });

// Ferreiro 5
await p.goto("http://127.0.0.1:3101/entrar/nova-senha", { waitUntil: "networkidle" });
await p.locator("input[name=atual]").waitFor({ timeout: 5000 }).catch(() => {});
console.log("F5 pede a senha atual:", await p.locator("input[name=atual]").count() === 1, "| título:", await p.locator(".entrar-titulo").innerText());
await foto("f5-senha-atual");
console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
