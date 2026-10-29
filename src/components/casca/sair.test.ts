import { expect, it, vi } from "vitest";
import { SAIU, avisarSaida, limparEnvios, ouvirSaida } from "./sair";

const loja = () => {
  const m = new Map<string, string>();
  return new Proxy({ getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), m },
    { ownKeys: () => [...m.keys()], getOwnPropertyDescriptor: (_, k) => (m.has(k as string) ? { enumerable: true, configurable: true, value: m.get(k as string) } : undefined) });
};

it("B14: sair apaga a lista da aba e as anotações de envio, e as outras abas ouvem o recado", () => {
  const navegador = loja(), aba = loja();
  navegador.setItem("grade:envio:t1:anexo:v.mp4:1:1", "{}");
  navegador.setItem("grade:envios-vivos", "{}");
  navegador.setItem("grade:menu-recolhido", "1");
  aba.setItem("grade:envios-abertos", "[]");
  vi.stubGlobal("localStorage", navegador);
  vi.stubGlobal("sessionStorage", aba);
  limparEnvios();
  avisarSaida();
  expect([...navegador.m.keys()].sort()).toEqual(["grade:menu-recolhido", SAIU]); // fica só a preferência do menu e o recado
  expect(aba.m.size).toBe(0);

  const outra = new EventTarget();
  const sair = vi.fn();
  const desligar = ouvirSaida(outra as unknown as Window, sair);
  outra.dispatchEvent(Object.assign(new Event("storage"), { key: "outra-coisa" }));
  outra.dispatchEvent(Object.assign(new Event("storage"), { key: SAIU }));
  expect(sair).toHaveBeenCalledTimes(1);
  desligar();
  vi.unstubAllGlobals();
});
