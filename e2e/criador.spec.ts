// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite da etapa D do criador de pontos (docs/16): a janela "Criador de pontos" e os comandos stitchEditor.* pela ponte MCP.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";

// Criador de pontos pausado (D-57): para retomar, ligue `stitchEditor` em packages/commands/src/features.ts e remova esta linha.
test.skip(true, "criador de pontos pausado (D-57)");

const PORT = 47860;
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const diagram = (page: Page) => page.getByTestId("stitch-diagram");
const onHook = (page: Page) => diagram(page).locator('[data-on-hook="1"][data-part="back"]');
const loops = async (page: Page): Promise<number> =>
  Number(/(\d+)\./.exec((await page.getByTestId("stitch-loops").textContent()) ?? "")?.[1]);

test("montar o pb clicando: as alças do diagrama batem com o estado e o fim do ponto só libera no fim", async ({
  page,
}) => {
  await page.goto("/");
  await tab(page, "Criador de pontos").click();
  const finish = page.getByRole("button", { name: "Fim do ponto" });
  expect(await loops(page)).toBe(1);
  await expect(onHook(page)).toHaveCount(1);
  await expect(finish).toBeDisabled();

  await page.getByRole("button", { name: "Inserir na base 0" }).click();
  expect(await loops(page)).toBe(2);
  await expect(onHook(page)).toHaveCount(2);
  await expect(finish).toBeDisabled();

  await page.getByRole("button", { name: "Laçada" }).click();
  expect(await loops(page)).toBe(3);
  await expect(onHook(page)).toHaveCount(3);
  await expect(finish).toBeDisabled();

  await page.getByRole("button", { name: "Puxar por 2" }).click();
  expect(await loops(page)).toBe(1);
  await expect(onHook(page)).toHaveCount(1);
  // ponto pronto: só o fim do ponto
  await expect(finish).toBeEnabled();
  await expect(page.getByRole("button", { name: "Laçada" })).toBeDisabled();
  await finish.click();
  await expect(page.getByTestId("stitch-summary")).toContainText("ponto baixo");
  await expect(page.getByTestId("stitch-summary")).toContainText("Ponto terminado");
  await expect(page.getByTestId("stitch-history")).toContainText(
    "inserir na base 0 → laçada → puxar por 2 → fim do ponto",
  );

  // desfazer volta o fim do ponto; recomeçar volta ao começo; a mão esquerda espelha o diagrama
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(finish).toBeEnabled();
  await page.getByRole("button", { name: "Canhoto" }).click();
  await expect(page.getByRole("button", { name: "Canhoto" })).toHaveClass(/on/);
  await page.getByRole("button", { name: "Recomeçar" }).click();
  await expect(page.getByTestId("stitch-history")).toContainText("Nenhum comando ainda");
  expect(await loops(page)).toBe(1);
});

test("a base escolhida e as bases habilitadas seguem o que a máquina de estados aceita", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Criador de pontos").click();
  const base = (b: number) => page.getByRole("button", { name: String(b), exact: true });
  for (const b of [0, 1, 2, 3, 4]) await expect(base(b)).toBeEnabled();
  await base(2).click();
  await page.getByRole("button", { name: "Inserir na base 2" }).click();
  // depois de um insert só a última base e a seguinte
  await expect(base(2)).toBeEnabled();
  await expect(base(3)).toBeEnabled();
  for (const b of [0, 1, 4]) await expect(base(b)).toBeDisabled();
});

test("pela ponte MCP: pa montado, comandos inválidos recusados sem mudar o estado", async ({ page }) => {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) } as Record<string, string>,
    }),
  );
  try {
    await page.goto(`/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      const text = (r.content as { text: string }[])[0]?.text ?? "";
      return { isError: r.isError === true, text, json: r.isError ? null : JSON.parse(text) };
    };
    await call("stitchEditor.reset");
    for (const c of [
      { kind: "yo" },
      { kind: "insert", base: 0 },
      { kind: "yo" },
      { kind: "draw", k: 2 },
      { kind: "yo" },
      { kind: "draw", k: 2 },
    ]) {
      expect((await call("stitchEditor.apply", c)).isError).toBe(false);
    }
    // depois do segundo puxar sobra 1 alça: o fim do ponto libera e o resto é recusado
    const before = (await call("stitchEditor.state")).json;
    expect(before.loops).toBe(1);
    expect(before.allowed.finish).toBe(true);
    // comandos inválidos: recusados, com o código da máquina de estados, e o estado não muda
    for (const [params, code] of [
      [{ kind: "yo" }, "stitch_done"],
      [{ kind: "insert", base: 1 }, "stitch_done"],
      [{ kind: "draw", k: 1 }, "stitch_done"],
    ] as const) {
      const r = await call("stitchEditor.apply", params);
      expect(r.isError).toBe(true);
      expect(r.text).toContain(code);
    }
    expect((await call("stitchEditor.state")).json.cmds).toEqual(before.cmds);
    const done = (await call("stitchEditor.apply", { kind: "finish" })).json;
    expect(done.summary).toMatchObject({ type: "DC", legs: 1, complete: true, exact: true });
    const after = await call("stitchEditor.apply", { kind: "finish" });
    expect(after.isError).toBe(true);
    expect(after.text).toContain("finished");
    // o painel mostra o mesmo estado que a ponte
    await tab(page, "Criador de pontos").click();
    await expect(page.getByTestId("stitch-summary")).toContainText("ponto alto");
    await expect(onHook(page)).toHaveCount(1);
  } finally {
    await client.close();
  }
});
