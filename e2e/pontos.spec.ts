// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P3.5: seleção por clique e por forma, pintura de fio e tensão por ponto, desfazer, persistência e MCP.
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { expectTimelineOk, openViewMenu, ribbon, showTab } from "./ribbon.ts";

const PORT = 47899;
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });

/** Abre o 3D e o painel Pontos (clássico: 3D em cima, Pontos embaixo). */
async function open(page: Page, url = "/") {
  await page.goto(url);
  await tab(page, "Propriedades").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
}

/** Pixel (no canvas) do ponto, entre os índices dados, que fica mais perto do centro da vista. */
async function centerPoint(page: Page, from: number, to: number) {
  return page.evaluate(
    ([a, b]) => {
      const v = window.__view3d;
      if (!v) throw new Error("sem 3D");
      const xy = v.projectAll();
      const c = document.querySelector('[data-testid="scene"] canvas') as HTMLCanvasElement;
      const cx = c.clientWidth / 2;
      const cy = c.clientHeight / 2;
      let best = a as number;
      let bd = Number.POSITIVE_INFINITY;
      for (let i = a as number; i <= (b as number); i++) {
        const d = Math.hypot((xy[i * 2] as number) - cx, (xy[i * 2 + 1] as number) - cy);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      return { id: best, x: xy[best * 2] as number, y: xy[best * 2 + 1] as number };
    },
    [from, to],
  );
}

test("selecionar por volta e por retângulo, pintar fio, tensão, desfazer e persistir", async ({ page }) => {
  mkdirSync("test-results", { recursive: true });
  await open(page);
  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  const count = page.getByTestId("sel-count");
  await expect(count).toHaveText("0");

  // Selecionar > Volta: clique num ponto da região cilíndrica (voltas 8 a 11 têm 36 pontos)
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-group").click();
  const p = await centerPoint(page, 163, 306);
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await expect(count).toHaveText("36");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().selectionCount)).toBe(36);
  await page.screenshot({ path: "test-results/pontos-selecao-volta.png" });

  // Ctrl + clique tira a volta da seleção
  await page.keyboard.down("Control");
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await page.keyboard.up("Control");
  await expect(count).toHaveText("0");

  // Retângulo no meio da peça
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-rect").click();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 6 });
  await expect(page.getByTestId("shape-overlay").locator("rect")).toHaveCount(1);
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.up();
  const n = Number(await count.textContent());
  expect(n).toBeGreaterThan(10);
  expect(n).toBeLessThan(433);
  await page.screenshot({ path: "test-results/pontos-selecao-retangulo.png" });

  // Pintar fio: seleciona uma volta inteira e aplica o fio B
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-group").click();
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await expect(count).toHaveText("36");
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-yarn").click();
  await page.getByLabel("Fio da pintura").selectOption("B");
  await ribbon(page, "pintar");
  await page.getByTestId("apply-selection").click();
  await expect.poll(() => page.evaluate((i) => window.__view3d?.nodeColor(i), p.id)).toBe("#f4f1e8");
  await page.screenshot({ path: "test-results/pontos-fio.png" });

  // desfazer volta ao verde musgo; refazer volta ao off white
  await ribbon(page, "historico");
  await page.getByTestId("undo").click();
  await expect.poll(() => page.evaluate((i) => window.__view3d?.nodeColor(i), p.id)).toBe("#5d6b3a");
  await ribbon(page, "historico");
  await page.getByTestId("redo").click();
  await expect.poll(() => page.evaluate((i) => window.__view3d?.nodeColor(i), p.id)).toBe("#f4f1e8");

  // Tensão: aplica -1 na mesma seleção; o painel conta os pontos editados
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-tension").click();
  await page.getByLabel("Valor da tensão").fill("-1");
  await ribbon(page, "pintar");
  await page.getByTestId("apply-selection").click();
  await expect(page.getByTestId("points-info")).toContainText("72 pontos editados");
  await page.screenshot({ path: "test-results/pontos-tensao.png" });

  // persiste ao recarregar: a edição por ponto continua
  await page.waitForTimeout(600);
  await page.reload();
  await tab(page, "Propriedades").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
  await expect(page.getByTestId("points-info")).toContainText("72 pontos editados");
  await expect.poll(() => page.evaluate((i) => window.__view3d?.nodeColor(i), p.id)).toBe("#f4f1e8");
  await expectTimelineOk(page);
});

test("pincel arrastado pinta pontos vizinhos; Alt + arrasto gira a câmera", async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-yarn").click();
  await ribbon(page, "pintar");
  await page.getByTestId("brush-brush").click();
  await page.getByLabel("Fio da pintura").selectOption("B");
  const a = await centerPoint(page, 163, 306);
  await page.mouse.move(box.x + a.x, box.y + a.y);
  await page.mouse.down();
  await page.mouse.move(box.x + a.x + 40, box.y + a.y, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId("points-info")).toContainText("pontos editados");
  const edited = Number(
    (await page.getByTestId("points-info").textContent())?.match(/(\d+) pontos editados/)?.[1],
  );
  expect(edited).toBeGreaterThan(3);
  await expect.poll(() => page.evaluate((i) => window.__view3d?.nodeColor(i), a.id)).toBe("#f4f1e8");
  // Alt + arrasto continua girando a câmera
  const before = await page.evaluate(() => window.__view3d?.state().viewDir);
  await page.keyboard.down("Alt");
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 140, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  const after = await page.evaluate(() => window.__view3d?.state().viewDir);
  expect(after).not.toEqual(before);
  await expectTimelineOk(page);
});

test("o MCP seleciona, valida cadeia, edita tensão e a interface acompanha", async ({ page }) => {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) } as Record<string, string>,
    }),
  );
  try {
    await open(page, `/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      const text = (r.content as { text: string }[])[0]?.text ?? "";
      return { isError: r.isError === true, text, json: r.isError ? null : JSON.parse(text) };
    };
    await showTab(page, "Receita");
    const text = await page.getByLabel("Receita", { exact: true }).inputValue();

    const info = await call("points.info", { text });
    expect(info.json).toMatchObject({ points: 433, groups: 17, firstUid: 1 });

    const sel = await call("selection.select", { text, by: { kind: "group", from: 7, to: 9 } });
    expect(sel.json.count).toBe(108);
    await ribbon(page, "selecionar");
    await expect(page.getByTestId("sel-count")).toHaveText("108");
    await expect.poll(() => page.evaluate(() => window.__view3d?.state().selectionCount)).toBe(108);

    // três voltas juntas não são uma linha; uma volta fechada é
    expect((await call("selection.chain", { text })).json.linear).toBe(false);
    await call("selection.select", { text, by: { kind: "group", from: 8 } });
    expect((await call("selection.chain", { text })).json).toMatchObject({
      linear: true,
      closed: true,
      count: 36,
    });

    // tensão -1 nas voltas 7 a 9: os pontos ficam 1,4x maiores no layout
    await call("selection.select", { text, by: { kind: "group", from: 7, to: 9 } });
    await call("points.set", { text, prop: "tension", value: -1 });
    const lay = await call("graph.layout", { text, include: true });
    const sizes = (lay.json.nodes as { row: number; size: number }[])
      .filter((n) => n.row === 7)
      .map((n) => n.size);
    expect(sizes.length).toBe(36);
    expect(sizes.every((s) => Math.abs(s - 1.4) < 1e-6)).toBe(true);
    await page.screenshot({ path: "test-results/pontos-mcp.png" });

    // desfazer pelo MCP volta o tamanho
    await call("history.undo");
    const lay2 = await call("graph.layout", { text, include: true });
    expect((lay2.json.nodes as { row: number; size: number }[]).find((n) => n.row === 7)?.size).toBeCloseTo(
      1,
    );
    // fio inexistente dá erro claro
    const bad = await call("points.set", { text, prop: "yarn", value: "Z" });
    expect(bad.isError).toBe(true);
    expect(bad.text).toMatch(/não existe na paleta/);
  } finally {
    await client.close();
  }
});

test("retângulo atravessando pega mais pontos que só os visíveis", async ({ page }) => {
  await open(page);
  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-rect").click();
  const drag = async () => {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.8, { steps: 6 });
    await page.mouse.up();
    return Number(await page.getByTestId("sel-count").textContent());
  };
  const through = await drag();
  await ribbon(page, "selecionar");
  await page.getByTestId("visible-only").check();
  const visible = await drag();
  expect(visible).toBeGreaterThan(10);
  expect(visible).toBeLessThan(through);
  await ribbon(page, "selecionar");
  await page.getByTestId("visible-only").uncheck();
  expect(await drag()).toBe(through);
});

test("R0: pintar não recria as malhas e, parado, o 3D não desenha quadros", async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().frames)).toBeGreaterThan(0);
  // parado por 2 s: nenhum quadro novo
  // espera o 3D assentar (carga, redimensionar) antes de medir o repouso
  await expect
    .poll(
      async () => {
        const a = await page.evaluate(() => window.__view3d?.state().frames ?? 0);
        await page.waitForTimeout(600);
        return (await page.evaluate(() => window.__view3d?.state().frames ?? 0)) - a;
      },
      { timeout: 15_000 },
    )
    .toBe(0);
  const f0 = await page.evaluate(() => window.__view3d?.state().frames ?? 0);
  await page.waitForTimeout(2000);
  const f1 = await page.evaluate(() => window.__view3d?.state().frames ?? 0);
  expect(f1).toBe(f0);

  // pintar uma volta com o fio B muda cores, mas a geometria (e as malhas) continua a mesma
  const builds = await page.evaluate(() => window.__view3d?.state().meshBuilds ?? 0);
  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-group").click();
  const p = await centerPoint(page, 163, 306);
  await page.mouse.click(box.x + p.x, box.y + p.y);
  await ribbon(page, "selecionar");
  await expect(page.getByTestId("sel-count")).toHaveText("36");
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-yarn").click();
  await page.getByLabel("Fio da pintura").selectOption("B");
  await ribbon(page, "pintar");
  await page.getByTestId("apply-selection").click();
  await expect.poll(() => page.evaluate((i) => window.__view3d?.nodeColor(i), p.id)).toBe("#f4f1e8");
  expect(await page.evaluate(() => window.__view3d?.state().meshBuilds)).toBe(builds);
});

test("R1: nível tubo troca a malha mas a seleção por forma continua", async ({ page }) => {
  await open(page);
  const detail = (d: "auto" | "stitch" | "tube") => page.evaluate((x) => window.__view3d?.setDetail(x), d);
  const st = () => page.evaluate(() => window.__view3d?.state());
  const stitch = await st();
  expect(stitch?.lod).toBe("stitch");
  // 3D no estilo CrochetPARADE (D-57): um lote de fio e sem nível tubo; o desenho realista (vários lotes, tubo com menos
  // triângulos) volta ao ligar `realistic3d` em packages/commands/src/features.ts
  expect(stitch?.batches).toBe(1);
  expect(stitch?.triangles).toBeGreaterThan(0);
  await detail("tube");
  expect((await st())?.lod).toBe("stitch");
  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-rect").click();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.8, { steps: 6 });
  await page.mouse.up();
  expect(Number(await page.getByTestId("sel-count").textContent())).toBeGreaterThan(10);
  await page.screenshot({ path: "test-results/r1-tubo.png" });
  await detail("auto");
  expect((await st())?.lod).toBe("stitch");
});

test("D-57: 3D no estilo CrochetPARADE: fio por ligação, clique acha o ponto e 'Só linhas' não perde a seleção", async ({
  page,
}) => {
  await open(page);
  const st = () => page.evaluate(() => window.__view3d?.state());
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.getByTestId("scene").locator("canvas").screenshot({ path: "test-results/cp-fio-grande.png" });
  const s = await st();
  expect(s?.models).toEqual(["cp:fio"]);
  expect(s?.batches).toBe(1);
  // clicar no centro projetado de um ponto visível seleciona exatamente esse ponto
  const visible = await page.evaluate(() => window.__view3d?.visibleNodes() ?? []);
  // alvo de clique fechando a malha: só os pontos da frente (e poucos pelas frestas) ficam alcançáveis, não os 433
  expect(visible.length).toBeLessThan(0.55 * 433);
  expect(visible.length).toBeGreaterThan(20);
  const xy = await page.evaluate(() => window.__view3d?.projectAll() ?? []);
  const box = await page.getByTestId("scene").locator("canvas").boundingBox();
  if (!box) throw new Error("sem canvas");
  const at = async (i: number) => {
    await page.mouse.click(box.x + (xy[i * 2] as number), box.y + (xy[i * 2 + 1] as number));
    return (await st())?.selected;
  };
  // clicar no centro de um ponto da frente seleciona esse ponto (a esfera da frente vence a vizinha que a toca)
  let target = -1;
  for (const i of visible.slice(Math.floor(visible.length / 3))) {
    if ((await at(i)) === i) {
      target = i;
      break;
    }
  }
  expect(target).toBeGreaterThanOrEqual(0);
  // dois pontos vizinhos que se acham pelo próprio centro: clicar no meio do segmento entre eles seleciona um dos dois
  let pair = -1;
  for (const i of visible) {
    if (!visible.includes(i + 1)) continue;
    if ((await at(i)) === i && (await at(i + 1)) === i + 1) {
      pair = i;
      break;
    }
  }
  expect(pair).toBeGreaterThanOrEqual(0);
  const mx = ((xy[pair * 2] as number) + (xy[(pair + 1) * 2] as number)) / 2;
  const my = ((xy[pair * 2 + 1] as number) + (xy[(pair + 1) * 2 + 1] as number)) / 2;
  await page.mouse.click(box.x + mx, box.y + my);
  expect([pair, pair + 1]).toContain((await st())?.selected);
  await page.mouse.click(box.x + (xy[target * 2] as number), box.y + (xy[target * 2 + 1] as number));
  await openViewMenu(page);
  await page.getByTestId("wire-toggle").check();
  expect((await st())?.selected).toBe(target);
  await page.screenshot({ path: "test-results/cp-so-linhas.png" });
  await openViewMenu(page);
  await page.getByTestId("wire-toggle").uncheck();
  await page.screenshot({ path: "test-results/cp-fio.png" });
});
