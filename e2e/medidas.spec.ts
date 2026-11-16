// SPDX-License-Identifier: GPL-3.0-or-later
// Medir e cortar (G7): tamanho estimado em Propriedades, distância entre dois cliques e corte só da vista, que não deixa
// clicar, pintar nem selecionar por forma no que foi cortado.
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { goProps, openViewMenu, ribbon, sphereStl } from "./ribbon.ts";

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
  await page.mouse.click(box.x + (pts[a * 2] as number), box.y + (pts[a * 2 + 1] as number));
  await expect(page.getByTestId("options-bar")).toContainText("segundo ponto");
  await page.mouse.click(box.x + (pts[b * 2] as number), box.y + (pts[b * 2 + 1] as number));
  const bar = page.getByTestId("options-bar");
  await expect(bar).toContainText(/Distância ≈ [\d.]+ mm .* estimativa/);
  // os dois pontos ficam marcados com a linha entre eles, e medir não destaca a volta na receita (perguntas 22 e 23)
  await expect.poll(async () => (await state(page))?.measure).toBe(2);
  expect((await state(page))?.rowsHighlighted).toBe(0);
  // a tela mede os pontos que estavam sob os cliques; o valor tem de ser o do comando para esses dois pontos
  const shown = Number(/\(([\d.]+) larguras/.exec((await bar.textContent()) ?? "")?.[1]);
  const r = await page.evaluate(
    ([ax, ay, bx, by]) => {
      const v = window.__view3d;
      const lay = window.__timeline?.run("assembly.layout") as { nodes: { part: string; uid: number }[] };
      const px = v?.projectAll() ?? [];
      const box = document.querySelector('[data-testid="scene"] canvas')?.getBoundingClientRect();
      const i = v?.pickAt(ax as number, ay as number);
      const j = v?.pickAt(bx as number, by as number);
      if (i == null || j == null || !box) throw new Error("clique sem ponto");
      const d = window.__timeline?.run("measure.distance", { a: lay.nodes[i], b: lay.nodes[j] });
      const off = (k: number, x: number, y: number) =>
        Math.hypot(box.left + (px[k * 2] as number) - x, box.top + (px[k * 2 + 1] as number) - y);
      return {
        distance: (d as { distance: number }).distance,
        pixelsA: off(i, ax as number, ay as number),
        pixelsB: off(j, bx as number, by as number),
      };
    },
    [
      box.x + (pts[a * 2] as number),
      box.y + (pts[a * 2 + 1] as number),
      box.x + (pts[b * 2] as number),
      box.y + (pts[b * 2 + 1] as number),
    ],
  );
  console.log(
    `distância: tela ${shown}, comando ${r.distance}; pixels do clique ao ponto achado: ${r.pixelsA.toFixed(1)} e ${r.pixelsB.toFixed(1)}`,
  );
  expect(shown).toBeCloseTo(r.distance, 2);
  // o ponto achado fica a menos de um ponto de crochê (~17 px nesta vista) do clique: a silhueta pega o mais próximo da câmera
  expect(Math.max(r.pixelsA, r.pixelsB)).toBeLessThan(20);
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

test("com uma instância movida, o corte em X vale no mundo, o conjunto mede mais que a peça e a medida usa a peça de cada clique", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => {
    window.__timeline?.run("parts.instance", { id: "p1" });
    window.__timeline?.run("parts.set", { id: "p2", pos: [150, 0, 0] }); // mm: 30 larguras de ponto
  });
  await expect.poll(() => count(page)).toBe(866);
  // medir um ponto em cada bola: a peça de cada clique tem de ser a certa (as instâncias repartem os mesmos uids)
  await page.evaluate(() => window.__view3d?.fit());
  await page.waitForTimeout(700);
  await ribbon(page, "vista");
  await page.getByTestId("mode-measure").click();
  const box = await page.getByTestId("scene").locator("canvas").boundingBox();
  if (!box) throw new Error("sem 3D");
  const all = await xy(page);
  // o ponto de cada bola mais perto do centro da sua nuvem na tela
  const centre = (from: number, to: number): [number, number] => {
    let sx = 0;
    let sy = 0;
    for (let k = from; k < to; k++) {
      sx += all[k * 2] as number;
      sy += all[k * 2 + 1] as number;
    }
    const cx = sx / (to - from);
    const cy = sy / (to - from);
    let best = from;
    for (let k = from; k < to; k++)
      if (
        Math.hypot((all[k * 2] as number) - cx, (all[k * 2 + 1] as number) - cy) <
        Math.hypot((all[best * 2] as number) - cx, (all[best * 2 + 1] as number) - cy)
      )
        best = k;
    return [all[best * 2] as number, all[best * 2 + 1] as number];
  };
  const [p1x, p1y] = centre(0, 433);
  const [p2x, p2y] = centre(433, 866);
  await page.mouse.click(box.x + p1x, box.y + p1y);
  await page.mouse.click(box.x + p2x, box.y + p2y);
  const bar = page.getByTestId("options-bar");
  await expect(bar).toContainText(/Distância ≈/);
  const shown = Number(/\(([\d.]+) larguras/.exec((await bar.textContent()) ?? "")?.[1]);
  const expected = await page.evaluate(
    ([ax, ay, bx, by]) => {
      const v = window.__view3d;
      const lay = window.__timeline?.run("assembly.layout") as { nodes: { part: string; uid: number }[] };
      const i = v?.pickAt(ax as number, ay as number);
      const j = v?.pickAt(bx as number, by as number);
      if (i == null || j == null) throw new Error("clique sem ponto");
      const a = lay.nodes[i];
      const b = lay.nodes[j];
      if (a?.part === b?.part) throw new Error("os dois cliques caíram na mesma peça");
      const d = window.__timeline?.run("measure.distance", { a, b }) as { distance: number };
      return d.distance;
    },
    [box.x + p1x, box.y + p1y, box.x + p2x, box.y + p2y],
  );
  expect(shown).toBeCloseTo(expected, 2);
  expect(shown).toBeGreaterThan(15); // as bolas estão a 30 larguras uma da outra
  await page.getByTestId("mode-measure").click(); // desliga a ferramenta
  await page.getByTestId("section-x").click();
  await expect.poll(async () => (await state(page))?.section.clipped ?? 0).toBeGreaterThan(300);
  expect((await state(page))?.section.clipped ?? 0).toBeLessThan(566);
  await page.screenshot({ path: "test-results/corte-instancia.png" });
  const b = (await page.evaluate(() => window.__timeline?.run("measure.bounds", { target: "all" }))) as {
    size: number[];
  };
  const one = (await page.evaluate(() =>
    window.__timeline?.run("measure.bounds", { target: "part", id: "p1" }),
  )) as { size: number[] };
  expect(b.size[0]).toBeGreaterThan((one.size[0] as number) * 1.5);
});

test("o MCP mede e gera receita por forma: measure.bounds, measure.distance e forward.revolve e forward.mesh são consultas", async ({
  page,
}) => {
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
    // receita a partir de forma (P5a), também só consulta
    const f = await call("forward.revolve", { shape: { kind: "sphere", radius: 30 } });
    expect(f.json.total).toBe(452); // caso F2 de docs/08
    const mesh = await call("forward.mesh", { stl: sphereStl(30) });
    expect(Math.abs(mesh.json.total - 452)).toBeLessThan(45); // a malha da esfera dá quase o mesmo que o F2
    const t = await call("timeline.get");
    expect(t.json.features).toEqual([]);
  } finally {
    await client.close();
  }
});

test("clique direito parado no 3D abre o menu da peça; arrastar com o direito não abre (pergunta 11)", async ({
  page,
}) => {
  await open(page);
  const box = await page.getByTestId("scene").locator("canvas").boundingBox();
  const pts = await xy(page);
  if (!box) throw new Error("sem 3D");
  const x = box.x + (pts[200] as number);
  const y = box.y + (pts[201] as number);
  await page.mouse.click(x, y, { button: "right" });
  await expect(page.getByRole("menu", { name: "Menu de Peça 1" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Nova instância" }).click();
  await expect.poll(() => count(page)).toBe(866);
  await expect(page.getByRole("menu")).toHaveCount(0);
  // arrastar com o botão direito desloca a câmera e não abre menu
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 60, y + 20, { steps: 5 });
  await page.mouse.up({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
});
