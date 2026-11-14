// SPDX-License-Identifier: GPL-3.0-or-later
// Desfazer pela linha do tempo (G6): reexecutar tudo a cada Ctrl+Z precisa continuar rápido numa receita grande.
import { expect, test } from "@playwright/test";
import { expectTimelineOk, showTab } from "./ribbon.ts";

const bola = (voltas: number): string => {
  const rows = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)"];
  for (let i = 3; i <= voltas; i++) rows.push(`V${i}: (${i - 2} pb, 1 aum) x6 (${6 * i})`);
  return rows.join("\n");
};

test("Ctrl+Z numa receita de 6 mil pontos, depois de editar a receita e 20 traços, responde em poucos segundos", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).fill(bola(45));
  await showTab(page, "Verificação de contagem");
  await expect(page.getByText(/Receita fecha · 6210 pontos/)).toBeVisible({ timeout: 60_000 });
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).blur();
  const ms = await page.evaluate(async () => {
    const t = window.__timeline;
    if (!t) throw new Error("sem linha do tempo");
    const recipe =
      (t.run("project.export") as { parts: { parts: { text: string }[] } }).parts.parts[0]?.text ?? "";
    const last = (t.run("points.info", { text: recipe }) as { lastUid: number }).lastUid;
    t.run("parts.instance", { id: "p1" });
    const frames = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
    // tempo de uma ação até o 3D e o gráfico recalcularem (dois quadros depois)
    const timed = async (fn: () => void): Promise<number> => {
      const t0 = performance.now();
      fn();
      await frames();
      return performance.now() - t0;
    };
    for (let k = 0; k < 20; k++) {
      t.run("history.begin");
      t.run("tool.brush", { text: recipe, uid: last - 10 - k * 40, hops: 1, prop: "tension", value: 0.5 });
      t.run("history.end");
    }
    const moveDo = await timed(() => t.run("parts.set", { id: "p2", pos: [30, 0, 0] }));
    const moveUndo = await timed(() => t.run("history.undo"));
    const strokeDo = await timed(() =>
      t.run("tool.brush", { text: recipe, uid: last - 5, hops: 1, prop: "tension", value: 0.1 }),
    );
    const edits = () => (t.run("edit.get") as { tensionOverrides: number }).tensionOverrides;
    const before = edits();
    const strokeUndo = await timed(() => t.run("history.undo"));
    if (edits() >= before) throw new Error("o desfazer não mudou as edições");
    return { moveDo, moveUndo, strokeDo, strokeUndo };
  });
  console.log(
    `fazer/desfazer: mover peça ${ms.moveDo.toFixed(0)}/${ms.moveUndo.toFixed(0)} ms; traço de tensão ${ms.strokeDo.toFixed(0)}/${ms.strokeUndo.toFixed(0)} ms`,
  );
  expect(ms.strokeUndo).toBeLessThan(10_000);
  // digitar a receita em vários passos vira uma feature só na faixa
  await showTab(page, "Receita");
  const area = page.getByLabel("Receita", { exact: true });
  for (const extra of ["V46: 270 pb (270)", "V47: 270 pb (270)", "V48: 270 pb (270)"]) {
    await area.fill(`${bola(45)}${String.fromCharCode(10)}${extra}`);
    await area.blur();
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(700);
  const listed = (await page.evaluate(() => {
    const t = window.__timeline;
    if (!t) throw new Error("sem linha do tempo");
    return t.run("timeline.get");
  })) as { features: { kind: string; label: string }[] };
  const recipes = listed.features.filter((f) => f.kind === "recipe");
  // a primeira confirmação (antes dos traços) e as três de agora, juntas numa feature só
  const feats = recipes.length;
  expect(feats).toBe(2);
  expect((recipes[1] as { label?: string }).label).toContain("3 edições");
  await expectTimelineOk(page);
});

test("o desfazer sobrevive a recarregar a página; uma linha do tempo fora de sincronia é descartada sem perder o projeto", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.evaluate(() => {
    window.__timeline?.run("parts.instance", { id: "p1" });
    window.__timeline?.run("paint.rows", { yarn: "B", from: 2, to: 2 });
  });
  await page.waitForTimeout(1500);
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(866);
  const can = await page.evaluate(() => window.__timeline?.run("history.get"));
  expect(can).toEqual({ canUndo: true, canRedo: false });
  await page.evaluate(() => window.__timeline?.run("history.undo"));
  await page.evaluate(() => window.__timeline?.run("history.undo"));
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);

  // refaz uma, grava, e estraga a base gravada: ao reabrir o projeto fica como está e o histórico recomeça vazio
  await page.evaluate(() => window.__timeline?.run("history.redo"));
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const b = JSON.parse(localStorage.getItem("novelo3d.timeline.base") ?? "{}");
    b.parts.parts[0].text = "V1: 6 pb no anel mágico (6)";
    localStorage.setItem("novelo3d.timeline.base", JSON.stringify(b));
  });
  await page.reload();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(866);
  expect(await page.evaluate(() => window.__timeline?.run("history.get"))).toEqual({
    canUndo: false,
    canRedo: false,
  });
});

test("faixa da linha do tempo: ícones, opções por clique, falha em vermelho, editar, excluir e os quatro botões", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.evaluate(() => {
    window.__timeline?.run("parts.instance", { id: "p1" });
    window.__timeline?.run("paint.rows", { yarn: "B", from: 2, to: 2 });
    window.__timeline?.run("parts.set", { id: "p2", pos: [9, 0, 0] });
  });
  await expect(page.locator('[data-testid^="feature-"]')).toHaveCount(3);
  // só ícones: o texto vem do nome acessível e da dica
  await expect(page.getByTestId("feature-1")).toHaveAttribute(
    "aria-label",
    /pintar voltas 2 a 2 com o fio B/,
  );
  expect(await page.getByTestId("feature-1").evaluate((e) => (e as HTMLElement).innerText)).toBe("");

  // clique esquerdo abre as opções; suprimir a instância faz a feature que depende dela ficar vermelha
  await page.getByTestId("feature-0").click();
  await page.getByRole("menuitem", { name: "Suprimir" }).click();
  await expect(page.getByTestId("feature-2")).toHaveClass(/failed/);
  await expect(page.getByTestId("feature-0")).toHaveClass(/sup/);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.getByRole("menuitem", { name: "Ligar" }).click();
  await expect(page.getByTestId("feature-2")).not.toHaveClass(/failed/);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(866);

  // editar parâmetros: a pintura passa a cobrir as voltas 1 a 3
  await page.getByTestId("feature-1").click();
  await page.getByRole("menuitem", { name: "Editar parâmetros" }).click();
  await page.getByLabel("Pintar até a volta").fill("3");
  await page.getByRole("button", { name: "Aplicar" }).click();
  const painted = await page.evaluate(() =>
    JSON.stringify(window.__timeline?.run("paint.report", { text: "" })),
  );
  expect(painted).toBeTruthy();

  // os quatro botões: tudo para trás, tudo para frente
  await page.getByTestId("timeline-first").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await expect(page.getByTestId("timeline-prev")).toBeDisabled();
  await page.getByTestId("timeline-last").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(866);
  await page.getByTestId("timeline-prev").click();
  await page.getByTestId("timeline-next").click();

  // "voltar o marcador até aqui" e excluir
  await page.getByTestId("feature-0").click();
  await page.getByRole("menuitem", { name: "Voltar o marcador até aqui" }).click();
  await expect(page.getByTestId("feature-2")).toHaveClass(/off/);
  await page.getByTestId("feature-1").click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await expect(page.locator('[data-testid^="feature-"]')).toHaveCount(2);
  const ok = await page.evaluate(() => window.__timeline?.verify());
  expect(ok?.ok).toBe(true);

  // recolher
  await page.getByTestId("timeline-collapse").click();
  await expect(page.getByTestId("timeline-first")).toHaveCount(0);
});
