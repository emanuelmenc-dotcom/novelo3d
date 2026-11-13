// SPDX-License-Identifier: GPL-3.0-or-later
// Editor de um fio da paleta: tipo de cor (lisa, listras, degradê, mescla, jaspê) com várias cores e trecho em metros,
// material e espessura por padrão (EUA, Reino Unido/Europa, Brasil). Tudo via yarns.library, yarns.preview e yarns.set.
import { dispatch, type Yarn } from "@novelo/commands";
import { useMemo } from "react";

interface Library {
  colorKinds: { id: string; name: string; defaultSegmentM: number }[];
  materials: { id: string; name: string; note: string }[];
  regions: Record<string, string>;
  thickness: {
    id: string;
    region: string;
    name: string;
    diameterMm: number;
    mPer100g: number;
    hookMm: [number, number];
    stsPer10cm: [number, number];
  }[];
  note: string;
}

let cached: Library | null = null;
const library = (): Library => {
  cached ??= dispatch("yarns.library") as Library;
  return cached;
};

export function YarnEditor(props: { yarn: Yarn; onChange: (patch: Partial<Yarn>) => void }) {
  const { yarn: y, onChange } = props;
  const lib = library();
  const kind = y.color?.kind ?? "solid";
  const colors = y.color?.colors ?? [y.colorHex];
  const info = lib.thickness.find((t) => t.id === y.thickness?.id);
  const region = y.thickness?.id ? (info?.region ?? "custom") : y.thickness ? "custom" : "";

  const preview = useMemo(() => {
    try {
      return (dispatch("yarns.preview", { yarn: y, meters: 30, steps: 30 }) as { colors: string[] }).colors;
    } catch {
      return [];
    }
  }, [y]);

  const setKind = (k: string) => {
    if (k === "solid") return onChange({ color: undefined, colorHex: colors[0] ?? y.colorHex });
    const cs = colors.length >= 2 ? colors : [y.colorHex, "#ffffff"];
    onChange({
      color: {
        kind: k as "stripes",
        colors: cs,
        ...(y.color?.segmentM ? { segmentM: y.color.segmentM } : {}),
      },
    });
  };
  const setColors = (cs: string[]) => {
    if (!y.color) return;
    onChange({ color: { ...y.color, colors: cs }, colorHex: cs[0] ?? y.colorHex });
  };

  return (
    <div className="yarn-editor" data-testid={`yarn-editor-${y.id}`}>
      <div className="yarn-preview" data-testid={`yarn-preview-${y.id}`}>
        {preview.map((c, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: amostras da prévia, ordem fixa
          <span key={i} style={{ background: c }} />
        ))}
      </div>
      <p className="hint">Prévia: os primeiros 30 m de fio, na ordem em que são usados.</p>

      <label className="block">
        Tipo de cor{" "}
        <select
          aria-label={`Tipo de cor do fio ${y.id}`}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {lib.colorKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      {kind !== "solid" && (
        <>
          <div className="row">
            {colors.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: a posição é a identidade da cor na lista
              <span key={i} className="color-chip">
                <input
                  type="color"
                  aria-label={`Cor ${i + 1} do fio ${y.id}`}
                  value={c}
                  onChange={(e) => setColors(colors.map((x, j) => (j === i ? e.target.value : x)))}
                />
                {colors.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remover cor ${i + 1} do fio ${y.id}`}
                    onClick={() => setColors(colors.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {colors.length < 6 && (
              <button
                type="button"
                aria-label={`Adicionar cor ao fio ${y.id}`}
                onClick={() => setColors([...colors, "#c2185b"])}
              >
                + cor
              </button>
            )}
          </div>
          {kind !== "tweed" && (
            <label className="block">
              Trecho de cada cor (m){" "}
              <input
                type="number"
                className="num"
                aria-label={`Trecho de cor do fio ${y.id} em metros`}
                min={0.05}
                max={500}
                step={0.5}
                value={y.color?.segmentM ?? lib.colorKinds.find((k) => k.id === kind)?.defaultSegmentM ?? 5}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (y.color && v >= 0.05 && v <= 500) onChange({ color: { ...y.color, segmentM: v } });
                }}
              />
            </label>
          )}
        </>
      )}

      <label className="block">
        Material{" "}
        <select
          aria-label={`Material do fio ${y.id}`}
          value={y.material ?? ""}
          onChange={(e) => onChange({ material: (e.target.value || undefined) as Yarn["material"] })}
        >
          <option value="">não informado</option>
          {lib.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {y.material && <p className="hint">{lib.materials.find((m) => m.id === y.material)?.note}</p>}

      <div className="row">
        <label>
          Padrão de espessura{" "}
          <select
            aria-label={`Região da espessura do fio ${y.id}`}
            value={region}
            onChange={(e) => {
              const r = e.target.value;
              if (r === "") onChange({ thickness: undefined });
              else if (r === "custom") onChange({ thickness: { diameterMm: y.thickness?.diameterMm ?? 2 } });
              else {
                const first = lib.thickness.find((t) => t.region === r);
                if (first) onChange({ thickness: { id: first.id, diameterMm: first.diameterMm } });
              }
            }}
          >
            <option value="">não informado</option>
            {Object.entries(lib.regions).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {region !== "" && region !== "custom" && (
          <select
            aria-label={`Espessura do fio ${y.id}`}
            value={y.thickness?.id ?? ""}
            onChange={(e) => {
              const t = lib.thickness.find((x) => x.id === e.target.value);
              if (t) onChange({ thickness: { id: t.id, diameterMm: t.diameterMm } });
            }}
          >
            {lib.thickness
              .filter((t) => t.region === region)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        )}
        {y.thickness && (
          <label>
            Diâmetro (mm){" "}
            <input
              type="number"
              className="num"
              aria-label={`Diâmetro do fio ${y.id} em mm`}
              min={0.2}
              max={20}
              step={0.1}
              value={y.thickness.diameterMm}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v >= 0.2 && v <= 20) onChange({ thickness: { diameterMm: v } });
              }}
            />
          </label>
        )}
      </div>
      {info && (
        <p className="hint" data-testid={`thickness-info-${y.id}`}>
          ≈ {info.mPer100g} m/100 g · agulha {info.hookMm[0]}–{info.hookMm[1]} mm · {info.stsPer10cm[0]}–
          {info.stsPer10cm[1]} pb em 10 cm
        </p>
      )}
      <p className="hint">{lib.note}</p>
    </div>
  );
}
