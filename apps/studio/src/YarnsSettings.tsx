// SPDX-License-Identifier: GPL-3.0-or-later
// Aba "Fios e costura" das configurações: padrão dos fios novos (a cor muda de um para outro) e do fio de costura.
// Tudo via settings.set / yarns.library (D-21): o MCP vê e muda os mesmos valores.
import { dispatch, settingsSnapshot, subscribeSettings } from "@novelo/commands";
import { useState, useSyncExternalStore } from "react";

interface Library {
  colorKinds: { id: string; name: string; defaultSegmentM: number }[];
  materials: { id: string; name: string }[];
  regions: Record<string, string>;
  thickness: { id: string; region: string; name: string }[];
}
let cached: Library | null = null;
const library = (): Library => {
  cached ??= dispatch("yarns.library") as Library;
  return cached;
};

const SEAM_TYPES: [string, string][] = [
  ["mattress", "Ponto invisível (colchão)"],
  ["whip", "Chuleio (ponto de arremate)"],
  ["slip", "Ponto baixíssimo"],
  ["sc", "Ponto baixo"],
];

export function YarnsSettings() {
  const settings = useSyncExternalStore(subscribeSettings, settingsSnapshot);
  const lib = library();
  const [error, setError] = useState<string | null>(null);
  const std = settings.yarns.standard;
  const seam = settings.yarns.seam;

  const set = (patch: Record<string, unknown>) => {
    try {
      dispatch("settings.set", { yarns: patch });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const thicknessSelect = (label: string, value: string | undefined, onPick: (id: string | null) => void) => (
    <label className="block">
      {label}{" "}
      <select aria-label={label} value={value ?? ""} onChange={(e) => onPick(e.target.value || null)}>
        <option value="">não informado</option>
        {Object.entries(lib.regions)
          .filter(([r]) => r !== "custom")
          .map(([r, name]) => (
            <optgroup key={r} label={name}>
              {lib.thickness
                .filter((t) => t.region === r)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
      </select>
    </label>
  );
  const materialSelect = (label: string, value: string | undefined, onPick: (id: string | null) => void) => (
    <label className="block">
      {label}{" "}
      <select aria-label={label} value={value ?? ""} onChange={(e) => onPick(e.target.value || null)}>
        <option value="">não informado</option>
        {lib.materials.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div role="tabpanel" aria-label="Fios e costura" className="dialog-panel">
      <h3>Fios novos</h3>
      <p className="hint">
        Todo fio adicionado ao modelo nasce com este padrão, só com uma cor diferente. Depois dá para mudar
        qualquer propriedade na paleta ou na lista de materiais.
      </p>
      <label className="block">
        Tipo de cor{" "}
        <select
          aria-label="Tipo de cor padrão"
          value={std.colorKind}
          onChange={(e) => set({ standard: { colorKind: e.target.value } })}
        >
          {lib.colorKinds.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </select>
      </label>
      {std.colorKind !== "solid" && std.colorKind !== "tweed" && (
        <label className="block">
          Trecho de cada cor (m){" "}
          <input
            type="number"
            className="num"
            aria-label="Trecho de cor padrão em metros"
            min={0.05}
            max={500}
            step={0.5}
            value={std.segmentM ?? lib.colorKinds.find((k) => k.id === std.colorKind)?.defaultSegmentM ?? 5}
            onChange={(e) => set({ standard: { segmentM: Number(e.target.value) } })}
          />
        </label>
      )}
      {materialSelect("Material padrão", std.material, (m) => set({ standard: { material: m } }))}
      {thicknessSelect("Espessura padrão", std.thickness?.id, (id) =>
        set({ standard: { thickness: id ? { id } : null } }),
      )}

      <h3>Costura</h3>
      <p className="hint">Fio de costura e ponto usados nas costuras novas e desenhados no 3D.</p>
      <label className="block">
        Cor do fio de costura{" "}
        <input
          type="color"
          aria-label="Cor do fio de costura"
          value={seam.colorHex}
          onChange={(e) => set({ seam: { colorHex: e.target.value } })}
        />
      </label>
      <label className="block">
        Ponto de costura{" "}
        <select
          aria-label="Ponto de costura padrão"
          value={seam.type}
          onChange={(e) => set({ seam: { type: e.target.value } })}
        >
          {SEAM_TYPES.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {materialSelect("Material da costura", seam.material, (m) => set({ seam: { material: m } }))}
      {thicknessSelect("Espessura da costura", seam.thickness?.id, (id) =>
        set({ seam: { thickness: id ? { id } : null } }),
      )}
      {error && (
        <p className="warn" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
