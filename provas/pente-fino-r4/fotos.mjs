// Prova do pente fino r4 (Lince). Cópia de exemplo (npm run exemplo: app 3101, banco falso 3201). Não fala com o banco de verdade.
// N3: a ficha fica travada enquanto a pasta do Drive se organiza (organizar_card segurado no navegador e depois cancelado).
// F2 (b): card Aprovado com post publicado em todas as redes escolhidas: aviso e Programar/Postar agora desligados (as linhas "postado" são postas
// só na resposta que o navegador recebe; o banco falso não muda).
// Ferreiro 5: sessão comum (entrou com senha) pede a senha atual.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const PASTA = fileURLToPath(new URL("./", import.meta.url));
const TAMANHOS = [[1903, 900], [1440, 760], [390, 844]];
const marca = () => { document.getElementById("iw")?.remove(); const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; (document.querySelector("dialog[open]") ?? document.body).append(d); };
const X = "Reels: dica rápida de IR";

const nav = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--window-position=-32000,0"] });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 760 } });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
const foto = async (nome, ver) => { for (const [w, h] of TAMANHOS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500); if (ver) await p.locator(ver).first().scrollIntoViewIfNeeded().catch(() => {}); await p.evaluate(marca); await p.screenshot({ path: `${PASTA}${nome}-${w}.png` }); } await p.setViewportSize({ width: 1440, height: 760 }); };
const fechar = async () => { await p.locator("dialog.ficha[open] .ficha-fechar").first().click(); await p.locator("dialog[open] button", { hasText: "Descartar" }).click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(300); };
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
await p.goto("http://127.0.0.1:3101/conteudos", { waitUntil: "networkidle" });

// N3
let segurada;
await p.route("**/functions/v1/drive", async (r) => { if (r.request().postData()?.includes("organizar_card")) segurada = r; else await r.continue(); });
await p.locator(".conteudos-titulo", { hasText: X }).first().click();
await p.locator("dialog.ficha[open]").waitFor();
const titulo = await p.locator("dialog.ficha[open] .ficha-titulo").inputValue();
await p.locator("dialog.ficha[open] .ficha-titulo").fill(titulo + " (r4)");
await p.locator("dialog.ficha[open] button[type=submit]").click();
for (let i = 0; i < 20 && !segurada; i++) await p.waitForTimeout(250);
console.log("N3 organizar_card segurado:", !!segurada, "| notas travadas:", await p.locator("#ficha-notas").isDisabled(), "| botão:", await p.locator("dialog.ficha[open] button[type=submit]").innerText());
await foto("n3-organizando-pasta", "#ficha-notas");
await segurada?.abort();
await p.waitForTimeout(800);
console.log("N3 depois do Drive, notas liberadas:", !(await p.locator("#ficha-notas").isDisabled()));
await p.unroute("**/functions/v1/drive");
await fechar().catch(() => {});
await p.locator(".aviso-erro-fechar").first().click().catch(() => {});
await p.locator("dialog.ficha[open] .ficha-fechar").first().click().catch(() => {});

// F2 (b)
await p.route("**/rest/v1/postagens*", async (r) => {
  const res = await r.fetch(); const linhas = await res.json();
  await r.fulfill({ response: res, json: [...linhas, ...["instagram", "facebook"].map((rede) => ({ tarefa_id: alvo, rede, status: "postado", link: `https://www.${rede}.com/exemplo/r4`, erro: null, postado_em: "2026-10-28T21:00:00Z" }))] });
});
const tok = await p.evaluate(() => JSON.parse(atob(document.cookie.match(/sb-127-auth-token=base64-([^;]+)/)[1].replace(/-/g, "+").replace(/_/g, "/"))).access_token);
const todas = await (await fetch("http://127.0.0.1:3201/rest/v1/tarefas?select=*", { headers: { authorization: `Bearer ${tok}` } })).json();
var alvo = todas.find((t) => t.titulo.startsWith(X)).id;
await p.goto("http://127.0.0.1:3101/conteudos", { waitUntil: "networkidle" });
await p.locator(".conteudos-titulo", { hasText: X }).first().click();
await p.locator("dialog.ficha[open] .publicacao").waitFor();
console.log("F2 aviso:", await p.locator(".publicacao .aprovacao-nota", { hasText: "já foi postado" }).count() === 1,
  "| Programar desligado:", await p.locator(".publicacao [data-acao=reprogramar], .publicacao [data-acao=aprovar]").first().isDisabled(),
  "| Postar agora desligado:", await p.locator(".publicacao [data-acao=postar]").first().isDisabled().catch(() => "sem botão"));
await foto("f2b-ja-postado", ".publicacao");
await fechar().catch(() => {});

// Ferreiro 5
await p.goto("http://127.0.0.1:3101/entrar/nova-senha", { waitUntil: "networkidle" });
await p.locator("input[name=atual]").waitFor({ timeout: 5000 }).catch(() => {});
console.log("F5 pede a senha atual:", await p.locator("input[name=atual]").count() === 1, "| título:", await p.locator(".entrar-titulo").innerText());
await foto("f5-senha-atual");
console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
