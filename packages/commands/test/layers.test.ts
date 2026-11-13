// SPDX-License-Identifier: GPL-3.0-or-later
// Dependência entre pacotes só para baixo (docs/05-arquitetura.md).
import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const allowed: Record<string, string[]> = {
  core: [],
  notation: ["core"],
  charts: ["core"],
  layout: ["core"],
  stitch3d: ["core"],
  interop: ["core", "notation"],
  commands: ["core", "notation", "charts", "interop", "layout", "stitch3d"],
  studio: ["commands", "stitch3d"],
};
const base = new URL("../../../", import.meta.url);

for (const [pkg, ok] of Object.entries(allowed)) {
  test(`${pkg} só depende de ${ok.join(", ") || "nada"}`, () => {
    const dir = pkg === "studio" ? `apps/${pkg}` : `packages/${pkg}`;
    const json = JSON.parse(readFileSync(new URL(`${dir}/package.json`, base), "utf8"));
    const internal: string[] = Object.keys(json.dependencies ?? {})
      .filter((d) => d.startsWith("@novelo/"))
      .map((d) => d.slice(8));
    for (const d of internal) expect(ok).toContain(d);
  });
}
