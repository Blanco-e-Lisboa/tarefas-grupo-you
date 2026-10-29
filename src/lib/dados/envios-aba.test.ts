// M7 (pente fino r1): a lista de envios é guardada por ABA. Antes era uma só para o navegador todo: a aba nova mostrava
// como "interrompido" o envio vivo da outra aba, e a pessoa subia o vídeo de novo.
import { expect, it, vi } from "vitest";

vi.mock("./drive", () => ({ enviarParaDrive: () => new Promise(() => {}) }));
vi.mock("./repositorio", () => ({ recarregarTarefas: async () => {} }));
const desistiu = vi.hoisted(() => vi.fn());
vi.mock("./subindo", () => ({ marcarPendente: async () => null, desistirEnvio: desistiu }));

const loja = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }; };

it("o envio vivo desta aba não aparece como interrompido na outra aba", async () => {
  const doNavegador = loja(), daAba1 = loja(), daAba2 = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", daAba1);
  const aba1 = await import("./envios");
  aba1.enviarEmSegundoPlano("t1", new File(["x"], "v.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0)); // o envio começa ("enviando") e fica subindo
  expect(daAba1.m.size).toBe(1);
  expect(doNavegador.getItem("grade:envios-abertos")).toBeNull(); // no navegador todo só fica o sinal de vida, nunca a lista

  vi.resetModules();
  vi.stubGlobal("sessionStorage", daAba2); // outra aba: o navegador é o mesmo, a aba não
  const aba2 = await import("./envios");
  expect(aba2.useEnvios).toBeDefined();
  expect(JSON.parse(daAba2.getItem("grade:envios-abertos") ?? "[]")).toEqual([]);
  vi.unstubAllGlobals();
});

it("aba DUPLICADA (cópia da lista da outra aba): envio que ainda dá sinal de vida não aparece como interrompido; acabou lá, some", async () => {
  const doNavegador = loja(), daAba1 = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", daAba1);
  vi.resetModules();
  const aba1 = await import("./envios");
  aba1.enviarEmSegundoPlano("t1", new File(["x"], "v.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));
  const copia = loja();
  daAba1.m.forEach((v, k) => copia.setItem(k, v)); // o navegador copia a lista ao duplicar a aba
  const [{ id }] = JSON.parse(copia.getItem("grade:envios-abertos")!) as { id: string }[];

  vi.resetModules();
  vi.stubGlobal("sessionStorage", copia);
  const dup = await import("./envios");
  dup.reavaliarSuspeitos();
  expect(dup.lerEnvios()).toEqual([]); // vivo na aba 1: não aparece aqui
  doNavegador.setItem("grade:envios-vivos", JSON.stringify({ [id]: -Date.now() })); // a aba 1 terminou o envio
  dup.reavaliarSuspeitos();
  expect(dup.lerEnvios()).toEqual([]); // acabou lá: some sem aviso
  vi.unstubAllGlobals();
});

it("r3 N6: recarregar a própria aba no meio do envio: o envio aparece como interrompido assim que o sinal dela vence", async () => {
  const doNavegador = loja(), aba = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", aba);
  vi.resetModules();
  const antes = await import("./envios");
  antes.enviarEmSegundoPlano("t1", new File(["x"], "v.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));
  const [{ id }] = JSON.parse(aba.getItem("grade:envios-abertos")!) as { id: string }[];

  vi.resetModules(); // recarregou: a mesma aba, o mesmo armazenamento, e o sinal de vida que ela mesma deixou
  const depois = await import("./envios");
  expect(depois.lerEnvios()).toEqual([]); // ainda não dá para saber se é desta aba ou de outra
  depois.reavaliarSuspeitos(Date.now() + 31_000); // ninguém renovou o sinal
  expect(depois.lerEnvios().map((e) => [e.id, e.estado])).toEqual([[id, "interrompido"]]);
  vi.unstubAllGlobals();
});

it("r4 novo 3: escolher o vídeo de novo depois de recarregar reusa o id do envio interrompido (a pendência dele sai do card ao chegar)", async () => {
  const doNavegador = loja(), aba = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", aba);
  vi.resetModules();
  const antes = await import("./envios");
  antes.enviarEmSegundoPlano("t1", new File(["x"], "v.mp4", { type: "video/mp4" }));
  antes.enviarEmSegundoPlano("t2", new File(["x"], "w.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));
  const [{ id: id1 }, { id: id2 }] = JSON.parse(aba.getItem("grade:envios-abertos")!) as { id: string }[];

  vi.resetModules(); // recarregou
  const depois = await import("./envios");
  depois.reavaliarSuspeitos(Date.now() + 31_000);
  depois.descartarEnvio(id1); // "Abrir o card": o aviso sai e a pessoa escolhe o vídeo de novo
  expect(depois.enviarEmSegundoPlano("t1", new File(["x"], "v.mp4", { type: "video/mp4" }))).toBe(id1);
  expect(depois.enviarEmSegundoPlano("t2", new File(["x"], "w.mp4", { type: "video/mp4" }))).toBe(id2); // ainda no aviso: também reusa, e o aviso sai
  expect(depois.lerEnvios().filter((e) => e.estado === "interrompido")).toEqual([]);
  expect(depois.enviarEmSegundoPlano("t1", new File(["x"], "z.mp4", { type: "video/mp4" }))).not.toBe(id1); // só uma vez
  expect(desistiu).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("r4 correção final (regra de ouro): tirar da lista o envio interrompido NÃO desiste no banco; o id fica para o próximo envio do card", async () => {
  const doNavegador = loja(), aba = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", aba);
  vi.resetModules();
  const antes = await import("./envios");
  antes.enviarEmSegundoPlano("t3", new File(["x"], "v.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));
  const [{ id }] = JSON.parse(aba.getItem("grade:envios-abertos")!) as { id: string }[];
  vi.resetModules();
  const depois = await import("./envios");
  depois.reavaliarSuspeitos(Date.now() + 31_000);
  depois.descartarEnvio(id); // "Tirar da lista" ou "Fechar painel"
  expect(desistiu).not.toHaveBeenCalled(); // a pendência continua: só "Postar com o vídeo atual" libera o antigo
  expect(depois.enviarEmSegundoPlano("t3", new File(["x"], "v.mp4", { type: "video/mp4" }))).toBe(id);
  vi.unstubAllGlobals();
});

it("r4 correção final (novo 3): escolher o vídeo de novo nos primeiros 30 s depois de recarregar reusa o id do envio suspeito", async () => {
  const doNavegador = loja(), aba = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", aba);
  vi.resetModules();
  const antes = await import("./envios");
  antes.enviarEmSegundoPlano("t4", new File(["x"], "v.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));
  const [{ id }] = JSON.parse(aba.getItem("grade:envios-abertos")!) as { id: string }[];
  vi.resetModules(); // recarregou: o sinal de vida ainda é recente (menos de 30 s), o envio está entre os suspeitos
  doNavegador.setItem("grade:envios-vivos", JSON.stringify({ [id]: Date.now() - 15_000 })); // mas parou: ninguém o renovou no último ciclo
  const depois = await import("./envios");
  expect(depois.enviarEmSegundoPlano("t4", new File(["x"], "v.mp4", { type: "video/mp4" }))).toBe(id);
  depois.reavaliarSuspeitos(Date.now() + 31_000);
  expect(depois.lerEnvios().filter((e) => e.estado === "interrompido")).toEqual([]); // e não aparece depois como interrompido
  vi.unstubAllGlobals();
});

it("r4 abas (Ferreiro): na aba DUPLICADA, o envio vivo da outra aba não é reusado; o vídeo novo ganha um id próprio", async () => {
  const doNavegador = loja(), daAba1 = loja();
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", doNavegador);
  vi.stubGlobal("sessionStorage", daAba1);
  vi.resetModules();
  const aba1 = await import("./envios");
  aba1.enviarEmSegundoPlano("t5", new File(["x"], "a.mp4", { type: "video/mp4" }));
  await new Promise((r) => setTimeout(r, 0));
  const copia = loja();
  daAba1.m.forEach((v, k) => copia.setItem(k, v)); // duplicou a aba com o vídeo A subindo (sinal de vida de agora)
  const [{ id }] = JSON.parse(copia.getItem("grade:envios-abertos")!) as { id: string }[];
  vi.resetModules();
  vi.stubGlobal("sessionStorage", copia);
  const dup = await import("./envios");
  expect(dup.enviarEmSegundoPlano("t5", new File(["y"], "b.mp4", { type: "video/mp4" }))).not.toBe(id); // B não junta com A no mesmo id
  vi.unstubAllGlobals();
});
