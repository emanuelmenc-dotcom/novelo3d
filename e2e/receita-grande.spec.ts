// SPDX-License-Identifier: GPL-3.0-or-later
// Receita gigante (D-58): acima do limite o app mostra um aviso legível e continua abrindo; receita grande e válida
// só recalcula quando a digitação para, e mostra o resultado da receita nova, não o da antiga.
import { expect, test } from "@playwright/test";

const bola = (voltas: number): string => {
  const rows = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)"];
  for (let i = 3; i <= voltas; i++) rows.push(`V${i}: (${i - 2} pb, 1 aum) x6 (${6 * i})`);
  return rows.join("\n");
};

test("receita que dobra a cada volta vira aviso, não tela em branco, e o app reabre", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));
  await page.goto("/");
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2-40: aum @each");
  await page.waitForTimeout(1500);
  for (const aba of ["3D", "Pontos", "Fios"]) await page.getByRole("tab", { name: aba, exact: true }).click();
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
  await expect(page.getByText(/passa de .* pontos/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
  expect(erros).toEqual([]);
});

test("receita grande: acrescentar uma volta mostra o total da receita nova", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  const receita = page.getByLabel("Receita", { exact: true });
  await receita.fill(bola(45)); // cerca de 6 mil pontos
  await expect(page.getByText(/Receita fecha · 6210 pontos/)).toBeVisible({ timeout: 60_000 });
  await receita.fill(`${bola(45)}\nV46: 270 pb (270)`);
  await expect(page.getByText(/Receita fecha · 6480 pontos/)).toBeVisible({ timeout: 60_000 });
});
