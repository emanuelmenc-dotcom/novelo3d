// SPDX-License-Identifier: GPL-3.0-or-later
// Nova peça por forma (P5b): escolhe a forma (esfera, ovo, cone, copo, composta ou perfil livre), ajusta as medidas em mm,
// vê as voltas e o total ao vivo numa prévia em perspectiva e cria a peça (`parts.fromShape`). Aberta pela linha do tempo,
// a mesma janela muda a forma de uma peça já criada (`timeline.edit`). Toda ação passa pelos comandos (D-21).
import { dispatch } from "@novelo/commands";
import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { FloatingWindow } from "./FloatingWindow.tsx";

type Pt = [number, number];
interface Segment {
  radius: number;
  height: number;
  curve: "line" | "round";
}
type Kind = "sphere" | "ellipsoid" | "cone" | "cup" | "stack" | "profile";
export type Shape =
  | { kind: "sphere"; radius: number }
  | { kind: "ellipsoid"; radius: number; halfHeight: number }
  | { kind: "cone"; halfAngleDeg: number; slant: number }
  | { kind: "cup"; radius: number; wall: number }
  | { kind: "stack"; segments: Segment[] }
  | { kind: "profile"; points: Pt[] };

/** O que abre a janela: nova peça, ou a feature `featureId` da linha do tempo com a forma que ela tem. */
export interface ShapeRequest {
  featureId?: number;
  shape?: Shape;
  name?: string;
  beginner?: boolean;
}

let req: ShapeRequest | null = null;
const listeners = new Set<() => void>();
export const openShape = (r: ShapeRequest = {}): void => {
  req = r;
  for (const fn of listeners) fn();
};
const closeShape = (): void => {
  req = null;
  for (const fn of listeners) fn();
};
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
const snapshot = () => req;

const KINDS: [Kind, string][] = [
  ["sphere", "Esfera"],
  ["ellipsoid", "Ovo"],
  ["cone", "Cone"],
  ["cup", "Copo"],
  ["stack", "Composta (trechos)"],
  ["profile", "Perfil livre"],
];

const DEFAULTS: Record<Kind, Shape> = {
  sphere: { kind: "sphere", radius: 25 },
  ellipsoid: { kind: "ellipsoid", radius: 20, halfHeight: 30 },
  cone: { kind: "cone", halfAngleDeg: 30, slant: 50 },
  cup: { kind: "cup", radius: 20, wall: 30 },
  stack: {
    kind: "stack",
    segments: [
      { radius: 15, height: 15, curve: "round" },
      { radius: 15, height: 20, curve: "line" },
      { radius: 0, height: 15, curve: "round" },
    ],
  },
  profile: {
    kind: "profile",
    points: [
      [0, 0],
      [18, 6],
      [20, 25],
      [12, 42],
      [0, 46],
    ],
  },
};

interface Out {
  text: string;
  counts: number[];
  total: number;
  gauge: { w: number; h: number };
  rows: { r: number; z: number; n: number }[];
  profile: Pt[];
  issues: { code: string; message: string }[];
}

const num = (v: string): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

function Field(props: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="shape-field">
      {props.label}{" "}
      <input
        type="number"
        className="num"
        data-testid={`shape-${props.id}`}
        aria-label={props.label}
        min={0}
        step={1}
        value={props.value}
        onChange={(e) => props.onChange(num(e.target.value))}
      />{" "}
      mm
    </label>
  );
}

/** Prévia em perspectiva: a silhueta do perfil e cada volta como uma elipse; arrastar os pontos do perfil livre muda a forma. */
function Preview(props: { out: Out | null; shape: Shape; onPoints: (p: Pt[]) => void }) {
  const W = 300;
  const H = 300;
  const pad = 20;
  const prof = props.out?.profile ?? [];
  const pts: Pt[] = props.shape.kind === "profile" ? props.shape.points : prof;
  const all = [...pts, ...prof];
  const maxR = Math.max(1, ...all.map((p) => p[0]));
  const minZ = Math.min(0, ...all.map((p) => p[1]));
  const maxZ = Math.max(1, ...all.map((p) => p[1]));
  const k = Math.min((W / 2 - pad) / maxR, (H - 2 * pad) / (maxZ - minZ));
  const cx = W / 2;
  const sy = (z: number) => H - pad - (z - minZ) * k;
  const tilt = 0.28; // quanto a elipse da volta "deita" na perspectiva
  const drag = useRef<number | null>(null);
  const svg = useRef<SVGSVGElement | null>(null);
  const side = (sign: 1 | -1) => prof.map(([r, z]) => `${cx + sign * r * k},${sy(z)}`).join(" ");

  const move = (e: React.PointerEvent) => {
    const i = drag.current;
    if (i === null || props.shape.kind !== "profile" || !svg.current) return;
    const b = svg.current.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * W;
    const y = ((e.clientY - b.top) / b.height) * H;
    let r = Math.max(0, (x - cx) / k);
    if (r < 1) r = 0; // perto do eixo: fecha
    const z = (H - pad - y) / k + minZ;
    props.onPoints(
      props.shape.points.map((p, j) =>
        j === i ? [i === 0 ? 0 : Math.round(r * 10) / 10, Math.round(z * 10) / 10] : p,
      ),
    );
  };

  return (
    <svg
      ref={svg}
      viewBox={`0 0 ${W} ${H}`}
      className="shape-preview"
      data-testid="shape-preview"
      role="img"
      aria-label="Prévia da peça: silhueta e voltas"
      onPointerMove={move}
      onPointerUp={() => {
        drag.current = null;
      }}
    >
      <line x1={cx} y1={pad / 2} x2={cx} y2={H - pad / 2} className="axis" />
      {(props.out?.rows ?? []).map((row, i) => (
        <ellipse
          // biome-ignore lint/suspicious/noArrayIndexKey: a volta é identificada pela posição
          key={i}
          cx={cx}
          cy={sy(row.z)}
          rx={Math.max(0.5, row.r * k)}
          ry={Math.max(0.3, row.r * k * tilt)}
          className="row"
        />
      ))}
      <polyline points={side(1)} className="silhouette" />
      <polyline points={side(-1)} className="silhouette" />
      {props.shape.kind === "profile" &&
        props.shape.points.map(([r, z], i) => (
          <circle
            // biome-ignore lint/suspicious/noArrayIndexKey: o ponto é identificado pela posição na lista
            key={i}
            cx={cx + r * k}
            cy={sy(z)}
            r={6}
            className="handle"
            data-testid={`shape-point-${i}`}
            onPointerDown={(e) => {
              drag.current = i;
              svg.current?.setPointerCapture(e.pointerId);
            }}
          />
        ))}
    </svg>
  );
}

function Body(props: { request: ShapeRequest }) {
  const r = props.request;
  const [shape, setShape] = useState<Shape>(r.shape ?? DEFAULTS.sphere);
  const [name, setName] = useState(r.name ?? "");
  const [beginner, setBeginner] = useState(r.beginner ?? true);
  const [msg, setMsg] = useState<string | null>(null);
  const editing = r.featureId !== undefined;

  const res = useMemo((): { out: Out | null; error: string | null } => {
    try {
      return { out: dispatch("forward.revolve", { shape, beginner }) as Out, error: null };
    } catch (e) {
      return { out: null, error: (e as Error).message };
    }
  }, [shape, beginner]);

  const set = (patch: Record<string, number>) => setShape({ ...shape, ...patch } as Shape);
  const segs = shape.kind === "stack" ? shape.segments : [];
  const setSeg = (i: number, patch: Partial<Segment>) =>
    setShape({ kind: "stack", segments: segs.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  const apply = () => {
    try {
      if (editing)
        dispatch("timeline.edit", {
          id: r.featureId,
          params: { shape, beginner, name: name.trim() || null },
        });
      else dispatch("parts.fromShape", { shape, beginner, ...(name.trim() ? { name } : {}) });
      closeShape();
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <div className="shape-win">
      <div className="shape-form">
        <label>
          Forma{" "}
          <select
            data-testid="shape-kind"
            aria-label="Forma"
            value={shape.kind}
            onChange={(e) => setShape(DEFAULTS[e.target.value as Kind])}
          >
            {KINDS.map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {shape.kind === "sphere" && (
          <Field id="radius" label="Raio" value={shape.radius} onChange={(v) => set({ radius: v })} />
        )}
        {shape.kind === "ellipsoid" && (
          <>
            <Field id="radius" label="Raio" value={shape.radius} onChange={(v) => set({ radius: v })} />
            <Field
              id="halfHeight"
              label="Meia altura"
              value={shape.halfHeight}
              onChange={(v) => set({ halfHeight: v })}
            />
          </>
        )}
        {shape.kind === "cone" && (
          <>
            <label className="shape-field">
              Ângulo{" "}
              <input
                type="number"
                className="num"
                data-testid="shape-halfAngleDeg"
                aria-label="Ângulo do cone"
                value={shape.halfAngleDeg}
                onChange={(e) => set({ halfAngleDeg: num(e.target.value) })}
              />{" "}
              graus
            </label>
            <Field id="slant" label="Lado" value={shape.slant} onChange={(v) => set({ slant: v })} />
          </>
        )}
        {shape.kind === "cup" && (
          <>
            <Field id="radius" label="Raio" value={shape.radius} onChange={(v) => set({ radius: v })} />
            <Field id="wall" label="Parede" value={shape.wall} onChange={(v) => set({ wall: v })} />
          </>
        )}
        {shape.kind === "stack" && (
          <div className="shape-segs" data-testid="shape-segments">
            <p className="hint">Trechos do polo para cima; o último com raio 0 fecha a peça.</p>
            {segs.map((g, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: o trecho é identificado pela posição na lista
              <div key={i} className="shape-seg">
                <span>{i + 1}.</span>
                <Field
                  id={`seg-${i}-radius`}
                  label="Raio"
                  value={g.radius}
                  onChange={(v) => setSeg(i, { radius: v })}
                />
                <Field
                  id={`seg-${i}-height`}
                  label="Altura"
                  value={g.height}
                  onChange={(v) => setSeg(i, { height: v })}
                />
                <select
                  aria-label={`Curva do trecho ${i + 1}`}
                  data-testid={`shape-seg-${i}-curve`}
                  value={g.curve}
                  onChange={(e) => setSeg(i, { curve: e.target.value as Segment["curve"] })}
                >
                  <option value="round">arredondado</option>
                  <option value="line">reto</option>
                </select>
                <button
                  type="button"
                  aria-label={`Tirar o trecho ${i + 1}`}
                  disabled={segs.length < 2}
                  onClick={() => setShape({ kind: "stack", segments: segs.filter((_, j) => j !== i) })}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              data-testid="shape-seg-add"
              onClick={() => {
                const lastR = segs[segs.length - 1]?.radius ?? 10;
                setShape({
                  kind: "stack",
                  segments: [...segs, { radius: lastR, height: 10, curve: "line" }],
                });
              }}
            >
              + trecho
            </button>
          </div>
        )}
        {shape.kind === "profile" && (
          <div className="shape-segs">
            <p className="hint">
              Arraste os pontos na prévia. O primeiro fica no eixo (anel mágico); levar o último até o eixo
              fecha a peça.
            </p>
            <button
              type="button"
              data-testid="shape-point-add"
              onClick={() => {
                const p = shape.points;
                const [lr, lz] = p[p.length - 1] as Pt;
                setShape({ kind: "profile", points: [...p, [Math.max(lr, 5), lz + 8]] });
              }}
            >
              + ponto
            </button>{" "}
            <button
              type="button"
              disabled={shape.points.length < 3}
              onClick={() => setShape({ kind: "profile", points: shape.points.slice(0, -1) })}
            >
              − ponto
            </button>
          </div>
        )}
        <label>
          Nome{" "}
          <input
            aria-label="Nome da peça"
            data-testid="shape-name"
            placeholder="automático"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            data-testid="shape-beginner"
            checked={beginner}
            onChange={(e) => setBeginner(e.target.checked)}
          />{" "}
          Contagens redondas (múltiplos de 6, para iniciantes)
        </label>
        <p className="hint" data-testid="shape-summary" aria-live="polite">
          {res.out
            ? `${res.out.counts.length} voltas · ${res.out.total} pontos · ponto de ${res.out.gauge.w} mm, volta de ${res.out.gauge.h} mm`
            : res.error}
        </p>
        {res.out && res.out.issues.some((i) => i.code !== "FRIENDLY_SNAP") && (
          <ul className="shape-issues" data-testid="shape-issues">
            {res.out.issues
              .filter((i) => i.code !== "FRIENDLY_SNAP")
              .map((i) => (
                <li key={`${i.code}-${i.message}`}>{i.message}</li>
              ))}
          </ul>
        )}
        <button
          type="button"
          className="primary"
          data-testid="shape-create"
          disabled={!res.out}
          onClick={apply}
        >
          {editing ? "Aplicar à peça" : "Criar peça"}
        </button>
        {msg && (
          <span className="warn" role="alert">
            {msg}
          </span>
        )}
      </div>
      <Preview out={res.out} shape={shape} onPoints={(points) => setShape({ kind: "profile", points })} />
    </div>
  );
}

export function ShapeWindow() {
  const r = useSyncExternalStore(subscribe, snapshot);
  if (!r) return null;
  return (
    <FloatingWindow
      title={r.featureId === undefined ? "Nova peça por forma" : "Forma da peça"}
      onClose={closeShape}
      testId="shape-window"
    >
      <Body key={r.featureId ?? "nova"} request={r} />
    </FloatingWindow>
  );
}
