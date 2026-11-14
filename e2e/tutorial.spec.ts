// SPDX-License-Identifier: GPL-3.0-or-later
// Modo de leitura (G2, docs/13 seção 8): ferramentas de edição escondidas, 3D com o passo atual, cadeias de pontos iguais,
// slides de revisão em cada marco, teclas grandes na faixa e o mesmo lugar ao sair ou recarregar.
import { mkdirSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";
import { ribbon, showTab } from "./ribbon.ts";

const PORT = 47905;

const state = (page: Page) => page.evaluate(() => window.__view3d?.state());
const text = (page: Page) => page.getByTestId("tutorial-text");

async function open(page: Page) {
  mkdirSync("test-results", { recursive: true });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("reading")).toBeVisible();
}

test("modo de leitura esconde as ferramentas e Esc devolve a mesma tela, com a mesma câmera", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  const tabsBefore = await page.getByRole("tablist", { name: "Abas da janela" }).first().allTextContents();
  const camBefore = await page.evaluate(() => window.__view3d?.cameraState().position);
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("reading")).toBeVisible();
  // só o 3D e a faixa: nada de ribbon, janelas nem barra de opções
  await expect(page.getByRole("tablist", { name: "Abas do ribbon" })).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Abas da janela" })).toHaveCount(0);
  await expect(page.getByTestId("options-bar")).toHaveCount(0);
  await expect(page.getByTestId("scene")).toBeVisible();
  await page.screenshot({ path: "test-results/leitura-passo.png" });
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reading")).toHaveCount(0);
  await expect(page.getByRole("tablist", { name: "Abas do ribbon" })).toBeVisible();
  expect(await page.getByRole("tablist", { name: "Abas da janela" }).first().allTextContents()).toEqual(
    tabsBefore,
  );
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  const camAfter = await page.evaluate(() => window.__view3d?.cameraState().position);
  expect(camAfter?.map((v) => Math.round(v))).toEqual(camBefore?.map((v) => Math.round(v)));
});

test("passo = cadeia de pontos iguais: 6 pb, depois a revisão e o estado do marco, depois 6 aum", async ({
  page,
}) => {
  await open(page);
  await expect(text(page)).toContainText("Volta 1 · cadeia 1 de 1");
  await expect(text(page)).toContainText("6 pb");
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 1 de 129");
  await expect.poll(async () => (await state(page))?.tutorial.current.length).toBe(6);
  await page.keyboard.press("Space");
  await expect(text(page)).toContainText("Revisão · marco 1 de 12");
  await expect(text(page)).toContainText("Volta 1 concluída");
  await expect.poll(async () => (await state(page))?.tutorial.current.length).toBe(6);
  await page.screenshot({ path: "test-results/leitura-revisao.png" });
  await page.keyboard.press("Space");
  await expect(text(page)).toContainText("Estado atual · marco 1 de 12");
  await expect.poll(async () => (await state(page))?.tutorial.current.length).toBe(0);
  await page.screenshot({ path: "test-results/leitura-estado.png" });
  await page.keyboard.press("ArrowRight");
  await expect(text(page)).toContainText("Volta 2 · cadeia 1 de 1");
  await expect(text(page)).toContainText("6 aum");
  await expect(page.getByTestId("tutorial-alerts")).toContainText("Fim da volta 2");
});

test("a volta inteira aparece com os blocos dobrados e cada repetição é um passo", async ({ page }) => {
  await open(page);
  await page.getByTestId("tutorial-round").selectOption("3");
  await expect(text(page)).toContainText("(1 pb, 1 aum) x6");
  await expect(text(page)).toContainText("repetição 1 de 6");
  await expect(page.getByTestId("tutorial-alerts")).toContainText("Começa a volta 3");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(text(page)).toContainText("cadeia 3 de 12");
  await expect(text(page)).toContainText("repetição 2 de 6");
});

test("teclas: volta, marco, pontas, revisão e vistas", async ({ page }) => {
  await open(page);
  await page.keyboard.press("ArrowUp"); // próxima volta
  await expect(text(page)).toContainText("Volta 2 ·");
  await page.keyboard.press("ArrowUp");
  await expect(text(page)).toContainText("Volta 3 ·");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown"); // no meio da volta, volta ao começo dela
  await expect(text(page)).toContainText("Volta 3 · cadeia 1 de");
  await page.keyboard.press("ArrowDown"); // já no começo: vai à anterior
  await expect(text(page)).toContainText("Volta 2 ·");
  await page.keyboard.press("PageUp"); // próximo marco
  await expect(text(page)).toContainText("Volta 3 · cadeia 1 de");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("PageDown"); // no meio do marco, volta ao começo dele
  await expect(text(page)).toContainText("Volta 3 · cadeia 1 de");
  await page.keyboard.press("PageDown"); // marco anterior
  await expect(text(page)).toContainText("Volta 2 ·");
  await page.keyboard.press("r");
  await expect(text(page)).toContainText("Revisão · marco 2 de 12");
  await page.keyboard.press("r");
  await expect(text(page)).toContainText("Estado atual · marco 2 de 12");
  await page.keyboard.press("End");
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 129 de 129");
  await page.keyboard.press("Home");
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 1 de 129");
  await page.keyboard.press("Backspace"); // no começo não passa
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 1 de 129");
  await page.keyboard.press("2");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().viewDir[2])).toBeGreaterThan(0.9);
  await page.keyboard.press("f");
  const pos = await page.evaluate(() => window.__view3d?.cameraState().position ?? [0, 0, 0]);
  expect(pos.every((v) => Number.isFinite(v))).toBe(true);
});

test("Espaço não aciona o botão que está com o foco", async ({ page }) => {
  await open(page);
  await page.getByTestId("tutorial-prev").focus(); // desabilitado no começo
  await page.getByTestId("tutorial-next").focus();
  await page.keyboard.press("Space");
  await expect(page.getByTestId("tutorial-progress")).toContainText("Passo 2 de 129");
});

test("as teclas aparecem na faixa, da mais usada à menos usada", async ({ page }) => {
  await open(page);
  const keys = page.getByRole("list", { name: "Teclas do modo de leitura" });
  await expect(keys.getByRole("listitem").first()).toContainText("próximo");
  await expect(keys.getByRole("listitem").nth(1)).toContainText("voltar");
  await expect(keys).toContainText("Pg Up");
  await expect(keys).toContainText("Esc");
});

test("F9 entra e sai do modo de leitura", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("F9");
  await expect(page.getByTestId("reading")).toBeVisible();
  await page.keyboard.press("F9");
  await expect(page.getByTestId("reading")).toHaveCount(0);
});

test("recarregar a página volta ao mesmo passo quando se entra de novo", async ({ page }) => {
  await open(page);
  await page.getByTestId("tutorial-round").selectOption("4");
  await page.keyboard.press("ArrowRight");
  await expect(text(page)).toContainText("Volta 4 · cadeia 2 de");
  await page.waitForTimeout(500);
  await page.reload();
  await expect(page.getByTestId("reading")).toHaveCount(0); // o modo de leitura não fica ligado sozinho
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(text(page)).toContainText("Volta 4 · cadeia 2 de");
});

test("receita que não fecha avisa; receita acima do limite mostra a mensagem e o app continua", async ({
  page,
}) => {
  await page.goto("/");
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2: 6 aum (13)");
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("tutorial-count-warning")).toBeVisible();
  await page.keyboard.press("Escape");
  await showTab(page, "Receita");
  await page.getByLabel("Receita", { exact: true }).fill("V1: 6 pb no anel mágico (6)\nV2-40: aum @each");
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("tutorial-error")).toContainText("passa de");
  await page.keyboard.press("Escape");
  await showTab(page, "Receita");
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible();
});

test("#marco na receita vira marco com o texto escrito e aparece no slide de revisão", async ({ page }) => {
  await page.goto("/");
  await showTab(page, "Receita");
  await page
    .getByLabel("Receita", { exact: true })
    .fill("V1: 6 pb no anel mágico (6)\nV2: 6 aum (12)\n#marco Fechar o corpo\nV3: (1 pb, 1 aum) x6 (18)");
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await page.getByTestId("tutorial-round").selectOption("2");
  await page.getByTestId("reading-review").click();
  await expect(text(page)).toContainText("Fechar o corpo");
  await expect(text(page)).toContainText("Volta 2: o que foi feito");
});

test("numa montagem com peça espelhada o destaque cai nos pontos da peça ativa", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.getByRole("tab", { name: "Árvore", exact: true }).click();
  await ribbon(page, "montagem");
  await page.getByTestId("tool-montagem.mirror-x").click();
  await expect(page.locator("[data-part]")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count)).toBe(866);
  await page.getByLabel("Editar Peça 1 (espelhada)").check();
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(text(page)).toContainText("Volta 1 · cadeia 1 de 1");
  // a peça espelhada vem depois da original: seus pontos têm índices acima dos 433 da primeira
  await expect.poll(async () => ((await state(page))?.tutorial.current[0] ?? 0) > 433).toBe(true);
});

test('"Ver ponto" funciona nos polos da peça (voltas 1 e 17)', async ({ page }) => {
  await open(page);
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/leitura-polo-volta1.png" });
  await page.getByTestId("tutorial-round").selectOption("17");
  await page.getByTestId("tutorial-show").click();
  await page.screenshot({ path: "test-results/leitura-polo-volta17.png" });
  const pos = await page.evaluate(() => window.__view3d?.cameraState().position ?? [0, 0, 0]);
  expect(pos.every((v) => Number.isFinite(v))).toBe(true);
});

test("no modo de leitura nada edita: o mesmo arrasto que pinta na edição não pinta na leitura", async ({
  page,
}) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await page.getByRole("tab", { name: "Propriedades", exact: true }).click();
  await ribbon(page, "selecionar");
  await page.getByTestId("mode-yarn").click();
  await ribbon(page, "pintar");
  await page.getByTestId("brush-brush").click();
  await page.getByLabel("Fio da pintura").selectOption("B");
  const edited = async () =>
    Number((await page.getByTestId("points-info").textContent())?.match(/(\d+) pontos editados/)?.[1] ?? 0);
  // arrasta o pincel por um trecho da peça que está à vista (a vista de cima não muda entre os dois modos)
  const drag = async () => {
    const box = await page.getByTestId("scene").locator("canvas").boundingBox();
    const p = await page.evaluate(() => {
      const xy = window.__view3d?.projectAll() ?? [];
      return { x: xy[306 * 2] ?? 0, y: xy[306 * 2 + 1] ?? 0 };
    });
    if (!box) throw new Error("sem 3D");
    await page.mouse.move(box.x + p.x, box.y + p.y);
    await page.mouse.down();
    await page.mouse.move(box.x + p.x + 40, box.y + p.y, { steps: 8 });
    await page.mouse.up();
  };
  expect(await edited()).toBe(0);
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("reading")).toBeVisible();
  await drag();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reading")).toHaveCount(0);
  expect(await edited()).toBe(0);
  // controle positivo: o mesmo arrasto, fora do modo de leitura, pinta
  await drag();
  await expect.poll(edited).toBeGreaterThan(3);
});

test("no modo de leitura a barra de título só tem os avisos: sem busca de comandos e sem menu Janelas", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByTestId("command-search")).toHaveCount(0);
  await expect(page.getByTestId("windows-menu")).toHaveCount(0);
  await expect(page.getByTestId("bridge-state")).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(page.getByTestId("command-palette")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("command-palette")).toHaveCount(0); // também não aparece ao sair
});

test("depois de escolher a volta no seletor as teclas continuam andando o passo", async ({ page }) => {
  await open(page);
  const select = page.getByTestId("tutorial-round");
  await select.focus();
  await select.selectOption("4");
  await page.keyboard.press("Space");
  await expect(text(page)).toContainText("Volta 4 · cadeia 2 de");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("reading")).toHaveCount(0);
});

test("layout salvo com a antiga janela Tutorial (ativa, sozinha numa folha, desligada e em layout nomeado) abre sem erro", async ({
  page,
}) => {
  const leaf = (id: string, tabs: string[], active = 0) => ({
    type: "leaf",
    id,
    tabs,
    active,
    collapsed: false,
  });
  const layout = {
    root: {
      type: "split",
      id: "s1",
      dir: "row",
      sizes: [0.3, 0.7],
      children: [
        leaf("l1", ["recipe", "tutorial"], 1),
        {
          type: "split",
          id: "s2",
          dir: "column",
          sizes: [0.8, 0.2],
          children: [leaf("l2", ["view3d"]), leaf("l3", ["tutorial"])],
        },
      ],
    },
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(
    (w) => {
      if (!localStorage.getItem("novelo3d.workspace")) {
        localStorage.setItem("novelo3d.workspace", JSON.stringify(w));
        localStorage.setItem("novelo3d.ui", JSON.stringify({ version: 2 }));
      }
    },
    { layout, presetId: null, customs: [{ id: "c1", name: "Meu", layout }], off: ["tutorial"] },
  );
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBe(433);
  await expect(page.getByRole("tab", { name: "Tutorial", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Receita", { exact: true })).toBeVisible(); // a aba ativa que sobrou aparece
  await page.getByTestId("windows-menu").click();
  await expect(page.getByTestId("window-tutorial")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await ribbon(page, "tutorial");
  await page.getByTestId("reading-start").click();
  await expect(page.getByTestId("reading")).toBeVisible();
  expect(errors).toEqual([]);
});

test("o MCP anda o modo de leitura pelos mesmos comandos tutorial.* e o projeto leva a posição", async ({
  page,
}) => {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(PORT) } as Record<string, string>,
    }),
  );
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
    const out = (r.content as { text: string }[])[0]?.text ?? "";
    return { isError: r.isError === true, text: out, json: r.isError ? null : JSON.parse(out) };
  };
  try {
    await page.goto(`/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    await showTab(page, "Receita");
    const recipe = await page.getByLabel("Receita", { exact: true }).inputValue();
    const on = await call("tutorial.reading", { on: true });
    expect(on.json).toEqual({ reading: true });
    await expect(page.getByTestId("reading")).toBeVisible();
    const r = await call("tutorial.goto", { text: recipe, round: 2 });
    expect(r.isError, r.text).toBe(false);
    expect(r.json.step.round).toBe(2);
    await expect(text(page)).toContainText("Volta 2 · cadeia 1 de 1");
    expect((await call("tutorial.nextRound", { text: recipe })).json.step.round).toBe(3);
    expect((await call("tutorial.prevRound", { text: recipe })).json.step.round).toBe(2);
    await call("tutorial.nextRound", { text: recipe });
    expect((await call("tutorial.nextMilestone", { text: recipe })).json.step.milestone).toBe(3);
    expect((await call("tutorial.prevMilestone", { text: recipe })).json.step.milestone).toBe(2);
    expect((await call("tutorial.slide", { text: recipe, kind: "review" })).json.step.kind).toBe("review");
    expect((await call("tutorial.last", { text: recipe })).json.index).toBe(128);
    expect((await call("tutorial.first", { text: recipe })).json.index).toBe(0);
    expect((await call("tutorial.goto", { text: recipe, round: 99 })).isError).toBe(true);
    const sl = await call("tutorial.script", { text: recipe, from: 0, count: 3 });
    expect(sl.json.steps.length).toBe(3);
    await call("tutorial.goto", { text: recipe, round: 2 });
    const proj = await call("project.export");
    expect(proj.isError, proj.text).toBe(false);
    expect(proj.json.app).toBe("novelo3d");
    expect(proj.json.tutorial.p1.index).toBe(3);
    expect((await call("tutorial.reading", { on: false })).json).toEqual({ reading: false });
    await expect(page.getByTestId("reading")).toHaveCount(0);
  } finally {
    await client.close();
  }
});
