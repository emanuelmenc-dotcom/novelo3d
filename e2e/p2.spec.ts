// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P2: vista 3D por ponto, clique destaca a volta na receita, volta da tabela destaca no 3D,
// 20.000 pontos, e graph.layout operável via MCP (D-21).
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "@playwright/test";
import { openViewMenu, ribbon, showTab } from "./ribbon.ts";

const PORT = 47897;

test("P2: 3D da bola, seleção ligada à receita e comando via MCP", async ({ page }) => {
  mkdirSync("test-results", { recursive: true });
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
    await expect(page.getByTestId("scene").locator("canvas")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
    await page.screenshot({ path: "test-results/p2-3d.png", fullPage: true });

    // 1. clicar num ponto seleciona e destaca a volta na tabela
    const box = await page.getByTestId("scene").locator("canvas").boundingBox();
    if (!box) throw new Error("sem canvas");
    let picked = false;
    // varre uma grade sobre a peça até acertar um ponto (a bola ocupa o meio da vista)
    search: for (let gy = 0; gy < 9; gy++) {
      for (let gx = 0; gx < 9; gx++) {
        await page.mouse.click(
          box.x + box.width * (0.36 + gx * 0.035),
          box.y + box.height * (0.3 + gy * 0.05),
        );
        const sel = await page.evaluate(() => window.__view3d?.state().selected);
        if (sel !== null && sel !== undefined) {
          picked = true;
          break search;
        }
      }
    }
    expect(picked).toBe(true);
    await expect(page.getByTestId("node-info")).toContainText(/Volta .*, ponto \d+/);
    await showTab(page, "Verificação de contagem");
    await expect(page.getByTestId("verify-table").locator("tr.sel")).toHaveCount(1);

    // 2. escolher uma volta na tabela destaca todos os pontos dela no 3D
    const cell = page.getByTestId("verify-table").getByRole("cell", { name: "7–12", exact: true });
    await cell.click();
    let rows = await page.evaluate(() => window.__view3d?.state().rows);
    if (rows === null) {
      // o clique no 3D já tinha escolhido essa volta e o clique na tabela desmarcou: alterna de novo
      await cell.click();
      rows = await page.evaluate(() => window.__view3d?.state().rows);
    }
    expect(rows).toEqual([6, 7, 8, 9, 10, 11]); // voltas 7 a 12 (índices expandidos)

    // 3. grafo (ligações) liga e desliga sem erro
    await openViewMenu(page);
    await page.getByLabel("Mostrar grafo (ligações)").check();
    await page.screenshot({ path: "test-results/p2-3d-grafo.png", fullPage: true });
    await openViewMenu(page);
    await page.getByLabel("Mostrar grafo (ligações)").uncheck();

    // 4. as mesmas posições pelo MCP
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    await showTab(page, "Receita");
    const recipe = await page.getByLabel("Receita", { exact: true }).inputValue();
    const r = await client.callTool({
      name: "novelo_bridge_call",
      arguments: { method: "graph.layout", params: { text: recipe } },
    });
    const out = JSON.parse((r.content as { text: string }[])[0]?.text ?? "{}");
    expect(out.stats.nodes).toBe(433);
    expect(out.stats.meanEdge).toBeCloseTo(1, 2);
  } finally {
    await client.close();
  }
});

test("P2: 20.000 pontos na vista 3D", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const big = [
    "V1: 6 pb no anel mágico (6)",
    "V2: 6 aum (12)",
    "V3: (1 pb, 1 aum) x6 (18)",
    "V4: (2 pb, 1 aum) x6 (24)",
    "V5–838: 1 pb em cada ponto (24)",
  ].join("\n");
  const t0 = Date.now();
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).fill(big);
  await expect
    .poll(() => page.evaluate(() => window.__view3d?.state().count), { timeout: 120_000 })
    .toBeGreaterThan(20_000);
  const loadMs = Date.now() - t0;
  // o 3D só desenha quando algo muda; a medição pede desenho contínuo por 3 s
  await page.evaluate(() => window.__view3d?.benchmark(3500));
  const f0 = await page.evaluate(() => window.__view3d?.state().frames ?? 0);
  await page.waitForTimeout(3000);
  const f1 = await page.evaluate(() => window.__view3d?.state().frames ?? 0);
  const fps = (f1 - f0) / 3;
  console.log(
    `20.000 pontos: calculado e desenhado em ${loadMs} ms; ${fps.toFixed(1)} quadros/s (renderização por software, sem GPU)`,
  );
  const st = await page.evaluate(() => window.__view3d?.state());
  console.log(
    `R1: ${st?.triangles} triângulos em ${st?.batches} lotes; montagem ${Math.round(st?.buildMs ?? 0)} ms; nível ${st?.lod}`,
  );
  expect(st?.triangles ?? 1e9).toBeLessThan(2_000_000);
  expect(st?.batches ?? 99).toBeLessThanOrEqual(48);
  await page.screenshot({ path: "test-results/p2-3d-20mil.png" });
  expect(fps).toBeGreaterThan(0);
});

test("P2: cubo de vistas, atalhos e navegação estilo FreeCAD", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
  const dir = () => page.evaluate(() => window.__view3d?.state().viewDir ?? [0, 0, 0]);
  const settled = () => page.waitForFunction(() => window.__view3d?.state().animating === false);
  const near = (v: number[], t: number[]) => Math.hypot(v[0]! - t[0]!, v[1]! - t[1]!, v[2]! - t[2]!) < 0.02;

  // botões das vistas padrão
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Frente", exact: true }).click();
  await settled();
  expect(near(await dir(), [0, -1, 0])).toBe(true);
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Direita", exact: true }).click();
  await settled();
  expect(near(await dir(), [1, 0, 0])).toBe(true);

  // atalhos de teclado iguais aos do FreeCAD: 2 = topo, 4 = trás
  await page.keyboard.press("2");
  await settled();
  const top = await dir();
  expect(top[2]).toBeGreaterThan(0.999);
  await page.keyboard.press("4");
  await settled();
  expect(near(await dir(), [0, 1, 0])).toBe(true);

  // clique real no cubo (padrão: canto inferior direito): vai para uma das 26 direções (faces, arestas, cantos)
  const box = await page.getByTestId("scene").locator("canvas").boundingBox();
  if (!box) throw new Error("sem canvas");
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Isométrica", exact: true }).click();
  await settled();
  const cr0 = await page.evaluate(() => window.__view3d?.state().cubeRect);
  if (!cr0) throw new Error("sem cubo");
  await page.mouse.click(box.x + cr0.x + cr0.size / 2, box.y + cr0.y + cr0.size / 2); // centro do cubo (padrão: canto inferior direito)
  await settled();
  const v = await dir();
  const nz = v.map(Math.abs).filter((c) => c > 0.05);
  expect(nz.length).toBeGreaterThan(0);
  for (const c of nz) expect(c).toBeCloseTo(nz[0] as number, 1); // faces, arestas e cantos: componentes iguais
  await page.screenshot({ path: "test-results/p2-cubo.png" });

  // arrastar com o botão esquerdo gira a câmera; "Ajustar" volta ao enquadramento inicial
  const before = await dir();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
  const after = await dir();
  expect(near(before, after)).toBe(false);
  await page.keyboard.press("f");
  const fitted = await dir();
  expect(fitted[1]).toBeLessThan(-0.5); // de frente e um pouco de cima, como no início
});

test("Configurações > Interface: posição, formato e tamanho do cubo de vistas", async ({ page }) => {
  const PORT_S = 47896;
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT_S) } as Record<string, string>,
    }),
  );
  try {
    await page.goto(`/?bridge=${PORT_S}`);
    await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
    const cube = () => page.evaluate(() => window.__view3d?.state().viewCube);
    const dir = () => page.evaluate(() => window.__view3d?.state().viewDir ?? [0, 0, 0]);
    const settled = () => page.waitForFunction(() => window.__view3d?.state().animating === false);
    const canvas = page.getByTestId("scene").locator("canvas");

    // padrão: chanfrado, canto inferior direito, 112 px
    expect(await cube()).toEqual({ position: "bottom-left", chamfered: true, size: 112 });
    await page.screenshot({ path: "test-results/p2-cubo-chanfrado.png" });

    // abrir o menu: aba Interface
    await ribbon(page, "arquivo");
    await page.getByRole("button", { name: "Configurações" }).click();
    await ribbon(page, "arquivo");
    await expect(page.getByRole("dialog", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Interface" })).toHaveAttribute("aria-selected", "true");

    // posição: superior esquerdo; o clique real no novo lugar do cubo troca a vista
    await page.getByLabel("Superior esquerdo").check();
    await expect.poll(async () => (await cube())?.position).toBe("top-left");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const box = await canvas.boundingBox();
    if (!box) throw new Error("sem canvas");
    await openViewMenu(page);
    await page.getByRole("menuitem", { name: "Frente", exact: true }).click();
    await settled();
    const before = await dir();
    await page.screenshot({ path: "test-results/p2-cubo-esquerda.png" });
    const cr = await page.evaluate(() => window.__view3d?.state().cubeRect);
    if (!cr) throw new Error("sem cubo");
    // faixa do chanfro superior do cubo (de frente, leva à aresta frente-topo), onde quer que o cubo esteja
    await page.mouse.click(box.x + cr.x + cr.size / 2, box.y + cr.y + cr.size * 0.13);
    await settled();
    const after = await dir();
    expect(
      Math.hypot(after[0]! - before[0]!, after[1]! - before[1]!, after[2]! - before[2]!),
    ).toBeGreaterThan(0.05);

    // formato simples e tamanho maior
    await ribbon(page, "arquivo");
    await page.getByRole("button", { name: "Configurações" }).click();
    await page.getByLabel("Cubo chanfrado (faces, arestas e cantos)").uncheck();
    await expect.poll(async () => (await cube())?.chamfered).toBe(false);
    const slider = page.getByLabel("Tamanho do cubo");
    await slider.focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowRight"); // +4 px por passo
    await expect.poll(async () => (await cube())?.size).toBe(132);
    await expect(page.getByTestId("cube-size")).toHaveText("132 px");
    await page.screenshot({ path: "test-results/p2-cubo-simples.png" });

    // persiste ao recarregar a página
    await page.keyboard.press("Escape");
    await page.reload();
    await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(433);
    expect(await cube()).toEqual({ position: "top-left", chamfered: false, size: 132 });

    // o MCP lê e altera as mesmas configurações (comandos settings.*)
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown>) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      return { isError: r.isError === true, text: (r.content as { text: string }[])[0]?.text ?? "" };
    };
    const got = await call("settings.get", {});
    expect(JSON.parse(got.text).interface.viewCube).toEqual({
      position: "top-left",
      chamfered: false,
      size: 132,
    });
    const set = await call("settings.set", {
      interface: { viewCube: { position: "bottom-left", chamfered: true, size: 90 } },
    });
    expect(set.isError).toBe(false);
    await expect.poll(() => cube()).toEqual({ position: "bottom-left", chamfered: true, size: 90 });
    const bad = await call("settings.set", { interface: { viewCube: { position: "centro" } } });
    expect(bad.isError).toBe(true);

    // restaurar padrão pelo menu
    await ribbon(page, "arquivo");
    await page.getByRole("button", { name: "Configurações" }).click();
    await page.getByRole("button", { name: "Restaurar padrão" }).click();
    await expect.poll(() => cube()).toEqual({ position: "bottom-left", chamfered: true, size: 112 });
  } finally {
    await client.close();
  }
});
