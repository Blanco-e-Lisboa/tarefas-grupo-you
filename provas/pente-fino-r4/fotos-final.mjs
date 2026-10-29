// Prova da correção final r4 (Lince), cópia de exemplo (3101/3201). Aviso de envio interrompido: a frase diz que tirar o aviso não libera o post.
// O envio interrompido é posto direto na lista da aba (sessionStorage), sem sinal de vida; ao recarregar, ele aparece como "Interrompido".
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const PASTA = fileURLToPath(new URL("./", import.meta.url));
const TAMANHOS = [[1903, 900], [1440, 760], [390, 844]];
const marca = () => { document.getElementById("iw")?.remove(); const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; document.body.append(d); };
const nav = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--window-position=-32000,0"] });
const p = await (await nav.newContext({ viewport: { width: 1440, height: 760 } })).newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
await p.goto("http://127.0.0.1:3101/conteudos", { waitUntil: "networkidle" });
const tok = await p.evaluate(() => JSON.parse(atob(document.cookie.match(/sb-127-auth-token=base64-([^;]+)/)[1].replace(/-/g, "+").replace(/_/g, "/"))).access_token);
const todas = await (await fetch("http://127.0.0.1:3201/rest/v1/tarefas?select=*", { headers: { authorization: `Bearer ${tok}` } })).json();
const alvo = todas.find((t) => t.titulo.startsWith("Reels: dica rápida de IR")).id;
await p.evaluate((id) => sessionStorage.setItem("grade:envios-abertos", JSON.stringify([{ id: "prova-r4", nome: "ir-legendado.mp4", tarefaId: id }])), alvo);
await p.reload({ waitUntil: "networkidle" });
await p.locator(".envios .envios-aviso").first().waitFor();
console.log("aviso:", await p.locator(".envios li").first().innerText());
for (const [w, h] of TAMANHOS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500); await p.evaluate(marca); await p.screenshot({ path: `${PASTA}final-aviso-envio-${w}.png` }); }
await p.evaluate(() => sessionStorage.removeItem("grade:envios-abertos"));
console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
