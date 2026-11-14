// SPDX-License-Identifier: GPL-3.0-or-later
// Fumaça do Novelo3D.exe (D-70): a janela abre o studio compilado e mostra a bola de exemplo. Pula se o exe não foi gerado
// (`npm run exe`). Tela branca por caminho errado de arquivo é a falha típica.
import { existsSync, mkdirSync } from "node:fs";
import { _electron as electron, expect, test } from "@playwright/test";

const exe = "apps/desktop/release/win-unpacked/Novelo3D.exe";

test.skip(!existsSync(exe), "Novelo3D.exe não foi gerado (npm run exe)");

test("o executável abre o studio e mostra a receita de exemplo em 3D", async () => {
  mkdirSync("test-results", { recursive: true });
  const app = await electron.launch({ executablePath: exe });
  try {
    const page = await app.firstWindow();
    await expect(page.getByText(/433 nós/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ribbon-tab-vista")).toBeVisible();
    await page.screenshot({ path: "test-results/desktop-exe.png" });
  } finally {
    await app.close();
  }
});
