// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P3.5 (2ª rodada): padrão de fios e costura nas configurações, lista de materiais flutuante com troca de fio
// em todo o projeto, e fechar a montagem.
import { mkdirSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";
import { closePalette, goProps, goTree, openPalette, openViewMenu, ribbon } from "./ribbon.ts";

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const N = 433;

test("padrão dos fios novos vem das configurações e a lista de materiais troca B por C", async ({ page }) => {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");

  // Configurações > Fios e costura: listras, lã, espessura Aran
  await ribbon(page, "arquivo");
  await page.getByRole("button", { name: "Configurações" }).click();
  await page.getByRole("tab", { name: "Fios e costura" }).click();
  await page.getByLabel("Tipo de cor padrão").selectOption("stripes");
  await page.getByLabel("Material padrão").selectOption("la");
  await page.getByLabel("Espessura padrão").selectOption("uk-aran");
  await page.getByLabel("Cor do fio de costura").fill("#00aa00");
  await page.getByLabel("Ponto de costura padrão").selectOption("whip");
  await page.getByRole("button", { name: "Fechar configurações" }).click();

  // fio novo nasce no padrão, com outra cor
  await openPalette(page);
  await page.getByRole("button", { name: "Adicionar fio" }).click();
  await page.getByRole("button", { name: "Editar fio C" }).click();
  await expect(page.getByLabel("Tipo de cor do fio C")).toHaveValue("stripes");
  await expect(page.getByLabel("Material do fio C")).toHaveValue("la");
  await expect(page.getByTestId("thickness-info-C")).toContainText("180 m/100 g");
  await expect(page.getByLabel("Cor 1 do fio C", { exact: true })).not.toHaveValue("#5d6b3a");

  // pinta voltas 7 a 9 com o fio B
  await page.getByLabel("Pintar de volta").fill("7");
  await page.getByLabel("Pintar até a volta").fill("9");
  await page.getByLabel("Pincel do fio B").check();
  await page.getByRole("button", { name: "Pintar voltas" }).click();
  await expect(page.locator('[data-paint="0"]')).toContainText("fio B");

  await closePalette(page);
  // janela flutuante: selecionar B, trocar por C e remover B
  await ribbon(page, "arquivo");
  await page.getByRole("button", { name: "Lista de materiais" }).click();
  const win = page.getByTestId("materials-window");
  await expect(win).toBeVisible();
  await expect(win.locator('[data-material="B"]')).toContainText("108");
  await win.getByLabel("Selecionar fio B").check();
  await win.getByLabel("Trocar pelo fio").selectOption("C");
  await page.screenshot({ path: "test-results/materiais-janela.png" });
  await win.getByTestId("material-replace").click();
  await expect(win.getByTestId("material-info")).toContainText("trocado por C");
  await expect(win.locator('[data-material="B"]')).toHaveCount(0);
  await expect(win.locator('[data-material="C"]')).toContainText("108");

  // a janela edita qualquer propriedade: nome e material do fio C
  await win.getByLabel("Selecionar fio C").check();
  await win.getByLabel("Nome do fio C na lista").fill("lã listrada");
  await win.getByLabel("Material do fio C").selectOption("algodao");
  await expect(win.getByLabel("Material do fio C")).toHaveValue("algodao");

  // pode ser arrastada e fechada
  const before = await win.boundingBox();
  const hb = await win.locator("header").boundingBox();
  if (!before || !hb) throw new Error("sem janela");
  await page.mouse.move(hb.x + 40, hb.y + 10);
  await page.mouse.down();
  await page.mouse.move(hb.x + 140, hb.y + 70, { steps: 4 });
  await page.mouse.up();
  const after = await win.boundingBox();
  expect((after?.x ?? 0) - before.x).toBeGreaterThan(50);
  await win.getByRole("button", { name: "Fechar Lista de materiais" }).click();
  await expect(win).toHaveCount(0);

  // a pintura trocada aparece no painel Fios e persiste
  await page.reload();
  await openPalette(page);
  await expect(page.locator('[data-paint="0"]')).toContainText("fio C");
});

test("fechar a montagem leva as bordas costuradas a se encontrarem", async ({ page }) => {
  await page.goto("/");
  await goTree(page);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(N);
  await ribbon(page, "montagem");
  await page.getByTestId("tool-montagem.mirror-x").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(2 * N);
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Ajustar" }).click();

  const canvas = page.getByTestId("scene").locator("canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("sem canvas");
  const pick = async (base: number) =>
    page.evaluate(
      ([b, n]) => {
        const v = window.__view3d;
        if (!v) throw new Error("sem 3D");
        const xy = v.projectAll();
        let cx = 0;
        let cy = 0;
        for (let i = b as number; i < (b as number) + (n as number); i++) {
          cx += xy[i * 2] as number;
          cy += xy[i * 2 + 1] as number;
        }
        cx /= n as number;
        cy /= n as number;
        let best = (b as number) + 163;
        let bd = Number.POSITIVE_INFINITY;
        for (let i = (b as number) + 163; i <= (b as number) + 306; i++) {
          const d = Math.hypot((xy[i * 2] as number) - cx, (xy[i * 2 + 1] as number) - cy);
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        return { x: xy[best * 2] as number, y: xy[best * 2 + 1] as number };
      },
      [base, N],
    );
  await goTree(page);
  await page.getByLabel("Editar Peça 1", { exact: true }).check();
  await tab(page, "Pontos").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-select").click();
  await ribbon(page, "selecionar");
  await page.getByTestId("sel-group").click();
  const a = await pick(0);
  await page.mouse.click(box.x + a.x, box.y + a.y);
  await goProps(page, "root");
  await page.getByTestId("seam-side-a").click();
  await tab(page, "Pontos").click();
  const b = await pick(N);
  await page.mouse.click(box.x + b.x, box.y + b.y);
  await goProps(page, "root");
  await page.getByTestId("seam-side-b").click();
  await page.getByTestId("seam-create").click();
  await goTree(page);
  await expect(page.locator("[data-seam]")).toHaveCount(1);

  // afasta a peça espelhada (ativa) e fecha: a folga cai a ~0
  await goProps(page, "part");
  await page.getByLabel("Posição X da peça").fill("40");
  await goProps(page, "root");
  await page.getByTestId("assembly-close").click();
  await expect(page.getByTestId("assembly-close-result")).toContainText("folga média 0");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().seamSegments)).toBe(36);
  await openViewMenu(page);
  await page.getByRole("menuitem", { name: "Ajustar" }).click();
  await page.screenshot({ path: "test-results/montagem-fechada.png" });

  // desfazer o fechamento devolve a posição
  await goProps(page, "root");
  await page.getByTestId("assembly-undo-close").click();
  await goProps(page, "part");
  await expect(page.getByLabel("Posição X da peça")).toHaveValue("40");
});
