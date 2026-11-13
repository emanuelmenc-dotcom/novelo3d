// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P3: pintar 3 voltas gera as trocas nas linhas certas; cores no gráfico e no 3D; consumo; persistência;
// e os mesmos comandos pelo MCP (D-21).
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";

const PORT = 47893;

/** Todas as seções como abas de uma só janela, para mexer no painel Fios com espaço. */
async function allTabs(page: Page) {
  await page.getByRole("button", { name: "Layout" }).click();
  await page.getByRole("menuitemradio", { name: /Tudo em abas/ }).click();
}
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

test("pintar 3 voltas: trocas nas linhas certas, consumo, gráfico, 3D e persistência", async ({ page }) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await allTabs(page);
  await tab(page, "Fios").click();

  // pincel B (off white), voltas 7 a 9
  await expect(page.getByLabel("Pincel do fio B")).toBeChecked();
  await page.getByLabel("Pintar de volta").fill("7");
  await page.getByLabel("Pintar até a volta").fill("9");
  await page.getByRole("button", { name: "Pintar voltas" }).click();
  await expect(page.locator("[data-paint]")).toHaveCount(1);
  await expect(page.locator('[data-paint="0"]')).toContainText("Voltas 7–9 → fio B (off white)");

  // a receita ganha as trocas, nas linhas certas (V7–9 e V10–12), e só nelas
  const recipe = page.getByTestId("recipe-yarns");
  await expect(recipe).toHaveValue(/V7–9: trocar para o fio B \(off white\), 1 pb em cada ponto \(36\)/);
  await expect(recipe).toHaveValue(/V10–12: trocar para o fio A \(verde musgo\), 1 pb em cada ponto \(36\)/);
  expect((await recipe.inputValue()).match(/trocar para/g)).toHaveLength(2);
  await expect(page.getByRole("heading", { name: /Receita com as trocas de fio \(2\)/ })).toBeVisible();

  // consumo: B gasta 25% (108 dos 432 pontos baixos)
  const b = page.locator('[data-usage="B"]');
  await expect(b).toContainText("108");
  await expect(b).toContainText("25%");
  await page.screenshot({ path: "test-results/pintura-fios.png" });

  // gráfico: dois cartões de fio e as voltas lisas por fio
  await tab(page, "Gráfico circular").click();
  const svg = page.getByTestId("chart").locator("svg");
  await expect(svg).toContainText("Fio B");
  await expect(svg).toContainText("7–9 · 36 pb");
  await expect(svg).toContainText("10–12 · 36 pb");
  await page.screenshot({ path: "test-results/pintura-grafico.png" });

  // 3D: os pontos das voltas 7 a 9 ficam off white, o resto verde musgo
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
  const color = (id: number) => page.evaluate((i) => window.__view3d?.nodeColor(i), id);
  expect(await color(170)).toBe("#f4f1e8"); // volta 8
  expect(await color(10)).toBe("#5d6b3a"); // volta 2
  expect(await color(300)).toBe("#5d6b3a"); // volta 10 em diante
  await page.screenshot({ path: "test-results/pintura-3d.png" });

  // persiste ao recarregar
  await page.reload();
  await allTabs(page);
  await tab(page, "Fios").click();
  await expect(page.locator('[data-paint="0"]')).toContainText("Voltas 7–9");
  await expect(page.getByTestId("recipe-yarns")).toHaveValue(/V7–9: trocar para o fio B/);
});

test("pintar a partir da seleção (volta da tabela e ponto do 3D) e trocar a cor de um fio", async ({
  page,
}) => {
  await page.goto("/");
  // classic: tabela de verificação visível; escolhe a volta 13 e pinta com o fio B pelo painel Fios (aba junto ao texto CP)
  await page.getByTestId("verify-table").getByRole("cell", { name: "13", exact: true }).click();
  await tab(page, "Fios").click();
  await page.getByRole("button", { name: /Pintar volta selecionada \(13\)/ }).click();
  await expect(page.locator('[data-paint="0"]')).toContainText("Voltas 13");

  // ponto do 3D: seleciona o nó 200 (volta 9) e pinta só ele
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
  await page.evaluate(() => window.__view3d?.select(200));
  await tab(page, "Fios").click();
  await page.getByRole("button", { name: /Pintar ponto selecionado/ }).click();
  await expect(page.locator("[data-paint]")).toHaveCount(2);
  await expect(page.locator('[data-paint="1"]')).toContainText("1 ponto(s)");

  // trocar a cor do fio B muda o 3D na hora
  await page.getByLabel("Cor do fio B").fill("#ff0000");
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.nodeColor(200))).toBe("#ff0000");

  // remover pintura e limpar
  await tab(page, "Fios").click();
  await page.getByRole("button", { name: "Remover pintura 2" }).click();
  await expect(page.locator("[data-paint]")).toHaveCount(1);
  await page.getByRole("button", { name: "Limpar pintura" }).click();
  await expect(page.locator("[data-paint]")).toHaveCount(0);
  await expect(page.getByTestId("recipe-yarns")).not.toHaveValue(/trocar para/);
});

test("paleta: adicionar e remover fios", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Fios").click();
  await page.getByRole("button", { name: "Adicionar fio" }).click();
  await expect(page.locator('[data-yarn="C"]')).toBeVisible();
  await page.getByLabel("Nome do fio C").fill("laranja");
  await page.getByLabel("Pintar de volta").fill("2");
  await page.getByLabel("Pintar até a volta").fill("3");
  await page.getByRole("button", { name: "Pintar voltas" }).click();
  await expect(page.locator('[data-paint="0"]')).toContainText("fio C (laranja)");
  // fio em uso não sai da paleta
  await page.getByRole("button", { name: "Remover fio C" }).click();
  await expect(page.getByText(/ainda é usado pela pintura/)).toBeVisible();
  await page.getByRole("button", { name: "Limpar pintura" }).click();
  await page.getByRole("button", { name: "Remover fio C" }).click();
  await expect(page.locator('[data-yarn="C"]')).toHaveCount(0);
});

test("o MCP pinta, lê o relatório de fios e limpa pelos mesmos comandos", async ({ page }) => {
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
    const recipe = await page.getByLabel("Receita", { exact: true }).inputValue();

    await call("paint.rows", { yarn: "B", from: 7, to: 9 });
    const rep = await call("paint.report", { text: recipe });
    expect(rep.json.changeCount).toBe(2);
    expect(rep.json.changes.map((c: { round: number }) => c.round)).toEqual([7, 10]);
    expect(rep.json.recipe).toContain("V7–9: trocar para o fio B (off white)");
    expect(rep.json.usage.find((u: { yarn: string }) => u.yarn === "B").stitches).toBe(108);

    // a interface refletiu a pintura feita pelo MCP
    await tab(page, "Fios").click();
    await expect(page.locator('[data-paint="0"]')).toContainText("Voltas 7–9");

    expect((await call("paint.rows", { yarn: "Z", from: 1, to: 2 })).isError).toBe(true);
    expect((await call("paint.rows", { yarn: "B", from: 9, to: 7 })).isError).toBe(true);
    await call("paint.clear");
    await expect(page.locator("[data-paint]")).toHaveCount(0);
    expect((await call("paint.report", { text: recipe })).json.changeCount).toBe(0);
  } finally {
    await client.close();
  }
});
