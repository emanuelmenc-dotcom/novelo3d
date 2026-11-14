// SPDX-License-Identifier: GPL-3.0-or-later
// Projeto em arquivo (D-58): exportar e importar devolve receita, pintura e edições por ponto; arquivo inválido não mexe em nada.
import { afterEach, describe, expect, test } from "vitest";
import {
  dispatch,
  exportEditAll,
  exportPaintAll,
  partsSnapshot,
  resetPaint,
  resetParts,
} from "../src/index.ts";

const TEXT = ["V1: 6 pb no anel mágico (6)", "V2: 6 aum (12)", "V3: (1 pb, 1 aum) x6 (18)"].join("\n");

afterEach(() => {
  resetParts("");
  resetPaint();
});

const refused = (fn: () => unknown): string => {
  try {
    fn();
  } catch (e) {
    return (e as Error).message;
  }
  return "ok";
};

describe("project.export / project.import", () => {
  test("arquivo com linha do tempo fora de sincronia abre como está e sem histórico; em sincronia mantém o desfazer", () => {
    resetParts(TEXT);
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    const good = JSON.parse(JSON.stringify(dispatch("project.export")));
    // arquivo editado à mão (ou de outra versão): a peça não está onde a linha do tempo a deixa. (Receita diferente não
    // serve de exemplo: vira uma feature de receita pendente, que dá para desfazer.)
    const edited = JSON.parse(JSON.stringify(good));
    edited.parts.parts[0].pos = [99, 0, 0];
    resetParts("");
    const r = dispatch("project.import", { project: edited }) as { history: string };
    expect(r.history).toBe("descartado");
    expect(partsSnapshot().parts[0]?.pos).toEqual([99, 0, 0]);
    expect(dispatch("history.get")).toEqual({ canUndo: false, canRedo: false });
    // o arquivo bom mantém o desfazer
    const ok = dispatch("project.import", { project: good }) as { history: string };
    expect(ok.history).toBe("mantido");
    expect((dispatch("history.get") as { canUndo: boolean }).canUndo).toBe(true);
  });

  test("ida e volta: receita, pintura e tensão por ponto voltam iguais", () => {
    resetParts(TEXT);
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    dispatch("selection.select", { text: TEXT, by: { kind: "group", from: 3, to: 3 } });
    dispatch("points.set", { text: TEXT, prop: "tension", value: -1 });
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    const paint = JSON.stringify(exportPaintAll());
    const edit = JSON.stringify(exportEditAll());

    resetParts("V1: 6 pb no anel mágico (6)");
    resetPaint();
    expect(JSON.stringify(exportPaintAll())).not.toBe(paint);

    const r = dispatch("project.import", { project: file }) as { parts: number };
    expect(r.parts).toBe(1);
    expect(partsSnapshot().parts[0]?.text).toBe(TEXT);
    expect(JSON.stringify(exportPaintAll())).toBe(paint);
    expect(JSON.stringify(exportEditAll())).toBe(edit);
  });

  test("o texto com #marco vai e volta no arquivo e o marco continua no modo de leitura", () => {
    const marked = `${TEXT}
#marco Fechar o corpo`;
    resetParts(marked);
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    resetParts("V1: 6 pb no anel mágico (6)");
    dispatch("project.import", { project: file });
    expect(partsSnapshot().parts[0]?.text).toBe(marked);
    dispatch("tutorial.goto", { text: marked, round: 3 });
    const v = dispatch("tutorial.slide", { text: marked, kind: "review" }) as {
      milestone: { title: string };
    };
    expect(v.milestone.title).toBe("Fechar o corpo");
  });

  test("arquivo inválido é recusado e o projeto atual fica como estava", () => {
    resetParts(TEXT);
    const before = JSON.stringify(dispatch("project.export"));
    expect(refused(() => dispatch("project.import", { project: { ola: 1 } }))).toContain("não é um projeto");
    expect(refused(() => dispatch("project.import", { project: { app: "novelo3d", version: 9 } }))).toContain(
      "versão",
    );
    expect(refused(() => dispatch("project.import", { project: { app: "novelo3d", version: 1 } }))).toContain(
      "não tem peças",
    );
    expect(refused(() => dispatch("project.import", { project: null }))).toContain("não é um projeto");
    expect(
      refused(() =>
        dispatch("project.import", {
          project: { app: "novelo3d", version: 1, parts: { parts: [{ x: 1 }, 7] } },
        }),
      ),
    ).toContain("não tem peças");
    expect(JSON.stringify(dispatch("project.export"))).toBe(before);
  });

  test("arquivo sem linha do tempo: desfazer logo depois de abrir não mexe no projeto aberto", () => {
    resetParts(TEXT);
    dispatch("paint.rows", { yarn: "B", from: 2, to: 2 });
    const file = { ...JSON.parse(JSON.stringify(dispatch("project.export"))), timeline: undefined };
    resetParts("V1: 6 pb no anel mágico (6)");
    dispatch("project.import", { project: file });
    const opened = JSON.stringify(dispatch("project.export"));
    refused(() => dispatch("history.undo"));
    expect(JSON.stringify(dispatch("project.export"))).toBe(opened);
  });

  test("check: true só confere e não carrega", () => {
    resetParts(TEXT);
    const file = JSON.parse(JSON.stringify(dispatch("project.export")));
    resetParts("V1: 6 pb no anel mágico (6)");
    dispatch("project.import", { project: file, check: true });
    expect(partsSnapshot().parts[0]?.text).toBe("V1: 6 pb no anel mágico (6)");
  });
});
