// Prova do 031: o Matheus marca "feita" na tarefa que o Natham enviou a ele. Cópia de exemplo (3101, banco falso), logado como Matheus.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.PW_DIR ?? join(process.env.APPDATA, "npm"), "node_modules", "/"));
const { chromium } = require(process.env.PW_DIR ? "playwright-core" : "playwright");
const PASTA = fileURLToPath(new URL("./", import.meta.url));
const marca = () => { const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; document.body.append(d); };
const nav = await chromium.launch({ channel: process.env.PW_DIR ? "chrome" : undefined, args: ["--window-position=-32000,0"] });
const p = await (await nav.newContext({ viewport: { width: 1440, height: 760 } })).newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
const foto = async (n) => { await p.evaluate(() => document.getElementById("iw")?.remove()); await p.evaluate(marca); await p.screenshot({ path: `${PASTA}${n}.png` }); };
const fotos = async (n) => { for (const [w, h] of [[1903, 900], [1440, 760], [390, 844]]) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(700); await foto(`${n}-${w}`); } await p.setViewportSize({ width: 1440, height: 760 }); await p.waitForTimeout(400); };
const linha = () => p.locator(".linha", { hasText: "Editar vídeos do Matheus" }).first();

await p.goto("http://127.0.0.1:3201/entrar?quem=matheus", { waitUntil: "load" });
await p.goto("http://127.0.0.1:3101/tarefas", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
const caixa = linha().locator("button, input[type=checkbox]").first();
console.log("linha:", (await linha().innerText()).replace(/\s+/g, " "), "| caixa desabilitada?", await caixa.isDisabled());
await caixa.click(); await p.waitForTimeout(1500);
console.log("depois do clique, aria-pressed?", await linha().evaluate((e) => e.outerHTML.match(/aria-pressed="(true|false)"/)?.[1] ?? "?"));
await fotos("matheus-marcou");
await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(1200);
console.log("depois de recarregar:", await linha().evaluate((e) => e.outerHTML.match(/aria-pressed="(true|false)"/)?.[1] ?? "?"));
console.log("pageerror:", erros.length ? erros : "nenhum");
await nav.close();
