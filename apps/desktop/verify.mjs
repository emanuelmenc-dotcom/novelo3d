// SPDX-License-Identifier: GPL-3.0-or-later
// Roda a fumaça do exe recém-gerado (NOVELO_EXE=1 liga o teste; sem isso ele pula). Usado por `npm run exe`.
import { spawnSync } from "node:child_process";

const r = spawnSync("npx", ["playwright", "test", "e2e/desktop.spec.ts"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NOVELO_EXE: "1" },
});
process.exit(r.status ?? 1);
