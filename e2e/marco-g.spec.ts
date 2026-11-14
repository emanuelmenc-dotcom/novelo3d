// SPDX-License-Identifier: GPL-3.0-or-later
// Fechamento do marco G (interface 2): um cenário só que cruza as etapas G4 a G7 (instância, montagem, pintura, desfazer,
// esconder, corte, medida, modo de leitura, exportar, importar e recarregar). Cada etapa tem o seu teste; este confere que
// juntas a linha do tempo continua reexecutando igual. Nenhum outro teste cruza essas etapas (veja arvore, desfazer,
// medidas e projeto).
import { expect, type Page, test } from "@playwright/test";
import { expectTimelineOk, goProps, goTree, ribbon, showTab } from "./ribbon.ts";

const state = (page: Page) => page.evaluate(() => window.__view3d?.state());
const count = async (page: Page) => (await state(page))?.count ?? 0;
const run = (page: Page, method: string, params: Record<string, unknown> = {}) =>
  page.evaluate(
    ([m, p]) => window.__timeline?.run(m as string, p as Record<string, unknown>),
    [method, params],
  );

test("instância, montagem, pintura, desfazer, esconder, corte, medida, leitura, exportar, importar e recarregar", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);

  await run(page, "parts.instance", { id: "p1" });
  const width = async () =>
    ((await run(page, "measure.bounds", { target: "all" })) as { size: number[] }).size[0] as number;
  const base = await width(); // a instância já nasce ao lado da original
  await run(page, "assembly.add", { parts: ["p2"] });
  await run(page, "assembly.set", { id: "a1", pos: [40, 0, 0] });
  await run(page, "paint.rows", { yarn: "B", from: 2, to: 2 });
  await expect.poll(() => count(page)).toBe(866);

  await goTree(page);
  await page.screenshot({ path: "test-results/g4-g5-arvore-montagem.png" });
  await goProps(page, "root");
  await page.screenshot({ path: "test-results/g4-g5-propriedades.png" });

  // desfazer duas vezes: a pintura e a posição da montagem saem e a instância volta para onde nasceu
  expect(await width()).toBeGreaterThan(base + 30);
  await run(page, "history.undo");
  await run(page, "history.undo");
  expect(await width()).toBeCloseTo(base, 1);
  // refazer uma devolve a posição da montagem (a pintura continua desfeita)
  await run(page, "history.redo");
  expect(await width()).toBeGreaterThan(base + 30);
  await expect.poll(() => count(page)).toBe(866);

  // esconder a instância tira os pontos dela da cena e da medida
  await run(page, "parts.setVisible", { id: "p2", visible: false });
  await expect.poll(() => count(page)).toBe(433);
  const hidden = (await run(page, "measure.bounds", { target: "all" })) as { nodes: number };
  expect(hidden.nodes).toBe(433);
  await run(page, "parts.setVisible", { id: "p2", visible: true });
  await expect.poll(() => count(page)).toBe(866);

  // corte ligado; desfazer e refazer com ele ligado não deixa o corte fora de sincronia com a cena
  await ribbon(page, "vista");
  await page.getByTestId("section-x").click();
  await expect.poll(async () => (await state(page))?.section.clipped ?? 0).toBeGreaterThan(100);
  const clippedBefore = (await state(page))?.section.clipped ?? 0;
  await run(page, "history.undo");
  await run(page, "history.redo");
  await expect.poll(async () => (await state(page))?.section.clipped ?? 0).toBe(clippedBefore);
  expect(clippedBefore).toBeLessThan(866);

  // modo de leitura tira o corte e volta
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect.poll(async () => (await state(page))?.section.clipped).toBe(0);
  await page.keyboard.press("Escape");

  await expectTimelineOk(page);
  const before = (await run(page, "history.get")) as { canUndo: boolean };
  expect(before.canUndo).toBe(true);

  // exportar e importar o projeto inteiro, com a linha do tempo, devolve o mesmo projeto
  const exported = await run(page, "project.export");
  await run(page, "project.import", { project: exported });
  await expect.poll(() => count(page)).toBe(866);
  await expectTimelineOk(page);

  // recarregar a página: o projeto, a montagem e o desfazer continuam
  await page.waitForTimeout(1500); // a gravação automática tem atraso
  await page.reload();
  await expect.poll(() => count(page)).toBe(866);
  expect(await run(page, "history.get")).toEqual({ canUndo: true, canRedo: true });
  await expectTimelineOk(page);
});

const bola = (voltas: number): string => {
  const rows = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)"];
  for (let i = 3; i <= voltas; i++) rows.push(`V${i}: (${i - 2} pb, 1 aum) x6 (${6 * i})`);
  return rows.join("\n");
};

test("fotos do gráfico v3 (G3): faixa com etiqueta Nx, tabela da receita e página de continuação", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  const text = (await run(page, "project.export").then(
    (r) => (r as { parts: { parts: { text: string }[] } }).parts.parts[0]?.text,
  )) as string;
  await page.setViewportSize({ width: 800, height: 1100 });
  const shoot = async (recipe: string, name: string) => {
    const r = (await run(page, "chart.render", { text: recipe })) as { pages: { svg: string }[] };
    expect(r.pages.length).toBeGreaterThan(0);
    for (const [k, pg] of r.pages.entries()) {
      await page.setContent(`<body style="margin:0;background:#fff">${pg.svg}</body>`);
      await page.screenshot({ path: `test-results/${name}-${k + 1}.png` });
    }
    return r.pages.length;
  };
  await shoot(text, "g3-bola");
  const grande = await shoot(bola(30), "g3-grande");
  expect(grande).toBeGreaterThan(1); // receita grande vira mais de uma página
});
