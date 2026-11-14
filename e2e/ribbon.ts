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
