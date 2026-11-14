// SPDX-License-Identifier: GPL-3.0-or-later
// Medir e cortar (G7): tamanho estimado em Propriedades, distância entre dois cliques e corte só da vista, que não deixa
// clicar, pintar nem selecionar por forma no que foi cortado.
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { goProps, openViewMenu, ribbon } from "./ribbon.ts";

const state = (page: Page) => page.evaluate(() => window.__view3d?.state());
const count = async (page: Page) => (await state(page))?.count ?? 0;

async function open(page: Page) {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  // vista de frente, para o que está embaixo na tela estar embaixo no 3D
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Frente", exact: true }).click();
  await page.waitForTimeout(700);
}

/** Posição na tela (relativa ao canvas) de cada ponto, em pares x,y. */
const xy = (page: Page) => page.evaluate(() => window.__view3d?.projectAll() ?? []);

test("tamanho estimado da peça e do projeto em Propriedades", async ({ page }) => {
  await open(page);
  await goProps(page, "part");
  await expect(page.getByTestId("measure-bounds")).toContainText("Tamanho (estimativa):");
  await expect(page.getByTestId("measure-bounds")).toContainText("mm");
  await goProps(page, "root");
  await expect(page.getByTestId("measure-bounds")).toContainText(
    /\d+(\.\d+)? × \d+(\.\d+)? × \d+(\.\d+)? mm/,
  );
  await page.screenshot({ path: "test-results/medidas-tamanho.png" });
});

test("distância entre dois cliques, em mm estimados, e fora do modo de leitura", async ({ page }) => {
  await open(page);
  await ribbon(page, "vista");
  await page.getByTestId("mode-measure").click();
  await expect(page.getByTestId("options-bar")).toContainText("Clique em dois pontos");
  const box = await page.getByTestId("scene").locator("canvas").boundingBox();
  const pts = await xy(page);
  if (!box) throw new Error("sem 3D");
  // dois pontos bem separados na tela: o mais à esquerda e o mais à direita
  let a = 0;
  let b = 0;
  for (let i = 0; i < pts.length / 2; i++) {
    if ((pts[i * 2] as number) < (pts[a * 2] as number)) a = i;
    if ((pts[i * 2] as number) > (pts[b * 2] as number)) b = i;
  }
  await page.mouse.click(box.x + (pts[a * 2] as number) + 3, box.y + (pts[a * 2 + 1] as number));
  await expect(page.getByTestId("options-bar")).toContainText("segundo ponto");
  await page.mouse.click(box.x + (pts[b * 2] as number) - 3, box.y + (pts[b * 2 + 1] as number));
  await expect(page.getByTestId("options-bar")).toContainText(/Distância ≈ [\d.]+ mm .* estimativa/);
  await page.screenshot({ path: "test-results/medidas-distancia.png" });
  // no modo de leitura não há medir
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("mode-measure")).toHaveCount(0);
});

test("corte: some a metade, clique e seleção por forma ignoram o cortado e o corte não vai para o projeto", async ({
  page,
}) => {
  await open(page);
  const all = await xy(page);
  const lowest = all.reduce(
    (best, v, i) => (i % 2 === 1 && v > (all[best * 2 + 1] as number) ? (i - 1) / 2 : best),
    0,
  );
  const highest = all.reduce(
    (best, v, i) => (i % 2 === 1 && v < (all[best * 2 + 1] as number) ? (i - 1) / 2 : best),
    0,
  );
  const box = await page.getByTestId("scene").locator("canvas").boundingBox();
  if (!box) throw new Error("sem 3D");

  await ribbon(page, "vista");
  await page.getByTestId("section-z").click();
  await expect.poll(async () => (await state(page))?.section.clipped).toBeGreaterThan(100);
  await page.screenshot({ path: "test-results/corte-metade.png" });

  // com a ferramenta de selecionar ponto, clicar onde havia um ponto cortado não seleciona nada
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-point").click();
  await page.mouse.click(box.x + (all[lowest * 2] as number), box.y + (all[lowest * 2 + 1] as number));
  await expect(page.getByTestId("options-selected")).toHaveText("0 selecionados");
  // e no que sobrou, clicar seleciona
  await page.mouse.click(box.x + (all[highest * 2] as number), box.y + (all[highest * 2 + 1] as number));
  await expect(page.getByTestId("options-selected")).toHaveText("1 selecionados");

  // seleção por retângulo na tela toda: só entram pontos que não foram cortados
  await page.getByTestId("sel-rect").click();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width - 5, box.y + box.height - 5, { steps: 6 });
  await page.mouse.up();
  const clipped = (await state(page))?.section.clipped ?? 0;
  const sel = (await state(page))?.selectionCount ?? 0;
  expect(sel).toBeGreaterThan(0);
  expect(sel).toBeLessThanOrEqual(433 - clipped);

  // o corte é só da vista: não entra na linha do tempo
  const feats = (await page.evaluate(() => window.__timeline?.run("timeline.get"))) as {
    features: unknown[];
  };
  expect(feats.features).toEqual([]);

  // inverter troca o lado; entrar no modo de leitura tira o corte e mostra a peça inteira
  await ribbon(page, "vista");
  const antes = (await state(page))?.section.clipped ?? 0;
  await page.getByTestId("section-flip").click();
  // o outro lado: o que estava cortado volta e o que estava à vista some (± os pontos sobre o plano)
  await expect
    .poll(async () => Math.abs(((await state(page))?.section.clipped ?? 0) - (433 - antes)))
    .toBeLessThan(25);
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect.poll(async () => (await state(page))?.section.clipped).toBe(0);
  await page.keyboard.press("Escape");
  await ribbon(page, "vista");
  await expect(page.getByTestId("section-z")).not.toHaveAttribute("aria-pressed", "true");
});

test("com uma instância movida, o corte em X vale no mundo (metade do conjunto) e o conjunto mede mais que a peça", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.__timeline?.run("parts.instance", { id: "p1" });
    window.__timeline?.run("parts.set", { id: "p2", pos: [30, 0, 0] });
  });
  await expect.poll(() => count(page)).toBe(866);
  await ribbon(page, "vista");
  await page.getByTestId("section-x").click();
  await expect.poll(async () => (await state(page))?.section.clipped ?? 0).toBeGreaterThan(300);
  expect((await state(page))?.section.clipped ?? 0).toBeLessThan(566);
  const b = (await page.evaluate(() => window.__timeline?.run("measure.bounds", { target: "all" }))) as {
    size: number[];
  };
  const one = (await page.evaluate(() =>
    window.__timeline?.run("measure.bounds", { target: "part", id: "p1" }),
  )) as { size: number[] };
  expect(b.size[0]).toBeGreaterThan((one.size[0] as number) * 1.5);
});

test("o MCP mede: measure.bounds e measure.distance são consultas", async ({ page }) => {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: "47935" } as Record<string, string>,
    }),
  );
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
    const out = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: r.isError === true, json: r.isError ? null : JSON.parse(out) };
  };
  try {
    await page.goto("/?bridge=47935");
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    await expect.poll(() => count(page)).toBe(433);
    const b = await call("measure.bounds");
    expect(b.json).toMatchObject({ estimate: true, nodes: 433, unit: "larguras de ponto" });
    expect(b.json.sizeMm[0]).toBeGreaterThan(40);
    const d = await call("measure.distance", { a: { part: "p1", uid: 3 }, b: { part: "p1", uid: 300 } });
    expect(d.json.distanceMm).toBeGreaterThan(0);
    const bad = await call("measure.distance", { a: { part: "p1", uid: 3 }, b: { part: "p1", uid: 99999 } });
    expect(bad.isError).toBe(true);
    const t = await call("timeline.get");
    expect(t.json.features).toEqual([]);
  } finally {
    await client.close();
  }
});
