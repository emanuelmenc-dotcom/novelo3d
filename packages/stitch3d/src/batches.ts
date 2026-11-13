// SPDX-License-Identifier: GPL-3.0-or-later
// Lotes de instâncias por variante de modelo (R3): quais pontos usam cada modelo e em que posição (slot) do lote cada
// um está. `move` troca o modelo de UM ponto sem refazer os outros lotes (ponto base editado, "simular todos").
// Invariante: dentro de cada lote os slots são 0..n-1 sem buracos (o último ocupa o lugar de quem sai).

export interface MoveResult {
  node: number;
  from: { batch: number; slot: number };
  to: { batch: number; slot: number };
  /** Ponto que passou a ocupar o slot liberado no lote de origem (-1 se o movido era o último). */
  filled: number;
}

export class BatchTable {
  /** Pontos de cada lote, em ordem de slot. */
  readonly lists: number[][] = [];
  readonly nodeBatch: Int32Array;
  readonly nodeSlot: Int32Array;

  /** `modelOf[i]` = índice do modelo (lote) do ponto i. Índices de lote podem ser esparsos. */
  constructor(modelOf: ArrayLike<number>) {
    const n = modelOf.length;
    this.nodeBatch = new Int32Array(n);
    this.nodeSlot = new Int32Array(n);
    for (let i = 0; i < n; i++) this.add(i, modelOf[i] as number);
  }

  private add(node: number, batch: number): { batch: number; slot: number } {
    while (this.lists.length <= batch) this.lists.push([]);
    const list = this.lists[batch] as number[];
    const slot = list.length;
    list.push(node);
    this.nodeBatch[node] = batch;
    this.nodeSlot[node] = slot;
    return { batch, slot };
  }

  get batches(): number {
    return this.lists.filter((l) => l.length > 0).length;
  }

  /** Muda o ponto para o lote do novo modelo. Os outros pontos só se mexem para tapar o buraco no lote de origem. */
  move(node: number, batch: number): MoveResult | null {
    const fromBatch = this.nodeBatch[node] as number;
    if (fromBatch === batch) return null;
    const fromSlot = this.nodeSlot[node] as number;
    const list = this.lists[fromBatch] as number[];
    const last = list[list.length - 1] as number;
    let filled = -1;
    if (last !== node) {
      list[fromSlot] = last;
      this.nodeSlot[last] = fromSlot;
      filled = last;
    }
    list.pop();
    const to = this.add(node, batch);
    return { node, from: { batch: fromBatch, slot: fromSlot }, to, filled };
  }
}
