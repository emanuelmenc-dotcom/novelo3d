// SPDX-License-Identifier: GPL-3.0-or-later
// Árvore do projeto (G4): comandos pela ponte MCP e o que a visibilidade faz no 3D e no modo de leitura.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { expectTimelineOk, goTree, ribbon, showTab } from "./ribbon.ts";

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

test("menu de contexto da árvore: clique direito e teclado chamam os mesmos comandos", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await showTab(page, "Árvore");
  await ribbon(page, "montagem");
  await page.getByRole("button", { name: "Instância" }).click();
  await expect(page.locator("[data-part]")).toHaveCount(2);
  await showTab(page, "Árvore");
  // clique direito na segunda peça: isola
  await page.locator("[data-part]").nth(1).locator("input[type=radio]").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Isolar" }).click();
  await expect.poll(() => count(page)).toBe(433);
  await expect(page.getByRole("button", { name: /^Mostrar Peça 1$/ })).toBeVisible();
  // pelo teclado: Shift+F10 na primeira peça abre o menu, Esc fecha
  await page.locator("[data-part]").first().locator("input[type=radio]").focus();
  await page.keyboard.press("Shift+F10");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar todas" }).click();
  await expect.poll(() => count(page)).toBe(866);
});

test("o MCP cria, move, esconde e apaga montagens; apagar exige confirmação", async ({ page }) => {
  await withBridge(page, async (call) => {
    await expect.poll(() => count(page)).toBe(433);
    await call("parts.instance", { id: "p1" });
    const made = await call("assembly.add", { name: "Grupo", parts: ["p2"] });
    expect(made.isError, made.text).toBe(false);
    expect(made.json.root.children.find((n: { id: string }) => n.id === "a1").children[0].id).toBe("p2");
    expect((await call("assembly.add", { parts: "p1" })).isError).toBe(true);
    const moved = await call("assembly.set", { id: "a1", pos: [10, 0, 0], rot: [0, 0, 90] });
    expect(moved.json.root.children[0].pos).toEqual([10, 0, 0]);
    expect((await call("assembly.set", { id: "a1", parent: "a1" })).isError).toBe(true);
    await call("assembly.setVisible", { id: "a1", visible: false });
    await expect.poll(() => count(page)).toBe(433);
    await call("assembly.setVisible", { id: "a1", visible: true });
    await expect.poll(() => count(page)).toBe(866);
    expect((await call("assembly.contents", { id: "a1" })).json.parts).toEqual(["p2"]);
    expect((await call("assembly.remove", { id: "a1" })).isError).toBe(true); // sem confirm
    const gone = await call("assembly.remove", { id: "a1", confirm: true });
    expect(gone.isError, gone.text).toBe(false);
    await expect.poll(() => count(page)).toBe(433);
  });
});

test("montagens na tela: nova montagem pelo ribbon, mover pelas propriedades, esconder e apagar com confirmação", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => count(page)).toBe(433);
  await ribbon(page, "montagem");
  await page.getByRole("button", { name: "Instância" }).click();
  await expect(page.locator("[data-part]")).toHaveCount(2);
  await showTab(page, "Árvore");
  // peça escolhida na árvore entra na montagem nova
  await page.getByLabel("Editar Peça 1 (instância)").check();
  await ribbon(page, "montagem");
  await page.getByTestId("tool-montagem.nova-montagem").click();
  await showTab(page, "Árvore");
  await expect(page.locator("[data-assembly]")).toHaveCount(1);
  await expect(page.locator("[data-assembly] + [data-part]")).toHaveCount(1); // a peça vem logo abaixo, dentro
  // menu de contexto na raiz: montagem vazia
  await page.getByTestId("tree-root").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Nova montagem vazia" }).click();
  await expect(page.locator("[data-assembly]")).toHaveCount(2);
  // propriedades da primeira montagem: posição própria
  await page.getByRole("button", { name: /^Montagem Montagem 1$/ }).click();
  await showTab(page, "Propriedades");
  await page.getByLabel("Posição X da montagem").fill("30");
  await expect(page.getByLabel("Posição X da montagem")).toHaveValue("30");
  // esconder pela árvore
  await showTab(page, "Árvore");
  await page.getByRole("button", { name: "Esconder montagem Montagem 1" }).click();
  await expect.poll(() => count(page)).toBe(433);
  await page.getByRole("button", { name: "Mostrar montagem Montagem 1" }).click();
  await expect.poll(() => count(page)).toBe(866);
  // apagar pelo menu, com confirmação: recusar mantém, aceitar leva a peça junto
  let accept = false;
  page.on("dialog", (d) => void (accept ? d.accept() : d.dismiss()));
  await page.getByRole("button", { name: /^Montagem Montagem 1$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /Remover montagem/ }).click();
  await expect(page.locator("[data-assembly]")).toHaveCount(2);
  accept = true;
  await page.getByRole("button", { name: /^Montagem Montagem 1$/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: /Remover montagem/ }).click();
  await expect(page.locator("[data-assembly]")).toHaveCount(1);
  await expect(page.locator("[data-part]")).toHaveCount(1);
  await expect.poll(() => count(page)).toBe(433);
});

test("o MCP anda a linha do tempo: lê, volta o marcador, suprime, edita, exclui e confere a reexecução", async ({
  page,
}) => {
  await withBridge(page, async (call) => {
    await expect.poll(() => count(page)).toBe(433);
    await call("parts.instance", { id: "p1" });
    await call("paint.rows", { yarn: "B", from: 2, to: 2 });
    const t = await call("timeline.get");
    expect(t.json.features.map((f: { method: string }) => f.method)).toEqual([
      "parts.instance",
      "paint.rows",
    ]);
    expect(t.json).toMatchObject({ marker: 2, canUndo: true, canRedo: false });
    const back = await call("timeline.rollTo", { index: 1 });
    expect(back.json.marker).toBe(1);
    await expect.poll(() => count(page)).toBe(866);
    expect((await call("timeline.rollTo", { index: 9 })).isError).toBe(true);
    const id = t.json.features[1].id;
    const edited = await call("timeline.edit", { id, params: { from: 1, to: 3 } });
    expect(edited.json.features[1].params).toMatchObject({ from: 1, to: 3 });
    const sup = await call("timeline.suppress", { id: t.json.features[0].id });
    expect(sup.json.features[0].suppressed).toBe(true);
    await expect.poll(() => count(page)).toBe(433);
    await call("timeline.suppress", { id: t.json.features[0].id });
    const ok = await call("timeline.verify");
    expect(ok.json).toMatchObject({ ok: true, diff: null });
    expect((await call("history.undo")).isError).toBe(false);
    const gone = await call("timeline.remove", { id });
    expect(gone.json.features.map((f: { method: string }) => f.method)).toEqual(["parts.instance"]);
    expect((await call("timeline.remove", { id: 9999 })).isError).toBe(true);
  });
});

test("arrastar uma peça para uma montagem e de volta para o Projeto (pergunta 15)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.evaluate(() => window.__timeline?.run("assembly.add", { name: "Grupo" }));
  await goTree(page);
  const asmOf = () =>
    page.evaluate(() => {
      const t = window.__timeline;
      if (!t) throw new Error("sem linha do tempo");
      const r = t.run("parts.get") as { parts: { id: string; assembly?: string }[] };
      return r.parts.find((q) => q.id === "p1")?.assembly ?? null;
    });
  await page.locator('[data-part="p1"]').dragTo(page.locator('[data-assembly="a1"]'));
  await expect.poll(asmOf).toBe("a1");
  await page.locator('[data-part="p1"]').dragTo(page.getByTestId("tree-root"));
  await expect.poll(asmOf).toBe(null);
  await expectTimelineOk(page);
});

test("linha do tempo edita a nova montagem (nome) e a posição dela (pergunta 18)", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.evaluate(() => {
    window.__timeline?.run("assembly.add", { name: "Grupo", parts: ["p1"] });
    window.__timeline?.run("assembly.set", { id: "a1", pos: [10, 0, 0] });
  });
  await page.getByTestId("feature-0").click();
  await page.getByRole("menuitem", { name: "Editar parâmetros" }).click();
  await page.getByLabel("Nome da montagem").fill("Corpo");
  await page.getByRole("button", { name: "Aplicar" }).click();
  await goTree(page);
  await expect(page.getByRole("button", { name: "Montagem Corpo", exact: true })).toBeVisible();
  await page.getByTestId("feature-1").click();
  await page.getByRole("menuitem", { name: "Editar parâmetros" }).click();
  await page.getByLabel("Posição (mm) X").fill("25");
  await page.getByRole("button", { name: "Aplicar" }).click();
  const pos = await page.evaluate(() => {
    const t = window.__timeline;
    if (!t) throw new Error("sem linha do tempo");
    return (t.run("project.export") as { parts: { assemblies: { pos: number[] }[] } }).parts.assemblies[0]
      ?.pos;
  });
  expect(pos).toEqual([25, 0, 0]);
  await expectTimelineOk(page);
});
