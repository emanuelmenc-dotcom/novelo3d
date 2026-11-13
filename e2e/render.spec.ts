// SPDX-License-Identifier: GPL-3.0-or-later
// Aceite do R3b: janela Render com Play, Pausar, Parar e PNG.
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, type Page, test } from "@playwright/test";

// Render pausado (D-57): para retomar, ligue `render` em packages/commands/src/features.ts (e na página, ver docs/15) e remova esta linha.
test.skip(true, "janela Render pausada (D-57)");

const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true });
const status = (page: Page) => page.getByTestId("render-status");

async function open(page: Page) {
  await page.goto("/");
  await tab(page, "3D").click();
  await expect.poll(() => page.evaluate(() => window.__view3d?.state().count ?? 0)).toBeGreaterThan(0);
  await tab(page, "Render").click();
  await page.getByLabel("Resolução do render").selectOption("720p");
  await page.getByLabel("Amostras de suavização").fill("2");
}

test("play renderiza até concluir e a imagem tem conteúdo", async ({ page }) => {
  await open(page);
  await page.getByTestId("render-play").click();
  await expect(status(page)).toContainText("concluído", { timeout: 60_000 });
  const cov = await page.evaluate(() => window.__render?.coverage() ?? 0);
  expect(cov).toBeGreaterThan(0.05);
});

test("pausar congela o progresso e parar mantém a imagem parcial", async ({ page }) => {
  await open(page);
  await page.getByLabel("Qualidade do render").selectOption("2");
  await page.getByLabel("Amostras de suavização").fill("64");
  await page.getByLabel("Resolução do render").selectOption("4K");
  await page.getByTestId("render-play").click();
  await page.getByTestId("render-pause").click();
  await expect(status(page)).toContainText("pausado");
  const a = await status(page).innerText();
  await page.waitForTimeout(600);
  expect(await status(page).innerText()).toBe(a);
  await page.getByTestId("render-stop").click();
  await expect(status(page)).toContainText("parado");
});

test("salvar PNG baixa uma imagem com a resolução pedida", async ({ page }) => {
  await open(page);
  await page.getByTestId("render-play").click();
  await expect(status(page)).toContainText("concluído", { timeout: 60_000 });
  const dl = page.waitForEvent("download");
  await page.getByTestId("render-png").click();
  const file = await dl.then((d) => d.path());
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString()).toBe("PNG");
  expect(buf.readUInt32BE(16)).toBe(1280);
  expect(buf.readUInt32BE(20)).toBe(720);
});

test("trocar de aba durante o render não perde nem duplica o trabalho", async ({ page }) => {
  await open(page);
  await page.getByLabel("Amostras de suavização").fill("24");
  await page.getByTestId("render-play").click();
  await tab(page, "3D").click();
  await page.waitForTimeout(500);
  await tab(page, "Render").click();
  await expect(status(page)).toContainText("concluído", { timeout: 60_000 });
  expect(await page.evaluate(() => window.__render?.stats().samples)).toBe(24);
  expect(await page.evaluate(() => window.__render?.coverage() ?? 0)).toBeGreaterThan(0.05);
});

test("parar e dar Play de novo faz uma rodada nova completa", async ({ page }) => {
  await open(page);
  await page.getByLabel("Amostras de suavização").fill("64");
  await page.getByTestId("render-play").click();
  await page.getByTestId("render-stop").click();
  await expect(status(page)).toContainText("parado");
  await page.getByLabel("Amostras de suavização").fill("2");
  await page.getByTestId("render-play").click();
  await expect(status(page)).toContainText("concluído", { timeout: 60_000 });
  expect(await page.evaluate(() => window.__render?.stats().samples)).toBe(2);
});

test("fundo transparente deixa o canto da imagem com alfa 0", async ({ page }) => {
  await open(page);
  await page.getByLabel("Tipo de fundo").selectOption("transparent");
  await page.getByTestId("render-play").click();
  await expect(status(page)).toContainText("concluído", { timeout: 60_000 });
  expect(await page.evaluate(() => window.__render?.alphaAtCorner())).toBe(0);
  expect(await page.evaluate(() => window.__render?.coverage() ?? 0)).toBeGreaterThan(0.05);
});

test("salvar PNG sem imagem avisa em vez de baixar um arquivo em branco", async ({ page }) => {
  await page.goto("/");
  await tab(page, "Render").click();
  await page.getByTestId("render-png").click();
  await expect(page.getByTestId("render-message")).toContainText("aperte Play");
});

const PORT = 47898;

type Info = {
  scope: string;
  selected: number;
  context: number;
  drawn: number;
  relax: { residualBefore: number; residualAfter: number; iterations: number } | null;
} | null;

test("R3c: render só da seleção pela ponte MCP (contagens, contexto, relaxamento, erro e regressão)", async ({
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
  try {
    await page.goto(`/?bridge=${PORT}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      const text = (r.content as { text: string }[])[0]?.text ?? "";
      return { isError: r.isError === true, text, json: r.isError ? null : JSON.parse(text) };
    };
    const text = await page.getByLabel("Receita", { exact: true }).inputValue();
    const finish = async (): Promise<{ state: string; error: string | null; info: Info }> => {
      let last = { state: "", error: null as string | null, info: null as Info };
      await expect
        .poll(
          async () => {
            last = (await call("render.status")).json;
            return ["done", "error", "stale", "stopped"].includes(last.state);
          },
          { timeout: 60_000 },
        )
        .toBe(true);
      return last;
    };
    await call("render.set", { width: 640, height: 360, samples: 1 });

    // 108 pontos (voltas 7 a 9), contexto 1: desenha a seleção mais os vizinhos, menos que a peça toda
    await call("selection.select", { text, by: { kind: "group", from: 7, to: 9 } });
    await call("render.set", { scope: "selection", context: 1, relaxIterations: 20 });
    await call("render.start");
    const a = await finish();
    expect(a.state).toBe("done");
    expect(a.info?.selected).toBe(108);
    expect(a.info?.drawn).toBe(108 + (a.info?.context ?? 0));
    expect(a.info?.context).toBeGreaterThan(0);
    expect(a.info?.drawn).toBeLessThan(433);
    expect(a.info?.relax).not.toBeNull();
    expect(a.info?.relax?.residualAfter).toBeLessThanOrEqual(a.info?.relax?.residualBefore ?? 0);
    expect(await page.evaluate(() => window.__render?.coverage() ?? 0)).toBeGreaterThan(0.02);

    // sem contexto: só a seleção
    await call("render.set", { context: 0 });
    await call("render.start");
    const b = await finish();
    expect(b.info?.drawn).toBe(108);

    // sem relaxamento: sem estatística de ajuste
    await call("render.set", { context: 1, relaxIterations: 0 });
    await call("render.start");
    expect((await finish()).info?.relax).toBeNull();

    // seleção vazia: erro claro
    await call("selection.clear");
    await call("render.start");
    const e = await finish();
    expect(e.state).toBe("error");
    expect(e.error).toMatch(/selecione pontos/);

    // alcance "Tudo" continua desenhando a peça inteira
    await call("render.set", { scope: "all" });
    await call("render.start");
    const all = await finish();
    expect(all.state).toBe("done");
    expect(all.info?.drawn).toBe(433);
  } finally {
    await client.close();
  }
});

test("R3c: editar a receita durante o render deixa a rodada obsoleta", async ({ page }) => {
  await open(page);
  await page.getByLabel("Amostras de suavização").fill("64");
  await page.getByLabel("Resolução do render").selectOption("4K");
  await page.getByTestId("render-play").click();
  await tab(page, "Receita").click();
  const box = page.getByLabel("Receita", { exact: true });
  const original = await box.inputValue();
  // tira a última linha da receita: a geometria muda durante o render
  await box.fill(original.split(/\r?\n/).slice(0, -1).join("\n"));
  await tab(page, "Render").click();
  await expect(status(page)).toContainText("obsoleto", { timeout: 30_000 });
});

test("R3c: grupo Alcance na interface (desabilitado em Tudo; Só a seleção mostra as contagens)", async ({
  page,
}) => {
  const port = 47896;
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(port) } as Record<string, string>,
    }),
  );
  try {
    await page.goto(`/?bridge=${port}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const text = await page.getByLabel("Receita", { exact: true }).inputValue();
    await client.callTool({
      name: "novelo_bridge_call",
      arguments: { method: "selection.select", params: { text, by: { kind: "group", from: 7, to: 9 } } },
    });
    await tab(page, "3D").click();
    await tab(page, "Render").click();
    await page.getByLabel("Resolução do render").selectOption("720p");
    await page.getByLabel("Amostras de suavização").fill("1");
    await expect(page.getByLabel("Vizinhos de contexto")).toBeDisabled();
    await expect(page.getByLabel("Relaxamento (iterações)")).toBeDisabled();
    await expect(page.getByLabel("Enquadrar a seleção")).toBeDisabled();
    await page.getByLabel("Alcance do render").selectOption("selection");
    await expect(page.getByLabel("Vizinhos de contexto")).toBeEnabled();
    await page.getByTestId("render-play").click();
    await expect(status(page)).toContainText("concluído", { timeout: 60_000 });
    await expect(page.getByTestId("render-info")).toContainText("108 selecionados");
  } finally {
    await client.close();
  }
});

test("R3d-2': a forma do ponto de base muda a malha e é relatada em info", async ({ page }) => {
  const port = 47895;
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(port) } as Record<string, string>,
    }),
  );
  try {
    await page.goto(`/?bridge=${port}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      return JSON.parse((r.content as { text: string }[])[0]?.text ?? "null");
    };
    const run = async () => {
      await call("render.start");
      await expect.poll(async () => (await call("render.status")).state, { timeout: 60_000 }).toBe("done");
      return (await call("render.status")).info as { shaped: number; geomChecksum: number; drawn: number };
    };
    await call("render.set", { width: 480, height: 270, samples: 1, scope: "all", baseShape: true });
    const on = await run();
    expect(on.shaped).toBeGreaterThan(0);
    expect(on.drawn).toBe(433);
    await call("render.set", { baseShape: false });
    const off = await run();
    expect(off.shaped).toBe(0);
    expect(off.geomChecksum).not.toBe(on.geomChecksum);
    // determinismo: ligar de novo dá o mesmo checksum
    await call("render.set", { baseShape: true });
    expect((await run()).geomChecksum).toBe(on.geomChecksum);
  } finally {
    await client.close();
  }
});

test("R3d-3: modo completo = rápido, pausa/continua, parar e replay, reaproveitamento de blocos", async ({
  page,
}) => {
  const port = 47893;
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(port) } as Record<string, string>,
    }),
  );
  try {
    await page.goto(`/?bridge=${port}`);
    await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
    const call = async (method: string, params: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
      return JSON.parse((r.content as { text: string }[])[0]?.text ?? "null");
    };
    type Info = { geomChecksum: number; chunks: { rebuilt: number; reused: number }; drawn: number };
    const status = async () => (await call("render.status")) as { state: string; info: Info };
    const finish = async (): Promise<Info> => {
      await expect.poll(async () => (await status()).state, { timeout: 90_000 }).toBe("done");
      return (await status()).info;
    };
    const text = await page.getByLabel("Receita", { exact: true }).inputValue();
    await call("render.set", { width: 480, height: 270, samples: 1, scope: "all", baseShape: true, pace: 0 });

    // rápido: tudo refeito; guarda o checksum
    await call("render.set", { mode: "fast" });
    await call("render.start");
    const fast = await finish();
    expect(fast.chunks.rebuilt).toBeGreaterThan(0);

    // só a luz muda: nada é refeito
    await call("render.set", { light: { azimuth: 90 } });
    await call("render.start");
    const light = await finish();
    expect(light.chunks.rebuilt).toBe(0);
    expect(light.chunks.reused).toBeGreaterThan(0);
    expect(light.geomChecksum).toBe(fast.geomChecksum);

    // completo: geometria final igual à do rápido
    await call("render.set", { mode: "full" });
    await call("render.start");
    const full = await finish();
    expect(full.geomChecksum).toBe(fast.geomChecksum);

    // pausar e continuar no modo completo dá o mesmo resultado
    await call("render.start");
    await call("render.pause");
    await expect.poll(async () => (await status()).state).toBe("paused");
    await call("render.resume");
    expect((await finish()).geomChecksum).toBe(fast.geomChecksum);

    // parar no meio e dar Play de novo: conclui, com blocos reaproveitados
    await call("render.start");
    await call("render.stop");
    await expect.poll(async () => (await status()).state).toBe("stopped");
    await call("render.start");
    const again = await finish();
    expect(again.geomChecksum).toBe(fast.geomChecksum);

    // tensão alterada em uma volta: só essa vizinhança é refeita (algo é refeito, e nem tudo)
    await call("selection.select", { text, by: { kind: "group", from: 9 } });
    await call("points.set", { text, prop: "tension", value: -1 });
    await call("render.set", { mode: "fast" });
    await call("render.start");
    const tension = await finish();
    expect(tension.chunks.rebuilt).toBeGreaterThan(0);
    expect(tension.geomChecksum).not.toBe(fast.geomChecksum);
  } finally {
    await client.close();
  }
});

/** Abre a ponte MCP e devolve `call`; o chamador fecha o cliente. */
async function bridge(page: Page, port: number) {
  const client = new Client({ name: "e2e", version: "0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: ["tools/mcp-server/src/server.mjs"],
      env: { ...process.env, NOVELO_BRIDGE_PORT: String(port) } as Record<string, string>,
    }),
  );
  await page.goto(`/?bridge=${port}`);
  await expect(page.getByTestId("bridge-state")).toContainText("conectada", { timeout: 15_000 });
  const call = async (method: string, params: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name: "novelo_bridge_call", arguments: { method, params } });
    return JSON.parse((r.content as { text: string }[])[0]?.text ?? "null");
  };
  return { client, call };
}

test("R3d: ponto a ponto no ritmo pedido pausa a meio, congela, salva PNG parcial e conclui igual ao rápido", async ({
  page,
}) => {
  const { client, call } = await bridge(page, 47891);
  try {
    type St = { state: string; done: number; total: number; info: { geomChecksum: number } };
    const status = async (): Promise<St> => call("render.status");
    await call("render.set", { width: 480, height: 270, samples: 1, scope: "all", pace: 0, mode: "fast" });
    await call("render.start");
    await expect.poll(async () => (await status()).state, { timeout: 60_000 }).toBe("done");
    const want = (await status()).info.geomChecksum;

    await call("render.set", { mode: "full", pace: 400 });
    await call("render.start");
    await expect
      .poll(async () => {
        const s = await status();
        return s.total > 0 ? s.done / s.total : 0;
      })
      .toBeGreaterThan(0.1);
    await call("render.pause");
    await expect.poll(async () => (await status()).state).toBe("paused");
    const a = await status();
    expect(a.done / a.total).toBeLessThan(0.95);
    await page.waitForTimeout(600);
    expect((await status()).done).toBe(a.done);

    // parar com a imagem parcial: salvar PNG tem de funcionar
    await call("render.stop");
    await expect.poll(async () => (await status()).state).toBe("stopped");
    await call("render.savePng");
    await expect.poll(() => page.evaluate(() => window.__render?.lastPng()?.bytes ?? 0)).toBeGreaterThan(500);

    // novo Play (mesmo ritmo, mas pausa e continua) termina com a mesma geometria do rápido
    await call("render.set", { pace: 0 });
    await call("render.start");
    await expect.poll(async () => (await status()).state, { timeout: 60_000 }).toBe("done");
    expect((await status()).info.geomChecksum).toBe(want);
  } finally {
    await client.close();
  }
});

test("R3d: mudar só a cor do fio reaproveita todos os blocos e a imagem muda", async ({ page }) => {
  const { client, call } = await bridge(page, 47890);
  try {
    type St = { state: string; info: { chunks: { rebuilt: number; reused: number }; geomChecksum: number } };
    const run = async (): Promise<St> => {
      await call("render.start");
      await expect.poll(async () => (await call("render.status")).state, { timeout: 60_000 }).toBe("done");
      return call("render.status");
    };
    await call("render.set", {
      width: 480,
      height: 270,
      samples: 1,
      scope: "all",
      pace: 0,
      mode: "fast",
      ao: 0,
    });
    await call("yarns.set", { yarns: [{ id: "A", name: "a", colorHex: "#5d6b3a" }] });
    const first = await run();
    expect(first.info.chunks.rebuilt).toBeGreaterThan(0);
    const lumaBefore = await page.evaluate(() => window.__render?.meanLuma() ?? 0);
    await call("yarns.set", { yarns: [{ id: "A", name: "a", colorHex: "#d6c24a" }] });
    const second = await run();
    expect(second.info.chunks.rebuilt).toBe(0);
    expect(second.info.chunks.reused).toBeGreaterThan(0);
    expect(second.info.geomChecksum).toBe(first.info.geomChecksum);
    const lumaAfter = await page.evaluate(() => window.__render?.meanLuma() ?? 0);
    expect(Math.abs(lumaAfter - lumaBefore)).toBeGreaterThan(5);
  } finally {
    await client.close();
  }
});

test("R3d-4: o AO muda a luz, não muda a geometria e mantém o fundo transparente", async ({ page }) => {
  const { client, call } = await bridge(page, 47889);
  try {
    type St = { state: string; info: { geomChecksum: number } };
    const run = async (): Promise<St> => {
      await call("render.start");
      await expect.poll(async () => (await call("render.status")).state, { timeout: 90_000 }).toBe("done");
      return call("render.status");
    };
    await call("render.set", {
      width: 640,
      height: 360,
      samples: 12,
      scope: "all",
      pace: 0,
      mode: "fast",
      shadows: true,
      background: { kind: "transparent" },
    });
    await call("render.set", { ao: 0 });
    const off = await run();
    const spreadOff = await page.evaluate(() => window.__render?.lumaSpread() ?? 0);
    await call("render.set", { ao: 1 });
    const on = await run();
    const spreadOn = await page.evaluate(() => window.__render?.lumaSpread() ?? 0);
    expect(on.info.geomChecksum).toBe(off.info.geomChecksum);
    // o AO escurece as frestas e mantém as faces expostas: o contraste (desvio da luminância) aumenta
    expect(spreadOn).toBeGreaterThan(spreadOff);
    expect(await page.evaluate(() => window.__render?.alphaAtCorner())).toBe(0);
  } finally {
    await client.close();
  }
});

test("H2: o modelo do fio relaxado muda a malha, é validado e volta ao anterior", async ({ page }) => {
  const { client, call } = await bridge(page, 47878);
  try {
    type St = { state: string; info: { geomChecksum: number; drawn: number } };
    const run = async (): Promise<St> => {
      await call("render.start");
      await expect.poll(async () => (await call("render.status")).state, { timeout: 120_000 }).toBe("done");
      return call("render.status");
    };
    await call("render.set", {
      width: 480,
      height: 270,
      samples: 1,
      scope: "all",
      pace: 0,
      mode: "fast",
      ao: 0,
    });
    const simple = await run();
    await call("render.set", { yarnModel: "relaxed" });
    const relaxed = await run();
    expect(relaxed.info.drawn).toBe(simple.info.drawn);
    expect(relaxed.info.geomChecksum).not.toBe(simple.info.geomChecksum);
    expect(await page.evaluate(() => window.__render?.meanLuma() ?? 0)).toBeGreaterThan(5);
    // outro raio refaz os blocos
    await call("render.set", { yarnRho: 0.08 });
    expect((await run()).info.geomChecksum).not.toBe(relaxed.info.geomChecksum);
    await call("render.set", { yarnModel: "simple" });
    expect((await run()).info.geomChecksum).toBe(simple.info.geomChecksum);
    await expect(call("render.set", { yarnModel: "xyz" })).rejects.toThrow();
    await expect(call("render.set", { yarnRho: 0.3 })).rejects.toThrow();
  } finally {
    await client.close();
  }
});
