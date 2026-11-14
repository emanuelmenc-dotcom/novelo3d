// SPDX-License-Identifier: GPL-3.0-or-later
// Barra de título: nome do projeto, busca de comandos (Ctrl+K), estado da ponte MCP, alerta de gravação e o menu Janelas.
// O texto completo dos avisos fica para leitores de tela e para a dica ao passar o mouse; na tela só aparecem os ícones.
import { Icon } from "./icons.tsx";
import { WindowsMenu } from "./WindowsMenu.tsx";

export function TitleBar(props: {
  bridge: "off" | "connected";
  saveBad: boolean;
  /** Modo de leitura: sem busca de comandos nem menu Janelas, só os avisos. */
  reading?: boolean;
  projectMsg: string | null;
  onSearch: () => void;
}) {
  const { bridge, saveBad, reading, projectMsg, onSearch } = props;
  const bridgeText = `ponte MCP: ${bridge === "connected" ? "conectada" : "desconectada"}`;
  return (
    <header className="titlebar">
      <strong className="title-name">Novelo3D</strong>
      {!reading && (
        <button type="button" className="title-search" data-testid="command-search" onClick={onSearch}>
          <Icon name="search" size={14} /> Buscar comando… <kbd>Ctrl+K</kbd>
        </button>
      )}
      <span className="title-spacer" />
      {projectMsg && (
        <span className="title-msg" data-testid="project-msg" title={projectMsg}>
          {projectMsg}
        </span>
      )}
      {saveBad && (
        <span
          role="alert"
          data-testid="save-warning"
          className="title-alert"
          title="Gravação no navegador falhou"
        >
          <Icon name="alert" size={16} />
          <span className="sr">Não foi possível guardar no navegador: use "Salvar projeto".</span>
        </span>
      )}
      <span data-testid="bridge-state" className={`title-bridge ${bridge}`} title={bridgeText}>
        <Icon name="bridge" size={16} />
        <span className="sr">{bridgeText}</span>
      </span>
      {!reading && <WindowsMenu />}
    </header>
  );
}
