// SPDX-License-Identifier: GPL-3.0-or-later
// Casca do Novelo3D para Windows (D-70): abre o studio já compilado (web/) numa janela. Sem menu, para o Electron não
// disputar Ctrl+Z, Ctrl+R e Ctrl+W com os atalhos do próprio app.
const { app, BrowserWindow, Menu } = require("electron");
const path = require("node:path");

// Uma janela só: duas disputariam o mesmo armazenamento e a última a gravar apagaria o projeto da outra.
let win = null;
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  win = new BrowserWindow({ width: 1400, height: 900, title: "Novelo3D", backgroundColor: "#f4f1e8" });
  win.loadFile(path.join(__dirname, "web", "index.html"));
  win.on("page-title-updated", (e) => e.preventDefault());
  // soltar um arquivo fora das áreas do app levaria a janela até ele, sem menu nem botão para voltar
  win.webContents.on("will-navigate", (e) => e.preventDefault());
});
app.on("window-all-closed", () => app.quit());
