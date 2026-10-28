// Prova: fotos do Adrian e do Lucas no avatar (lista "Caderno de"). Cópia de exemplo (3101, banco falso).
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
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
await p.goto("http://127.0.0.1:3101/tarefas", { waitUntil: "networkidle" }); await p.waitForTimeout(1500);
for (const [w, h] of [[1903, 900], [1440, 760], [390, 844]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(700);
  await p.locator(".selecao-botao").filter({ has: p.locator(".selecao-rotulo-p", { hasText: "Caderno de" }) }).first().click(); await p.waitForTimeout(800);
  await p.evaluate(() => document.getElementById("iw")?.remove()); await p.evaluate(marca);
  await p.screenshot({ path: `${PASTA}caderno-de-${w}.png` });
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
}

console.log("pageerror:", erros.length ? erros : "nenhum");
await nav.close();
