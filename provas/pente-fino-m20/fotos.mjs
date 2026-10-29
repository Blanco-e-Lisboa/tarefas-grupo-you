// Prova do pente fino r1 (Lince): M20, M1, B13, B15 e A3. Cópia de exemplo (npm run exemplo: app 3101, banco falso 3201). Não fala com o banco de verdade.
// M20: anexar um vídeo de ~72 Mbps na ficha mostra o aviso dos 25 Mbps (e Descartar não sobe nada: M11).
// M1: card Aprovado da Beec mostra "Só a You programa postagem..." no bloco Publicação, sem data nem botões.
// B13: card aberto pelas Pastas mostra só os tipos de card (Roteiro, Gravação, Edição, Postagem).
// B15: Configurações (botão Incluir). A3: mural de ideias aberto.
// Uso: node provas/pente-fino-m20/fotos.mjs <caminho do vídeo de teste>
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(join(process.env.APPDATA, "npm", "node_modules", "/"));
const { chromium } = require("playwright");
const pasta = (item) => fileURLToPath(new URL(`../pente-fino-${item}/`, import.meta.url));
const VIDEO = process.argv[2];
const TAMANHOS = [[1903, 900], [1440, 760], [390, 844]];
const marca = () => { document.getElementById("iw")?.remove(); const d = document.createElement("div"); d.id = "iw"; d.textContent = "innerWidth " + innerWidth; d.style.cssText = "position:fixed;left:4px;bottom:4px;z-index:2147483647;background:#000;color:#fff;font:700 10px monospace;padding:2px 6px"; document.body.append(d); };

const nav = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", args: ["--window-position=-32000,0"] });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 760 } });
const p = await ctx.newPage();
const erros = [];
p.on("pageerror", (e) => erros.push(e.message));
await p.goto("http://127.0.0.1:3201/entrar", { waitUntil: "load" });
const foto = async (item, nome, ver) => {
  for (const [w, h] of TAMANHOS) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(600);
    if (ver) await p.locator(ver).first().scrollIntoViewIfNeeded().catch(() => {});
    await p.evaluate(marca);
    await p.screenshot({ path: `${pasta(item)}${nome}-${w}.png` });
  }
  await p.setViewportSize({ width: 1440, height: 760 });
};
const abrirCard = async (titulo) => {
  await p.locator(".conteudos-titulo", { hasText: titulo }).first().click();
  await p.locator("dialog.ficha[open]").waitFor();
};
const fecharFicha = async () => {
  await p.locator("dialog.ficha[open] .ficha-fechar").first().click();
  await p.locator("dialog[open] button", { hasText: "Descartar" }).click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(400);
};

// M20 + M11
await p.goto("http://127.0.0.1:3101/conteudos", { waitUntil: "networkidle" });
await abrirCard("Post: plano Beec de novembro");
await p.locator("dialog.ficha[open] .ficha-anexos-trava input[type=file]").setInputFiles(VIDEO);
const aviso = p.locator("dialog.ficha[open] .ficha-anexo-recusa", { hasText: "Mbps" });
await aviso.waitFor({ timeout: 10000 });
console.log("M20 aviso:", await aviso.innerText());
await foto("m20", "ficha-video-taxa-alta", "dialog.ficha[open] .ficha-anexo-recusa");
const enviosAntes = await p.locator(".envios li").count();
await fecharFicha();
console.log("M11 envios em segundo plano depois de Descartar:", (await p.locator(".envios li").count()) - enviosAntes);

// M1
await abrirCard("Post: bem-vindo à Beec");
console.log("M1 Publicação:", await p.locator("dialog.ficha[open] .publicacao").innerText());
await foto("m1", "ficha-beec-aprovado", "dialog.ficha[open] .publicacao");
await fecharFicha();
await foto("m1", "esteira-card-beec", ".conteudos-cartao:has-text('Post: bem-vindo à Beec')");

// B13
await p.goto("http://127.0.0.1:3101/pastas", { waitUntil: "networkidle" });
// folha de um conteúdo dentro de um tema (a meta mostra a etapa)
console.log("B13 card aberto:", await p.evaluate(() => { const f = [...document.querySelectorAll(".gf-sheet")].find((b) => /Roteiro|Gravação|Edição|Em análise|Aprovado|Postado/.test(b.textContent)); f?.click(); return f?.textContent; }));
await p.locator("dialog.ficha[open]").waitFor();
await p.locator("dialog.ficha[open] .selecao-botao").first().click();
await p.waitForTimeout(400);
console.log("B13 tipos oferecidos:", (await p.locator(".selecao-opcao:visible").allInnerTexts()).join(", "));
await foto("b13", "pastas-ficha-tipos");
await p.keyboard.press("Escape");
await fecharFicha();

// B15
await p.goto("http://127.0.0.1:3101/configuracoes", { waitUntil: "networkidle" });
await foto("b15", "configuracoes", ".config-incluir");

// A3
await p.goto("http://127.0.0.1:3101/pastas", { waitUntil: "networkidle" });
await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Abrir Ideias de conteúdo/.test(b.getAttribute("aria-label") ?? ""))?.click());
await p.locator(".mural-quadro").first().waitFor({ timeout: 5000 }).catch(() => {});
await foto("a3", "mural-ideias");

console.log("erros:", erros.length ? erros : "nenhum");
await nav.close();
