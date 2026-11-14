// SPDX-License-Identifier: GPL-3.0-or-later
// Ribbon: abas por tarefa, cada uma com grupos de ferramentas. Também é o registro de ferramentas do app: a busca de
// comandos (Ctrl+K) lê as mesmas abas. A ordem das abas e dos botões segue a ordem de uso, da esquerda para a direita.
import type { ReactNode } from "react";
import { Icon } from "./icons.tsx";

export type RibbonItem =
  | {
      kind: "button";
      id: string;
      label: string;
      icon: string;
      run: () => void;
      pressed?: boolean;
      disabled?: boolean;
      title?: string;
      testid?: string;
    }
  | { kind: "custom"; id: string; label: string; node: ReactNode };

export interface RibbonGroup {
  id: string;
  label: string;
  items: RibbonItem[];
}

export interface RibbonTab {
  id: string;
  label: string;
  groups: RibbonGroup[];
}

/** Ferramentas em lista plana (para a busca de comandos): só botões, que são os que executam algo. */
export function flatTools(
  tabs: RibbonTab[],
): { tab: string; group: string; item: RibbonItem & { kind: "button" } }[] {
  const out: { tab: string; group: string; item: RibbonItem & { kind: "button" } }[] = [];
  for (const t of tabs)
    for (const g of t.groups)
      for (const item of g.items)
        if (item.kind === "button") out.push({ tab: t.label, group: g.label, item });
  return out;
}

export function Ribbon(props: {
  tabs: RibbonTab[];
  active: string;
  onTab: (id: string) => void;
  collapsed: boolean;
  onCollapse: (v: boolean) => void;
}) {
  const { tabs, active, onTab, collapsed, onCollapse } = props;
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="ribbon" data-testid="ribbon">
      <div className="ribbon-tabs" role="tablist" aria-label="Abas do ribbon">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-label={`Aba ${t.label} do ribbon`}
            id={`ribbon-tab-${t.id}`}
            aria-selected={t.id === current?.id}
            aria-controls="ribbon-panel"
            data-testid={`ribbon-tab-${t.id}`}
            className={t.id === current?.id ? "on" : ""}
            onClick={() => {
              onTab(t.id);
              if (collapsed) onCollapse(false);
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="ribbon-collapse"
          data-testid="ribbon-collapse"
          aria-pressed={collapsed}
          title={collapsed ? "Mostrar o ribbon" : "Recolher o ribbon (mais área para o 3D)"}
          onClick={() => onCollapse(!collapsed)}
        >
          <Icon name="chevron" size={14} />
        </button>
      </div>
      {!collapsed && current && (
        <div
          className="ribbon-body"
          id="ribbon-panel"
          role="toolbar"
          aria-label={`Ferramentas da aba ${current.label}`}
        >
          {current.groups.map((g) => (
            <div className="ribbon-group" key={g.id}>
              <div className="ribbon-items">
                {g.items.map((it) =>
                  it.kind === "button" ? (
                    <button
                      key={it.id}
                      type="button"
                      className={`rb${it.pressed ? " on" : ""}`}
                      aria-pressed={it.pressed === undefined ? undefined : it.pressed}
                      disabled={it.disabled}
                      title={it.title ?? it.label}
                      data-testid={it.testid ?? `tool-${it.id}`}
                      onClick={it.run}
                    >
                      <Icon name={it.icon} size={22} />
                      <span>{it.label}</span>
                    </button>
                  ) : (
                    <div key={it.id} className="rc">
                      {it.node}
                    </div>
                  ),
                )}
              </div>
              <div className="ribbon-group-label">{g.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
