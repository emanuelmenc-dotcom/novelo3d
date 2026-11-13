// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do P1: colar receita -> tabela de verificação -> gráfico -> texto CP; PDF A4; operável via MCP (D-21).
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "@playwright/test";

const PORT = 47898;

test("P1: fluxo completo na tela única e comandos via MCP", async ({ page }) => {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) } as Record<string, string>,
    }),
  );
  try {
    await page.goto(`/?bridge=${PORT}`);

    // 1. receita de exemplo fecha: 17 voltas, 432 pontos
    await expect(page.getByTestId("verify-summary")).toContainText("Receita fecha");
    await expect(page.getByTestId("verify-summary")).toContainText("432 pontos");
    await expect(page.getByTestId("verify-table").locator("tbody tr")).toHaveCount(12);

    // 2. gráfico circular em SVG e texto CrochetPARADE
    await expect(page.getByTestId("chart").locator("svg")).toBeVisible();
    await expect(page.getByRole("button", { name: "voltas 13–17" })).toBeVisible();
    await expect(page.getByLabel("Texto CrochetPARADE", { exact: true })).toHaveValue(
      /^ring\nsc6inc\n6sc2inc\n6\*\[sc,sc2inc\]/,
    );

    // 3. total declarado errado é apanhado
    const receita = page.getByLabel("Receita", { exact: true });
    const original = await receita.inputValue();
    await receita.fill(original.replace("(18)", "(19)"));
    await expect(page.getByTestId("verify-summary")).toContainText("Receita com problemas");
    await expect(page.getByTestId("verify-table")).toContainText("Total declarado errado");

    // 4. dc sem dialeto é ambíguo; escolher o dialeto resolve
    await receita.fill("Rnd 1: 6 dc in magic ring (6)");
    await expect(page.getByText("mudam de significado entre US e UK")).toBeVisible();
    await page.getByLabel("Dialeto").selectOption("en-UK");
    await expect(page.getByText("mudam de significado entre US e UK")).toHaveCount(0);

    // 5. PDF A4 com as duas páginas do gráfico
    await receita.fill(original);
    await page.getByLabel("Dialeto").selectOption("auto");
    await expect(page.getByTestId("verify-summary")).toContainText("Receita fecha");
    await page.emulateMedia({ media: "print" });
    mkdirSync("test-results", { recursive: true });
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(2);
    await page.screenshot({ path: "test-results/p1-impressao.png", fullPage: true });
    await page.emulateMedia({ media: "screen" });

    // 6. as mesmas funções pelo MCP (autonomia de teste)
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown>) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      const text = (r.content as { text: string }[])[0]?.text ?? "";
      return { isError: r.isError === true, json: r.isError ? null : JSON.parse(text) };
    };
    const v = await call("pattern.verify", { text: original });
    expect(v.json).toMatchObject({ ok: true, totalCounted: 432 });
    const c = await call("chart.render", { text: original });
    expect(c.json.pages).toHaveLength(2);
    expect(c.json.pages.every((p: { overlaps: number }) => p.overlaps === 0)).toBe(true);
    const cp = await call("pattern.toCp", { text: original });
    expect(cp.json.text.split("\n")[0]).toBe("ring");
    const bad = await call("nao.existe", {});
    expect(bad.isError).toBe(true);
  } finally {
    await client.close();
  }
});

test("XVA: escolher o dialeto XVA na tela e a receita de letras fecha (detecção automática também)", async ({
  page,
}) => {
  await page.goto("/");
  const receita = page.getByLabel("Receita", { exact: true });
  await receita.fill(
    ["R0: MR", "R1: 6X", "R2: 6V", "R3: 6 (X, V)", "R4: 18X", "R5: 6 (X, A)", "R6: 6A"].join("\n"),
  );
  await page.getByLabel("Dialeto").selectOption("xva");
  await expect(page.getByTestId("verify-summary")).toContainText("Receita fecha");
  await page.getByLabel("Dialeto").selectOption("auto");
  await expect(page.getByTestId("verify-summary")).toContainText("Receita fecha");
});
