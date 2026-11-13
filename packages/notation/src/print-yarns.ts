// SPDX-License-Identifier: GPL-3.0-or-later
// Receita escrita com as trocas de fio nas linhas e posições certas (P3). Recebe o fio de cada nó (já pintado).
import { type Atom, atomKey, type Dialect, expandRounds, type Pattern, type Round } from "@novelo/core";
import { foldKeys, PREFIX, rowBody, segText } from "./print.ts";

export interface YarnChange {
  /** Volta em que o fio muda (1-based). */
  round: number;
  /** Fio anterior (null no começo da peça) e novo fio. */
  from: string | null;
  to: string;
  /** Ordem do primeiro ponto no novo fio, dentro da volta (1-based). */
  atStitch: number;
  text: string;
}

export interface YarnPrint {
  text: string;
  changes: YarnChange[];
}

const tokenText = (d: Dialect, from: string | null, to: string, name: string | undefined): string => {
  const label = name ? `${to} (${name})` : to;
  if (d === "pt-BR") return from === null ? `começar com o fio ${label}` : `trocar para o fio ${label}`;
  return from === null ? `start with yarn ${label}` : `change to yarn ${label}`;
};

interface Seg {
  yarn: string;
  atoms: Atom[];
  /** Ordem (1-based) do primeiro ponto do segmento dentro da volta. */
  firstStitch: number;
}

/** Divide a volta em trechos de um mesmo fio (operações sem pontos, como pular e notas, ficam no trecho atual). */
function segments(r: Round, yarnByNode: string[], startYarn: string): Seg[] {
  const out: Seg[] = [];
  let cur = startYarn;
  let seg: Seg | null = null;
  r.atoms.forEach((a, i) => {
    const id = r.atomNode[i] as number;
    const y = id >= 0 ? ((yarnByNode[id] as string | undefined) ?? cur) : cur;
    if (!seg || (id >= 0 && y !== seg.yarn)) {
      seg = { yarn: y, atoms: [], firstStitch: id >= 0 ? id - r.firstId + 1 : 1 };
      out.push(seg);
    }
    seg.atoms.push(a);
    cur = y;
  });
  return out;
}

/**
 * Escreve a receita com as trocas de fio. `yarnByNode[id]` é o fio de cada nó do grafo (ver `paintedYarns`).
 * Voltas seguidas iguais (mesmo texto e mesmos fios) continuam sendo juntadas em intervalos: "V7–9".
 */
export function printPatternWithYarns(
  pattern: Pattern,
  yarnByNode: string[],
  dialect: Dialect = pattern.dialect,
  yarnNames: Record<string, string> = {},
  baseYarn = "A",
): YarnPrint {
  const rounds = expandRounds(pattern);
  const changes: YarnChange[] = [];
  type Entry = { first: Round; count: number; sig: string; lead: string | null; body: string };
  const entries: Entry[] = [];
  let carried: string | null = null; // fio com que a volta anterior terminou (null: ainda não começou)

  for (const r of rounds) {
    const probe = segments(r, yarnByNode, carried ?? baseYarn);
    const segs: Seg[] = probe.length > 0 ? probe : [{ yarn: carried ?? baseYarn, atoms: [], firstStitch: 1 }];
    // textos por trecho (sem as marcas de troca)
    const bodies: string[] = [];
    if (segs.length === 1) {
      bodies.push(rowBody({ ...r, reps: 1 }, dialect));
    } else {
      segs.forEach((s, i) => {
        let t = segText(foldKeys(s.atoms.map(atomKey)), dialect);
        if (i === segs.length - 1 && r.row.start === "magicRing") {
          // em XVA o anel vai numa linha "R0: MR" à parte
          if (dialect !== "xva") t += dialect === "pt-BR" ? " no anel mágico" : " in magic ring";
        }
        bodies.push(t);
      });
    }
    // marcas de troca: no começo da volta (se o fio mudou em relação ao fim da anterior) e entre trechos
    let lead: string | null = null;
    const pieces: string[] = [];
    segs.forEach((s, i) => {
      const prevYarn: string | null = i === 0 ? carried : (segs[i - 1] as Seg).yarn;
      const changed = i === 0 ? (carried === null ? s.yarn !== baseYarn : s.yarn !== carried) : true;
      if (changed) {
        const t = tokenText(dialect, prevYarn, s.yarn, yarnNames[s.yarn]);
        if (i === 0) lead = t;
        pieces.push(t);
        changes.push({ round: r.round, from: prevYarn, to: s.yarn, atStitch: s.firstStitch, text: t });
      }
      pieces.push(bodies[i] as string);
    });
    carried = (segs[segs.length - 1] as Seg).yarn;

    const leadless = lead ? pieces.slice(1) : pieces;
    const body = pieces.join(", ");
    const sig = `${leadless.join(",")}|${segs.map((s) => s.yarn).join("")}|${r.prevCounted}|${r.produced}|${r.row.start ?? ""}|${r.row.kind}`;
    const last = entries[entries.length - 1];
    // junta voltas iguais; uma volta que repete a troca do começo só entra se a primeira também a tinha
    if (last && last.sig === sig && r.row.start === undefined && (lead === null || lead === last.lead)) {
      last.count++;
    } else {
      entries.push({ first: r, count: 1, sig, lead, body });
    }
  }

  const lines: string[] = [];
  for (const e of entries) {
    const a = e.first.round;
    const label = e.count > 1 ? `${a}–${a + e.count - 1}` : String(a);
    if (dialect === "xva" && e.first.row.start === "magicRing") lines.push("R0: MR");
    lines.push(`${PREFIX[dialect][e.first.row.kind]}${label}: ${e.body} (${e.first.produced})`);
  }
  return { text: lines.join("\n"), changes };
}
