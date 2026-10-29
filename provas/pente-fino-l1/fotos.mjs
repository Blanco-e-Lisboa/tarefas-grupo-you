// Prova do pente fino r2, itens L1 e L5 (Ferreiro). Cópia de exemplo (npm run exemplo: app 3101, banco falso 3201). Não fala com o banco de verdade.
// L1: no Caderno, "Marcar horário" num card Aprovado programado não muda o horário; aparece o aviso.
// L5: a ficha aberta pelo Mapa (Fila) oferece só os tipos de conteúdo no menu Tipo.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const L1 = fileURLToPath(new URL("./", import.meta.url));
const L5 = fileURLToPath(new URL("../pente-fino-l5/", import.meta.url));
const TITULO = "Reels: dica rápida de IR";
const TAMANHOS = [[1903, 900], [1440, 760], [390, 844]];
const marca = () => { document.getElementById("iw")?.remove(); const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; document.body.append(d); };

const nav = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--window-position=-32000,0"] });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 760 } });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
const foto = async (pasta, nome) => { for (const [w, h] of TAMANHOS) { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(600); await p.evaluate(marca); await p.screenshot({ path: `${pasta}${nome}-${w}.png` }); } await p.setViewportSize({ width: 1440, height: 760 }); };
const aviso = () => p.locator(".aviso-erro").first().innerText().catch(() => "(sem aviso)");

// L1: Marcar horário… > primeiro horário livre
await p.goto("http://127.0.0.1:3101/tarefas", { waitUntil: "networkidle" });
const linha = p.locator(".linha", { hasText: TITULO }).first();
await linha.waitFor();
const antes = await linha.getAttribute("data-k");
await p.locator(`button[aria-label="Mais opções: ${TITULO}"]`).first().click();
await p.locator(".mt-pop:popover-open .selecao-opcao", { hasText: "Marcar horário" }).click();
const livre = p.locator(".mt-horas:visible .selecao-opcao", { hasText: "07:00" });
console.log("L1 horário escolhido:", await livre.innerText());
await livre.click();
await p.waitForTimeout(800);
console.log("L1 aviso:", await aviso());
console.log("L1 linha antes/depois:", antes, await p.locator(".linha", { hasText: TITULO }).first().getAttribute("data-k"));
await foto(L1, "caderno-marcar-horario");
await p.locator(".aviso-erro-fechar").first().click().catch(() => {});

// L5: Mapa > Fila > abre um card > menu Tipo
await p.goto("http://127.0.0.1:3101/mapa", { waitUntil: "networkidle" });
await p.locator(".mapa-formato button", { hasText: "Fila" }).click();
await p.waitForTimeout(800);
await p.locator(".eo-linha").first().click();
await p.locator("dialog.ficha[open]").waitFor();
const tipo = p.locator("dialog.ficha[open] .selecao-botao").filter({ hasText: "Tipo" }).first();
await tipo.click().catch(() => {});
await p.waitForTimeout(500);
console.log("L5 tipos na ficha do Mapa:", await p.locator(".selecao-pop:popover-open .selecao-opcao-rotulo").allInnerTexts());
await foto(L5, "mapa-ficha-tipos");
console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
