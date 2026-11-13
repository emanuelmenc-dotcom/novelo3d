// SPDX-License-Identifier: GPL-3.0-or-later
// O trabalho não fica preso ao navegador: salvar e abrir projeto em arquivo, e aviso quando a gravação falha.
import { expect, test } from "@playwright/test";

const RECEITA = "V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)\nV3: (1 pb, 1 aum) x6 (18)";

test("salvar o projeto em arquivo e abrir de volta restaura a receita", async ({ page }) => {
  page.on("dialog", (d) => void d.accept());
  await page.goto("/");
  await page.getByLabel("Receita", { exact: true }).fill(RECEITA);
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("project-save").click(),
  ]);
  const file = await download.path();
  expect(download.suggestedFilename()).toBe("projeto.novelo3d.json");

  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)");
  await page.waitForTimeout(500);
  await page.getByTestId("project-open").setInputFiles(file);
  await expect(page.getByTestId("project-msg")).toContainText("Projeto aberto");
  await expect(page.getByLabel("Receita", { exact: true })).toHaveValue(RECEITA);
});

test("arquivo que não é projeto é recusado com mensagem, sem mexer na receita", async ({ page }) => {
  await page.goto("/");
  const antes = await page.getByLabel("Receita", { exact: true }).inputValue();
  await page.getByTestId("project-open").setInputFiles({
    name: "x.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"ola":1}'),
  });
  await expect(page.getByTestId("project-msg")).toContainText("Não consegui abrir");
  await expect(page.getByLabel("Receita", { exact: true })).toHaveValue(antes);
});

test("quando o navegador não guarda, a tela avisa", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("cheio");
    };
  });
  await page.goto("/");
  await page.getByLabel("Receita", { exact: true }).fill(RECEITA);
  await expect(page.getByTestId("save-warning")).toBeVisible();
});

test("recusar a troca de projeto na confirmação não mexe na receita", async ({ page }) => {
  page.on("dialog", (d) => void d.dismiss());
  await page.goto("/");
  await page.getByLabel("Receita", { exact: true }).fill(RECEITA);
  await page.waitForTimeout(500);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("project-save").click(),
  ]);
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)");
  await page.getByTestId("project-open").setInputFiles(await download.path());
  await expect(page.getByLabel("Receita", { exact: true })).toHaveValue("V1: 6 pb no anel mágico (6)");
});

test("o aviso continua enquanto uma chave falha, mesmo que as outras gravem", async ({ page }) => {
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "novelo3d.edit") throw new Error("cheio");
      return orig.call(this, k, v);
    };
  });
  await page.goto("/");
  await page.getByLabel("Receita", { exact: true }).fill(RECEITA);
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("save-warning")).toBeVisible();
});
