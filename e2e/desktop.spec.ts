// SPDX-License-Identifier: GPL-3.0-or-later
// Fumaça do Novelo3D.exe (D-70): a janela abre o studio compilado, mostra a bola de exemplo e guarda o projeto entre
// aberturas, e uma segunda abertura é recusada. Usa um perfil de dados isolado (o do usuário não é tocado). Só roda com
// NOVELO_EXE=1, que `npm run exe` define logo depois do build: assim nunca testa um exe velho.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const exe = "apps/desktop/release/win-unpacked/Novelo3D.exe";

test.skip(process.env.NOVELO_EXE !== "1" || !existsSync(exe), "só com `npm run exe` (NOVELO_EXE=1)");

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
    // uma segunda abertura com o mesmo perfil sai logo, sem abrir janela
    const second = spawn(exe, [`--user-data-dir=${profile}`], { stdio: "ignore" });
    const code = await new Promise((r) => second.once("exit", r).once("error", () => r("erro")));
    expect(code).toBe(0);
    // ir para outro endereço (o que acontece ao soltar um arquivo na janela) é bloqueado: o app continua na tela
    const url = page.url();
    await page.evaluate(() => {
      location.href = "file:///C:/";
    });
    await page.waitForTimeout(1000);
    expect(page.url()).toBe(url);
    // (o Playwright fica esperando a navegação bloqueada terminar, então confere o texto direto na página)
    expect(await page.evaluate(() => document.body.innerText.includes("866 nós"))).toBe(true);
    await page.waitForTimeout(1500); // a gravação automática tem atraso
    await first.close();

    const reopened = await launch();
    const again = await reopened.firstWindow();
    await expect(again.getByText(/866 nós/)).toBeVisible({ timeout: 30_000 });
    expect(await again.evaluate(() => window.__timeline?.run("history.get"))).toEqual({
      canUndo: true,
      canRedo: false,
    });
    await reopened.close();
  } finally {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    } catch {
      // shortcut: no Windows o Electron às vezes segura o perfil por mais alguns segundos; sobra só a pasta temporária
    }
  }
});
