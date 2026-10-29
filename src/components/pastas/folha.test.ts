import { expect, it } from "vitest";
import { textoAoSair } from "./folha";

it("A3: passar pelo campo sem digitar não grava, mesmo que a ideia do banco já seja outra", () => {
  // o Natham via "Dicas IR"; o Matheus mudou para "Dicas IR 2027"; o Natham entra e sai sem digitar
  expect(textoAoSair("Dicas IR", "Dicas IR")).toBeNull();
  expect(textoAoSair("Dicas IR", "  Dicas IR ")).toBeNull();
  expect(textoAoSair("Dicas IR", "Dicas de IR")).toBe("Dicas de IR"); // digitou: grava
  expect(textoAoSair("Dicas IR", "")).toBe(""); // apagou tudo: quem chama decide (título vazio volta)
});
