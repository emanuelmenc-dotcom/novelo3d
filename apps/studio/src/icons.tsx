// SPDX-License-Identifier: GPL-3.0-or-later
// Ícones próprios do app (linha fina, 24 x 24, cor do texto). Um conjunto pequeno e coerente, sem biblioteca de terceiros.
// Peça e montagem são os mesmos ícones da árvore e da linha do tempo.
import type { ReactNode } from "react";

const P: Record<string, ReactNode> = {
  save: <path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6" />,
  open: <path d="M3 19V6h6l2 2h8v3M3 19l3-8h16l-3 8z" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
    </>
  ),
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  print: <path d="M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z" />,
  copy: <path d="M9 9h11v11H9zM5 15V4h11" />,
  download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />,
  undo: <path d="M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 8" />,
  redo: <path d="M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 8" />,
  fit: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  grid: <path d="M4 4h16v16H4zM4 12h16M12 4v16" />,
  wire: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9" />,
  cube: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9" />,
  orbit: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12c3 3 13 3 16 0" />
    </>
  ),
  select: <path d="M5 4l6 16 2.5-6.5L20 11z" />,
  rect: <path d="M4 6h16v12H4z" strokeDasharray="3 2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" strokeDasharray="3 2" />,
  lasso: <path d="M12 5c-5 0-8 2-8 5s3 5 8 5 8-2 8-5-3-5-8-5zM12 15c0 3-2 4-4 5" />,
  point: <circle cx="12" cy="12" r="3" />,
  round: <ellipse cx="12" cy="12" rx="8" ry="3.5" />,
  column: <path d="M12 3v18M9 6l3-3 3 3" />,
  hood: (
    <>
      <circle cx="12" cy="12" r="2" />
      <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
    </>
  ),
  path: <path d="M4 18c4 0 4-12 8-12s4 12 8 12M4 18h.01M20 18h.01" />,
  brush: <path d="M5 19c3 0 3-3 5-3l8-10-3-2-8 11c0 2-2 2-2 4z" />,
  bucket: <path d="M5 11l6-6 8 8-6 6zM19 16c1 1.5 1 3-.5 3.5" />,
  dropper: <path d="M15 4l5 5-3 3-5-5zM12 9l-7 7v4h4l7-7" />,
  erase: <path d="M4 15l8-9 8 8-5 5H8zM9 20h11" />,
  tension: <path d="M3 12c3-6 6-6 9 0s6 6 9 0" />,
  eye: (
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  play: <path d="M7 5l12 7-12 7z" />,
  prev: <path d="M15 5l-8 7 8 7" />,
  next: <path d="M9 5l8 7-8 7" />,
  first: <path d="M6 5v14M18 5l-9 7 9 7" />,
  last: <path d="M18 5v14M6 5l9 7-9 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" />,
  mirror: <path d="M12 3v18M4 7l6 5-6 5zM20 7l-6 5 6 5z" />,
  instance: <path d="M4 8h10v10H4zM10 4h10v10" />,
  detach: <path d="M4 8h8v8H4zM14 4l6 6M20 4l-6 6" />,
  part: (
    <>
      <circle cx="12" cy="12" r="8" />
      <ellipse cx="12" cy="12" rx="8" ry="3" />
    </>
  ),
  assembly: <path d="M3 9h11v11H3zM10 4h11v11H10z" />,
  seam: <path d="M4 7l4 5-4 5M12 7l4 5-4 5M20 7v10" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16l5 5" />
    </>
  ),
  bridge: <path d="M3 17h18M5 17V9M19 17V9M5 9c3 5 11 5 14 0" />,
  alert: <path d="M12 4l9 16H3zM12 10v5M12 18h.01" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="M6 9l6 6 6-6" />,
  tutorial: <path d="M4 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H4zM20 5h-6" />,
  front: <path d="M5 5h14v14H5z" />,
  top: <path d="M5 8l7-4 7 4-7 4zM5 8v8l7 4 7-4V8" />,
  recipe: <path d="M6 4h12v16H6zM9 9h6M9 13h6M9 17h3" />,
  full: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  clear: <path d="M6 6l12 12M18 6L6 18" />,
  invert: <path d="M5 8h14l-3-3M19 16H5l3 3" />,
  all: <path d="M4 4h16v16H4zM8 8h8v8H8z" />,
};

export function Icon(props: { name: string; size?: number; title?: string }) {
  const { name, size = 20, title } = props;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "icon",
  };
  const body = P[name] ?? P.point;
  if (title) {
    return (
      <svg {...common} role="img">
        <title>{title}</title>
        {body}
      </svg>
    );
  }
  return (
    <svg {...common} aria-hidden="true">
      <title>{name}</title>
      {body}
    </svg>
  );
}
