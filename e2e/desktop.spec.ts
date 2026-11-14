// SPDX-License-Identifier: GPL-3.0-or-later
// Fumaça do Novelo3D.exe (D-70): a janela abre o studio compilado, mostra a bola de exemplo e guarda o projeto entre
// aberturas. Usa um perfil de dados isolado (o do usuário não é tocado). Pula se o exe não foi gerado (`npm run exe`).
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const exe = "apps/desktop/release/win-unpacked/Novelo3D.exe";

test.skip(!existsSync(exe), "Novelo3D.exe não foi gerado (npm run exe)");

test("o executável abre o studio, mostra a receita de exemplo e guarda o projeto ao fechar e reabrir", async () => {
  mkdirSync("test-results", { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), "novelo3d-exe-"));
  const launch = () => electron.launch({ executablePath: exe, args: [`--user-data-dir=${profile}`] });
  try {
    const first = await launch();
    const data = await first.evaluate(({ app }) => app.getPath("userData"));
    expect(data.toLowerCase()).toBe(profile.toLowerCase());
    const page = await first.firstWindow();
    await expect(page.getByText(/433 nós/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("ribbon-tab-vista")).toBeVisible();
    await page.screenshot({ path: "test-results/desktop-exe.png" });
    await page.evaluate(() => window.__timeline?.run("parts.instance", { id: "p1" }));
    await expect(page.getByText(/866 nós/)).toBeVisible();
    await page.waitForTimeout(1500); // a gravação automática tem atraso
    await first.close();

    const second = await launch();
    const again = await second.firstWindow();
    await expect(again.getByText(/866 nós/)).toBeVisible({ timeout: 30_000 });
    expect(await again.evaluate(() => window.__timeline?.run("history.get"))).toEqual({
      canUndo: true,
      canRedo: false,
    });
    await second.close();
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
});
