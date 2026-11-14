// SPDX-License-Identifier: GPL-3.0-or-later
// Auxiliar dos testes de navegador: as ferramentas moram nas abas do ribbon, então antes de usar uma é preciso abrir a aba.
import type { Page } from "@playwright/test";

export type RibbonTabId =
  | "arquivo"
  | "receita"
  | "selecionar"
  | "pintar"
  | "montagem"
  | "tutorial"
  | "vista"
  | "historico";

/** Abre uma aba do ribbon e espera o painel dela aparecer. */
export async function ribbon(page: Page, id: RibbonTabId): Promise<void> {
  const tab = page.getByTestId(`ribbon-tab-${id}`);
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
  await page.locator("#ribbon-panel").waitFor();
}

/** Abre o menu de vista ao lado do cubo e devolve a si mesmo (fecha com Escape). */
export async function openViewMenu(page: Page): Promise<void> {
  const btn = page.getByTestId("view-menu");
  if ((await btn.getAttribute("aria-expanded")) !== "true") await btn.click();
}

/** Mostra uma janela que mora numa aba da coluna da esquerda (Receita, Verificação de contagem, Gráfico circular...). */
export async function showTab(page: Page, name: string): Promise<void> {
  const tab = page.getByRole("tab", { name, exact: true });
  if ((await tab.getAttribute("aria-selected")) !== "true") await tab.click();
}

/** O layout padrão agora é "Edição (3D grande)"; alguns testes precisam do clássico de 3 colunas. */
export async function classicLayout(page: Page): Promise<void> {
  await page.getByTestId("windows-menu").click();
  await page.getByRole("menuitemradio", { name: /Clássico/ }).click();
}

/** Árvore do projeto (peças e costuras). */
export const goTree = (page: Page) => showTab(page, "Árvore");

/** Propriedades de uma peça (a ativa) ou do projeto (`root`: nova costura e fechar montagem). */
export async function goProps(page: Page, what: "part" | "root" = "part"): Promise<void> {
  await goTree(page);
  if (what === "root") await page.getByTestId("tree-root").click();
  else await page.locator("[data-part].on input[type=radio]").click(); // escolhe a peça ativa na árvore
  await showTab(page, "Propriedades");
}

/** Abre a janela flutuante da paleta de fios (ribbon Pintar), se ainda não estiver aberta. */
export async function openPalette(page: Page): Promise<void> {
  if (await page.getByTestId("yarns-window").count()) return;
  await ribbon(page, "pintar");
  await page.getByTestId("palette-open").click();
  await page.getByTestId("yarns-window").waitFor();
}

/** Fecha a janela da paleta (ela flutua sobre a tela e cobre outros controles). */
export async function closePalette(page: Page): Promise<void> {
  if (await page.getByTestId("yarns-window").count())
    await page.getByRole("button", { name: "Fechar Paleta de fios" }).click();
}

/** A linha do tempo reexecutada dá o mesmo projeto que a tela mostra (G6): chamar no fim dos testes de uso real. */
export async function expectTimelineOk(page: Page): Promise<void> {
  const r = await page.evaluate(() => window.__timeline?.verify());
  if (!r?.ok) throw new Error(`a reexecução da linha do tempo difere em ${r?.diff ?? "?"}`);
}

/** STL ASCII de uma esfera (anéis de latitude), para testar a peça vinda de malha. */
export function sphereStl(R: number, rings = 32, seg = 48): string {
  const p = (i: number, j: number): number[] => {
    const phi = (Math.PI * i) / rings;
    const th = (2 * Math.PI * j) / seg;
    return i === 0 || i === rings
      ? [0, 0, -R * Math.cos(phi)]
      : [R * Math.sin(phi) * Math.cos(th), R * Math.sin(phi) * Math.sin(th), -R * Math.cos(phi)];
  };
  const tri = (a: number[], b: number[], c: number[]) =>
    `facet normal 0 0 0\nouter loop\nvertex ${a.join(" ")}\nvertex ${b.join(" ")}\nvertex ${c.join(" ")}\nendloop\nendfacet`;
  const out = ["solid bola"];
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < seg; j++) {
      const k = (j + 1) % seg;
      if (i > 0) out.push(tri(p(i, j), p(i, k), p(i + 1, k)));
      if (i < rings - 1) out.push(tri(p(i, j), p(i + 1, k), p(i + 1, j)));
    }
  out.push("endsolid bola");
  return out.join("\n");
}
