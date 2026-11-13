// SPDX-License-Identifier: GPL-3.0-or-later
// Lista de materiais (P3.5): fios usados por peça, costuras, consumo e troca de um fio por outro em todo o projeto;
// e a criação de fios novos a partir do padrão das configurações. Chamados por index.ts, pela interface e pelo MCP.
import type { Yarn } from "@novelo/core";
import { remapYarnOverrides } from "./edit-store.ts";
import { nextYarnId, paintSnapshot, remapYarnAll, setYarns } from "./paint-store.ts";
import { checkSeam } from "./parts-commands.ts";
import { partsSnapshot, remapPartYarns, withPart } from "./parts-store.ts";
import { getSettings } from "./settings.ts";

type Params = Record<string, unknown>;
type Cmd = (p: Params) => unknown;

/** Cores sugeridas para fios novos (a primeira ainda não usada na paleta). */
const PRESET_COLORS = [
  "#c2185b",
  "#1565c0",
  "#ef6c00",
  "#6a1b9a",
  "#00838f",
  "#f9a825",
  "#2e7d32",
  "#ad1457",
  "#4527a0",
  "#5d4037",
];

/** Largura do ponto usada na estimativa do fio de costura, em mm, e fio gasto por par de pontos (em larguras). */
const SEAM_WIDTHS_PER_PAIR = 3;

interface UsageRow {
  yarn: string;
  stitches: number;
  lengthM: number;
  gramsApprox: number | null;
}

export function materialsCommands(call: (method: string, params: Params) => unknown): Record<string, Cmd> {
  return {
    /** Fio novo no padrão das configurações (tipo de cor, material, espessura) com uma cor ainda não usada. */
    "yarns.add": (p) => {
      const ys = paintSnapshot().yarns;
      const id = nextYarnId(ys);
      if (!id) throw new Error("a paleta está cheia (8 fios)");
      const std = getSettings().yarns.standard;
      const used = new Set(ys.map((y) => y.colorHex));
      const free = PRESET_COLORS.filter((c) => !used.has(c));
      const base = typeof p.colorHex === "string" ? p.colorHex : (free[0] ?? "#c2185b");
      const yarn: Yarn = {
        id,
        name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : `fio ${id}`,
        colorHex: base,
      };
      if (std.colorKind !== "solid") {
        yarn.color = {
          kind: std.colorKind,
          colors: [base, free[1] ?? "#ffffff"],
          ...(std.segmentM ? { segmentM: std.segmentM } : {}),
        };
      }
      if (std.material) yarn.material = std.material;
      if (std.thickness) yarn.thickness = { ...std.thickness };
      setYarns([...ys, yarn]);
      return { id, yarns: paintSnapshot().yarns };
    },

    /**
     * Lista de materiais do projeto: cada fio com pontos, metros e gramas (aproximados) somados em todas as peças
     * (instâncias e espelhadas gastam fio também), em quais peças aparece, e as costuras com o fio de costura.
     */
    "materials.list": () => {
      const st = partsSnapshot();
      const { yarns } = paintSnapshot();
      const acc = new Map<
        string,
        { stitches: number; lengthM: number; grams: number | null; parts: Map<string, number> }
      >();
      for (const y of yarns) acc.set(y.id, { stitches: 0, lengthM: 0, grams: null, parts: new Map() });
      for (const part of st.parts) {
        const rep = withPart(
          part.id,
          (root) =>
            call("paint.report", {
              text: root.text,
              ...(root.dialect ? { dialect: root.dialect } : {}),
              ...(part.yarnMap ? { yarnMap: part.yarnMap } : {}),
            }) as {
              usage: UsageRow[];
            },
        );
        for (const u of rep.usage) {
          const id = u.yarn;
          const a = acc.get(id);
          if (!a) continue;
          a.stitches += u.stitches;
          a.lengthM += u.lengthM;
          if (u.gramsApprox !== null) a.grams = (a.grams ?? 0) + u.gramsApprox;
          a.parts.set(part.id, (a.parts.get(part.id) ?? 0) + u.stitches);
        }
      }
      const seamDefaults = getSettings().yarns.seam;
      let seamM = 0;
      const seams = st.seams.map((s) => {
        const c = checkSeam(s.a, s.b, s.reverse, s.ratio);
        const lengthM = (c.pairs.length * SEAM_WIDTHS_PER_PAIR * getSettings().yarns.stitchWidthMm) / 1000;
        seamM += lengthM;
        return {
          id: s.id,
          name: s.name,
          type: s.type,
          pairs: c.pairs.length,
          lengthM: Math.round(lengthM * 100) / 100,
          ok: c.ok,
        };
      });
      const names = new Map(st.parts.map((q) => [q.id, q.name]));
      return {
        yarns: yarns.map((y) => {
          const a = acc.get(y.id) as NonNullable<ReturnType<typeof acc.get>>;
          return {
            ...y,
            stitches: a.stitches,
            lengthM: Math.round(a.lengthM * 100) / 100,
            gramsApprox: a.grams === null ? null : Math.round(a.grams * 10) / 10,
            used: a.stitches > 0,
            parts: [...a.parts].map(([id, stitches]) => ({ id, name: names.get(id) ?? id, stitches })),
          };
        }),
        seams,
        seamYarn: seamDefaults,
        seamLengthM: Math.round(seamM * 100) / 100,
        note: "Metros e gramas são estimativas; o fio de costura conta ~3 larguras de ponto por par de pontos.",
      };
    },

    /**
     * Troca o fio `from` pelo fio `to` em todo o projeto: pintura por volta, pontos pintados à mão e trocas das
     * instâncias. Com `remove: true` o fio `from` sai da paleta depois. O fio A é o fio base: trocá-lo faz o A
     * assumir o nome, a cor, o material e a espessura de `to` (e as pinturas de `to` viram A).
     */
    "materials.replace": (p) => {
      const from = String(p.from);
      const to = String(p.to);
      const ys = paintSnapshot().yarns;
      if (from === to) throw new Error("escolha um fio diferente");
      if (!ys.some((y) => y.id === from)) throw new Error(`fio '${from}' não existe na paleta`);
      const ty = ys.find((y) => y.id === to);
      if (!ty) throw new Error(`fio '${to}' não existe na paleta`);
      let changed = 0;
      if (from === "A") {
        setYarns(ys.map((y) => (y.id === "A" ? { ...ty, id: "A" } : y)));
        changed += remapYarnAll(to, "A");
        changed += remapYarnOverrides(to.charCodeAt(0) - 65, 0);
        changed += remapPartYarns(to, "A");
        if (p.remove === true) setYarns(paintSnapshot().yarns.filter((y) => y.id !== to));
      } else {
        changed += remapYarnAll(from, to);
        changed += remapYarnOverrides(from.charCodeAt(0) - 65, to.charCodeAt(0) - 65);
        changed += remapPartYarns(from, to);
        if (p.remove === true) setYarns(paintSnapshot().yarns.filter((y) => y.id !== from));
      }
      return { changed, yarns: paintSnapshot().yarns };
    },
  };
}
