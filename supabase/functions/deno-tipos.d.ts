// Só para o `tsc` da raiz entender as funções do servidor (Deno). Não existe em tempo de execução no navegador nem no Vitest.
declare const Deno: { env: { get(nome: string): string | undefined }; serve(tratar: (req: Request) => Response | Promise<Response>): void };
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };
// Só o que postar-meta/jpg.ts usa da biblioteca (PNG -> JPG).
declare module "npm:imagescript@1.3.0" {
  export class Image {
    constructor(largura: number, altura: number);
    static decode(dados: Uint8Array): Promise<Image>;
    readonly width: number; readonly height: number;
    fill(cor: number): Image; composite(outra: Image): Image; encodeJPEG(qualidade: number): Promise<Uint8Array>;
  }
}
