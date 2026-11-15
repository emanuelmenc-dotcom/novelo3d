// SPDX-License-Identifier: GPL-3.0-or-later
// `npm run galinha`: roda os testes privados da galinha (receita comprada do usuário, fora do git) em toda revisão.
// Sem os arquivos privados (clone limpo), avisa e sai sem erro.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("packages/commands/test/galinha.local.ts")) {
  console.log("galinha: arquivos privados ausentes (receita do usuário); nada a rodar.");
  process.exit(0);
}
const env = { ...process.env, GALINHA: "1" };
const run = (cmd) => spawnSync(cmd, { stdio: "inherit", shell: true, env }).status ?? 1;
const unit = run(
  "npx vitest run packages/commands/test/galinha.local.test.ts packages/commands/test/galinha-forma.local.test.ts",
);
const e2e = unit === 0 ? run("npx playwright test e2e/galinha.local.spec.ts") : 1;
process.exit(unit || e2e);
