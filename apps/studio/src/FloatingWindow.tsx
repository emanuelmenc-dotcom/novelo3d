// SPDX-License-Identifier: GPL-3.0-or-later
// Janela secundária flutuante: arrastável pela barra de título, redimensionável, sobre o espaço de trabalho.
import { type ReactNode, useRef, useState } from "react";

export function FloatingWindow(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  testId?: string;
}) {
  const [pos, setPos] = useState({ x: 120, y: 90 });
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  return (
    <section
      className="float-win"
      role="dialog"
      aria-label={props.title}
      data-testid={props.testId ?? "float-window"}
      style={{ left: pos.x, top: pos.y }}
    >
      <header
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPos({ x: Math.max(0, e.clientX - d.dx), y: Math.max(0, e.clientY - d.dy) });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        <strong>{props.title}</strong>
        <button type="button" aria-label={`Fechar ${props.title}`} onClick={props.onClose}>
          ×
        </button>
      </header>
      <div className="float-body">{props.children}</div>
    </section>
  );
}
