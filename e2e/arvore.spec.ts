// SPDX-License-Identifier: GPL-3.0-or-later
// Árvore do projeto (G4): comandos pela ponte MCP e o que a visibilidade faz no 3D e no modo de leitura.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { ribbon } from "./ribbon.ts";

const PORT = 47925;
const count = (page: Page) => page.evaluate(() => window.__view3d?.state().count ?? 0);

async function withBridge(page: Page, run: (call: Call) => Promise<void>) {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) } as Record<string, string>,
    }),
  );
  const call: Call = async (method, params = {}) => {
    const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
    const out = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: r.isError === true, text: out, json: r.isError ? null : JSON.parse(out) };
  };
  try {
    await page.goto(`/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    await run(call);
  } finally {
    await client.close();
  }
}
type Call = (
  method: string,
  params?: Record<string, unknown>,
) => Promise<{ isError: boolean; text: string; json: ReturnType<typeof JSON.parse> }>;

test("o MCP lê a árvore, seleciona e esconde, isola e mostra peças; o 3D acompanha", async ({ page }) => {
  await withBridge(page, async (call) => {
    await expect.poll(() => count(page)).toBe(433);
    const added = await call("parts.instance", { id: "p1" });
    expect(added.isError, added.text).toBe(false);
    await expect.poll(() => count(page)).toBe(866);
    const t = await call("tree.get");
    expect(t.json.root.kind).toBe("assembly");
    expect(t.json.root.children.map((n: { kind: string }) => n.kind)).toEqual(["part", "instance"]);

    const sel = await call("tree.select", { id: "p2" });
    expect(sel.json).toMatchObject({ selected: "p2", active: "p2" });
    expect((await call("tree.select", { id: "zzz" })).isError).toBe(true);

    const hid = await call("parts.setVisible", { id: "p2", visible: false });
    expect(hid.json.parts[1].hidden).toBe(true);
    await expect.poll(() => count(page)).toBe(433); // a peça escondida sai do 3D
    expect((await call("parts.setVisible", { id: "p2", visible: "sim" })).isError).toBe(true);

    expect((await call("parts.showAll")).json.parts.every((p: { hidden: boolean }) => !p.hidden)).toBe(true);
    await expect.poll(() => count(page)).toBe(866);
    const iso = await call("parts.isolate", { id: "p2" });
    expect(iso.json.parts.map((p: { hidden: boolean }) => p.hidden)).toEqual([true, false]);
    await expect.poll(() => count(page)).toBe(433);
    expect((await call("parts.isolate", { id: "zzz" })).isError).toBe(true);
  });
});

test("modo de leitura com a peça ativa escondida não destaca pontos da peça seguinte", async ({ page }) => {
  await withBridge(page, async (call) => {
    await expect.poll(() => count(page)).toBe(433);
    await call("parts.instance", { id: "p1" });
    await expect.poll(() => count(page)).toBe(866);
    await call("parts.setActive", { id: "p1" });
    await call("parts.setVisible", { id: "p1", visible: false });
    await expect.poll(() => count(page)).toBe(433);
    await ribbon(page, "tutorial");
    await page.getByTestId("reading-start").click();
    await expect(page.getByTestId("reading")).toBeVisible();
    await expect
      .poll(async () => (await page.evaluate(() => window.__view3d?.state()))?.tutorial.current.length)
      .toBe(0);
  });
});

test("projeto de uma peça só: esconder a peça esvazia o 3D e mostrar a traz de volta", async ({ page }) => {
  await withBridge(page, async (call) => {
    await expect.poll(() => count(page)).toBe(433);
    await call("parts.setVisible", { id: "p1", visible: false });
    await expect.poll(() => count(page)).toBe(0);
    await call("parts.showAll");
    await expect.poll(() => count(page)).toBe(433);
  });
});
