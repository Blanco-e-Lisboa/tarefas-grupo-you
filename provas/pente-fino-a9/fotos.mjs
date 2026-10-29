// Prova do pente fino r1, itens A9 e A2 (Ferreiro). Cópia de exemplo (npm run exemplo: app 3101, banco falso 3201). Não fala com o banco de verdade.
// A9: "Mover pro dia seguinte" e arrastar no Calendário um card Aprovado programado não mudam o dia; aparece o aviso.
// A2: "Duplicar pro dia seguinte" no mesmo card cria a cópia em Roteiro, sem data do post. No fim a cópia é apagada do banco falso.
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const A9 = fileURLToPath(new URL("./", import.meta.url));
const A2 = fileURLToPath(new URL("../pente-fino-a2/", import.meta.url));
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
const menu = async (opcao) => {
  await p.locator(`button[aria-label="Mais opções: ${TITULO}"]`).first().click();
  await p.locator(".mt-pop:popover-open .selecao-opcao", { hasText: opcao }).click();
  await p.waitForTimeout(800);
};

// A9 no Caderno
await p.goto("http://127.0.0.1:3101/tarefas", { waitUntil: "networkidle" });
await p.locator(".linha", { hasText: TITULO }).first().waitFor();
await menu("Mover pro dia seguinte");
console.log("A9 Caderno, aviso:", await aviso());
console.log("A9 Caderno, card continua hoje:", await p.locator(".linha", { hasText: TITULO }).count() > 0);
await foto(A9, "caderno-mover");
await p.locator(".aviso-erro-fechar").first().click().catch(() => {});

// A9 no Calendário (arrastar o bloco para o dia seguinte)
await p.goto("http://127.0.0.1:3101/calendario", { waitUntil: "networkidle" });
await p.locator(".ptroca button", { hasText: "Tarefas" }).click().catch(() => {});
await p.waitForTimeout(800);
const colunas = p.locator(".grade-coluna[data-hoje=true] ~ .grade-coluna");
void colunas;
// arraste HTML5 de verdade (dragstart no bloco, dragover e drop na coluna de amanhã), com o mesmo DataTransfer
await p.evaluate((titulo) => {
  const bloco = [...document.querySelectorAll(".grade-coluna[data-hoje=true] .evento")].find((e) => e.textContent.includes(titulo));
  const alvo = document.querySelector(".grade-coluna[data-hoje=true]").nextElementSibling;
  const dt = new DataTransfer(), r = alvo.getBoundingClientRect(), xy = { clientX: r.left + 10, clientY: r.top + 600, bubbles: true, cancelable: true, dataTransfer: dt };
  bloco.dispatchEvent(new DragEvent("dragstart", { bubbles: true, dataTransfer: dt }));
  alvo.dispatchEvent(new DragEvent("dragover", xy));
  alvo.dispatchEvent(new DragEvent("drop", xy));
}, TITULO);
await p.waitForTimeout(800);
console.log("A9 Calendário, aviso:", await aviso());
console.log("A9 Calendário, card continua hoje:", await p.locator(".grade-coluna[data-hoje=true] .evento", { hasText: TITULO }).count() > 0);
await foto(A9, "calendario-arrastar");
await p.locator(".aviso-erro-fechar").first().click().catch(() => {});

// A2: duplicar
await p.goto("http://127.0.0.1:3101/tarefas", { waitUntil: "networkidle" });
await p.locator(".linha", { hasText: TITULO }).first().waitFor();
await menu("Duplicar pro dia seguinte");
await p.locator('button[aria-label="Próximo dia"]').click();
await p.waitForTimeout(1500);
const copia = await p.evaluate(async (titulo) => {
  const r = await fetch(`http://127.0.0.1:3201/rest/v1/tarefas?select=*`, { credentials: "include", headers: { authorization: `Bearer ${JSON.parse(atob(document.cookie.match(/sb-127-auth-token=base64-([^;]+)/)[1].replace(/-/g, "+").replace(/_/g, "/"))).access_token}` } });
  return (await r.json()).find((t) => t.titulo === `${titulo} - Cópia 1`);
}, TITULO);
console.log("A2 cópia:", copia ? { etapa: copia.etapa, postar_em: copia.postar_em, legenda: copia.legenda, inicio: copia.inicio } : "não achou");
await foto(A2, "caderno-duplicar-dia-seguinte");
if (copia) {
  await p.evaluate(async (id) => {
    const tok = JSON.parse(atob(document.cookie.match(/sb-127-auth-token=base64-([^;]+)/)[1].replace(/-/g, "+").replace(/_/g, "/"))).access_token;
    await fetch(`http://127.0.0.1:3201/rest/v1/tarefas?id=eq.${id}`, { method: "DELETE", headers: { authorization: `Bearer ${tok}` } });
  }, copia.id);
  console.log("A2 cópia apagada do banco falso");
}
console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
