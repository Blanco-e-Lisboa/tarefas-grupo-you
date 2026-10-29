import { afterEach, beforeEach, expect, it, vi } from "vitest";

// O upsert de cada gravação fica pendurado até o teste soltar: assim dá para ver a ordem em que elas chegam ao banco.
const gravacoes: { texto: string; soltar: (r: { error: unknown }) => void }[] = [];
vi.mock("@/lib/supabase/cliente", () => ({
  supabase: () => ({
    from: (t: string) => t === "pessoas"
      ? { select: () => Promise.resolve({ data: [{ id: "p-matheus", slug: "matheus" }] }) }
      : { upsert: (l: { texto: string }) => new Promise((ok) => gravacoes.push({ texto: l.texto, soltar: ok })) },
  }),
}));
const falhou = vi.fn();
vi.mock("./repositorio", () => ({ falhou: (m: string) => falhou(m) }));
import { escreverNota } from "./anotacoes";

beforeEach(() => { gravacoes.length = 0; falhou.mockReset(); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });
const espera = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };

it("M6: duas pausas seguidas gravam uma depois da outra (a segunda só sai quando a primeira responde)", async () => {
  escreverNota("notas", "matheus", "2026-11-02", "ligar");
  await espera(600);
  escreverNota("notas", "matheus", "2026-11-02", "ligar para o contador");
  await espera(600);
  expect(gravacoes.map((g) => g.texto)).toEqual(["ligar"]); // a segunda espera a primeira
  gravacoes[0].soltar({ error: null });
  await espera(0);
  expect(gravacoes.map((g) => g.texto)).toEqual(["ligar", "ligar para o contador"]);
  gravacoes[1].soltar({ error: null });
});

it("M6: falha ao gravar avisa e tenta de novo sozinha", async () => {
  escreverNota("lembrar", "matheus", "2026-11-03", "boleto");
  await espera(600);
  gravacoes[0].soltar({ error: { code: "08006" } });
  await espera(0);
  expect(falhou).toHaveBeenCalledTimes(1);
  await espera(5000);
  expect(gravacoes.map((g) => g.texto)).toEqual(["boleto", "boleto"]);
  gravacoes[1].soltar({ error: null });
});

it("r4 (economizar execuções): com o banco fora do ar, tenta de novo só 3 vezes; depois espera a próxima digitação ou a saída da aba", async () => {
  escreverNota("lembrar", "matheus", "2026-11-04", "pagar");
  await espera(600);
  for (let i = 0; i < 6; i++) { gravacoes.at(-1)!.soltar({ error: { code: "08006" } }); await espera(5000); }
  expect(gravacoes).toHaveLength(4); // a gravação e 3 novas tentativas, não uma a cada 5 s para sempre
  escreverNota("lembrar", "matheus", "2026-11-04", "pagar o boleto");
  await espera(600);
  expect(gravacoes.at(-1)!.texto).toBe("pagar o boleto"); // digitar de novo volta a gravar
  gravacoes.at(-1)!.soltar({ error: null });
});
