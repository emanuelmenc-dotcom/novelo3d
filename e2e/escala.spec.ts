// SPDX-License-Identifier: GPL-3.0-or-later
// Escala da interface e do texto, largura mínima da janela 3D e janela estreita (modo compacto), pelo menu e pelo MCP.
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { classicLayout, ribbon, showTab } from "./ribbon.ts";

const PORT = 47894;

const rootFont = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
const fontOf = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
const leafOf = (page: Page, panel: string) =>
  page.locator("section.ws-leaf", { has: page.locator(`[data-panel="${panel}"]`) });

async function openInterfaceSettings(page: Page) {
  await ribbon(page, "arquivo");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Interface" }).click();
}

test("escala da interface: padrão 90%, botões prontos, controle deslizante e persistência", async ({
  page,
}) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  expect(await rootFont(page)).toBe("14.4px"); // 90% de 16 px
  const tabH = async () => (await page.locator(".ws-head").first().boundingBox())?.height ?? 0;
  const h90 = await tabH();

  await openInterfaceSettings(page);
  await expect(page.getByTestId("ui-scale")).toHaveText("90%");
  await page.getByRole("button", { name: "Grande (120%)" }).click();
  await expect(page.getByTestId("ui-scale")).toHaveText("120%");
  expect(await rootFont(page)).toBe("19.2px");
  await page.screenshot({ path: "test-results/escala-120.png" });
  await page.getByRole("button", { name: "Compacto (80%)" }).click();
  expect(await rootFont(page)).toBe("12.8px");
  await page.getByLabel(/Tamanho da interface/).focus();
  for (let i = 0; i < 2; i++) await page.keyboard.press("ArrowLeft"); // passos de 5%
  await expect(page.getByTestId("ui-scale")).toHaveText("70%");
  expect(await rootFont(page)).toBe("11.2px");
  await page.keyboard.press("Escape");
  expect(await tabH()).toBeLessThan(h90); // as caixas também encolheram, não só o texto

  // persiste ao recarregar
  await page.reload();
  expect(await rootFont(page)).toBe("11.2px");
});

test("tamanho do texto extra: só o texto muda, a interface continua do mesmo tamanho", async ({ page }) => {
  await page.goto("/");
  const root0 = await rootFont(page);
  const tab0 = await fontOf(page, ".ws-tab");
  const box0 = (await page.getByTestId("workspace").boundingBox())?.width ?? 0;
  await openInterfaceSettings(page);
  await page.getByLabel(/Tamanho do texto/).focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowRight"); // 100% -> 120%
  await expect(page.getByTestId("text-scale")).toHaveText("120%");
  await page.keyboard.press("Escape");
  expect(await rootFont(page)).toBe(root0);
  expect(await fontOf(page, ".ws-tab")).toBeCloseTo(tab0 * 1.2, 1);
  expect((await page.getByTestId("workspace").boundingBox())?.width ?? 0).toBeCloseTo(box0, 0);
});

test("largura mínima da janela 3D: os divisores param no limite configurado", async ({ page }) => {
  await page.goto("/");
  await classicLayout(page);
  await page.getByRole("tab", { name: "3D", exact: true }).click();
  await openInterfaceSettings(page);
  await expect(page.getByTestId("min3d")).toHaveText("320 px");
  await page.getByLabel(/Largura mínima da janela 3D/).focus();
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight"); // 320 -> 440
  await expect(page.getByTestId("min3d")).toHaveText("440 px");
  await page.keyboard.press("Escape");

  // arrasta o divisor da direita para espremer a janela do 3D: ela para no mínimo (440 px x escala 90%)
  const bar = page.getByTestId("splitter-n1-1");
  const box = await bar.boundingBox();
  if (!box) throw new Error("sem divisor");
  await page.mouse.move(box.x + box.width / 2, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 900, box.y + 40, { steps: 10 });
  await page.mouse.up();
  const w = (await leafOf(page, "view3d").boundingBox())?.width ?? 0;
  expect(w).toBeGreaterThanOrEqual(440 * 0.9 - 2);
  expect(w).toBeLessThan(440 * 0.9 + 40);
});

test("janela estreita: vira abas, mantém o layout salvo e o 3D continua utilizável", async ({ page }) => {
  await page.goto("/");
  await classicLayout(page);
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-compact", "false");
  await page.setViewportSize({ width: 700, height: 760 });
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-compact", "true");
  await expect(page.locator("section.ws-leaf")).toHaveCount(1);
  const tabs = page.getByRole("tablist", { name: "Abas da janela" }).first().getByRole("tab");
  await expect(tabs).toHaveCount(7);
  await page.screenshot({ path: "test-results/estreita-abas.png" });

  // cada painel continua acessível pelas abas
  await page.getByRole("tab", { name: "Verificação de contagem" }).click();
  await showTab(page, "Verificação de contagem");
  await expect(page.getByTestId("verify-table")).toBeVisible();
  await page.getByRole("tab", { name: "3D", exact: true }).click();
  await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
  // o 3D calcula e mostra a peça mesmo com o painel só visível pelo modo compacto
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
  const cube = await page.evaluate(() => window.__view3d?.state().cubeRect);
  const canvas = await page.getByTestId("scene").locator("canvas").boundingBox();
  if (!cube || !canvas) throw new Error("sem 3D");
  expect(cube.size).toBeLessThanOrEqual(Math.floor(Math.min(canvas.width, canvas.height) * 0.45));
  await page.screenshot({ path: "test-results/estreita-3d.png" });

  // voltando a uma largura confortável, o layout em colunas volta, sem ter sido alterado
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-compact", "false");
  await expect(page.locator("section.ws-leaf")).toHaveCount(4);
});

test("sem modo compacto: o espaço de trabalho rola em vez de espremer os painéis", async ({ page }) => {
  await page.goto("/");
  await classicLayout(page);
  await openInterfaceSettings(page);
  await page.getByLabel("Em janela estreita, juntar os painéis em abas").uncheck();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 700, height: 760 });
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-compact", "false");
  const m = await page
    .getByTestId("workspace")
    .evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(m.sw).toBeGreaterThan(m.cw); // há rolagem horizontal
  // nenhuma janela abaixo do mínimo do seu painel
  const recipe = (await leafOf(page, "recipe").boundingBox())?.width ?? 0;
  expect(recipe).toBeGreaterThanOrEqual(220 * 0.9 - 2);
  await page.screenshot({ path: "test-results/estreita-rolagem.png" });
});

test("o MCP altera escala, texto, mínimo do 3D e modo compacto (com limites e erros)", async ({ page }) => {
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
    const set = await call("settings.set", {
      interface: { scale: 100, textScale: 110, min3d: 360, autoCompact: false },
    });
    expect(set.json.interface).toMatchObject({ scale: 100, textScale: 110, min3d: 360, autoCompact: false });
    expect(await rootFont(page)).toBe("16px");
    const big = await call("settings.set", { interface: { scale: 999 } });
    expect(big.json.interface.scale).toBe(150);
    expect(await rootFont(page)).toBe("24px");
    expect((await call("settings.set", { interface: { scale: "x" } })).isError).toBe(true);
    await call("settings.reset");
    expect(await rootFont(page)).toBe("14.4px");
  } finally {
    await client.close();
  }
});
