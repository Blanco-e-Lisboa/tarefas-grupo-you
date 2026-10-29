// Prova do pente fino r2 (Lince), B1: card Aprovado da You com erro de postagem e SEM data (programação perdida) mostra o campo de data
// junto do "Tentar de novo"; sem data, o botão pede a data. Cópia de exemplo (app 3101, banco falso 3201). O erro e a data tirada são
// simulados no navegador (page.route): o banco falso não tem esse estado e nada é gravado.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const PASTA = fileURLToPath(new URL("./", import.meta.url));
const TITULO = "Reels: dica rápida de IR";
const TAMANHOS = [[1903, 900], [1440, 760], [390, 844]];
const marca = () => { document.getElementById("iw")?.remove(); const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; document.body.append(d); };

const nav = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--window-position=-32000,0"] });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 760 } });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
let id = "";
await p.route("**/rest/v1/tarefas?*", async (r) => {
  const res = await r.fetch(); const linhas = await res.json();
  for (const l of linhas) if (l.titulo === TITULO) { id = l.id; l.postar_em = null; } // a programação se perdeu
  await r.fulfill({ response: res, json: linhas });
});
await p.route("**/rest/v1/postagens?*", async (r) => {
  const res = await r.fetch(); const linhas = (await res.json()).filter((l) => l.tarefa_id !== id);
  if (id) linhas.push({ tarefa_id: id, rede: "instagram", status: "erro", erro: "estado incerto: a função caiu no meio do envio", link: null, postado_em: null });
  await r.fulfill({ response: res, json: linhas });
});
await p.goto("http://127.0.0.1:3101/conteudos", { waitUntil: "networkidle" });
await p.reload({ waitUntil: "networkidle" }); // a 2ª leitura já sabe o id do card
await p.locator(".conteudos-titulo", { hasText: TITULO }).first().click();
await p.locator("dialog.ficha[open] .publicacao").waitFor();
const pub = p.locator("dialog.ficha[open] .publicacao");
console.log("Publicação:", (await pub.innerText()).replace(/\s+/g, " "));
await pub.locator("button[data-acao=tentar]").click();
await p.waitForTimeout(300);
console.log("Sem data, ao clicar:", await pub.locator(".aprovacao-falta").innerText().catch(() => "(nada)"));
for (const [w, h] of TAMANHOS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500); await pub.scrollIntoViewIfNeeded(); await p.evaluate(marca); await p.screenshot({ path: `${PASTA}ficha-erro-sem-data-${w}.png` }); }
console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
