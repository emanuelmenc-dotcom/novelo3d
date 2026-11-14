// SPDX-License-Identifier: GPL-3.0-or-later
// Busca de comandos (Ctrl+K): acha qualquer ferramenta do ribbon pelo nome e a executa. Lê as mesmas abas do ribbon.
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons.tsx";
import { flatTools, type RibbonTab } from "./Ribbon.tsx";

const norm = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function CommandPalette(props: { tabs: RibbonTab[]; onClose: () => void }) {
  const { tabs, onClose } = props;
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const all = useMemo(() => flatTools(tabs), [tabs]);
  const hits = useMemo(() => {
    const n = norm(q.trim());
    if (n === "") return all.slice(0, 12);
    // o nome da ferramenta vem antes de quem só combina pela aba, pelo grupo ou pela dica
    const byName = all.filter((t) => norm(t.item.label).includes(n));
    const others = all.filter(
      (t) => !byName.includes(t) && norm(`${t.tab} ${t.group} ${t.item.title ?? ""}`).includes(n),
    );
    return [...byName, ...others].slice(0, 12);
  }, [all, q]);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const go = (i: number) => {
    const t = hits[i];
    if (!t || t.item.disabled) return;
    onClose();
    t.item.run();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: fundo do diálogo: clicar fora fecha
    <div className="overlay" data-testid="command-palette" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Buscar comando"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(hits.length - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            go(sel);
          }
        }}
      >
        <div className="palette-input">
          <Icon name="search" size={16} />
          <input
            ref={input}
            aria-label="Buscar comando"
            placeholder="Digite o nome da ferramenta…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
          />
        </div>
        <ul aria-label="Comandos encontrados">
          {hits.map((t, i) => (
            <li key={t.item.id} aria-current={i === sel ? "true" : undefined}>
              <button
                type="button"
                className={i === sel ? "on" : ""}
                disabled={t.item.disabled}
                onMouseEnter={() => setSel(i)}
                onClick={() => go(i)}
              >
                <Icon name={t.item.icon} size={16} />
                <span>{t.item.label}</span>
                <small>
                  {t.tab} › {t.group}
                </small>
              </button>
            </li>
          ))}
          {hits.length === 0 && <li className="hint">Nenhum comando com esse nome.</li>}
        </ul>
      </div>
    </div>
  );
}
