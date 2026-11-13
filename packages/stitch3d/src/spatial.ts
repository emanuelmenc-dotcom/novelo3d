// SPDX-License-Identifier: GPL-3.0-or-later
// Grade uniforme de pontos (R3d): consulta de vizinhos dentro de um raio sem comparar todos os pares. Puro.

export interface SpatialGrid {
  insert(id: number, x: number, y: number, z: number): void;
  /** Move um ponto já inserido (das coordenadas antigas para as novas). */
  move(id: number, ox: number, oy: number, oz: number, x: number, y: number, z: number): void;
  /** Chama `fn` para cada ponto a no máximo `r` de (x, y, z), usando as posições atuais de `pos` (inclui o próprio). */
  query(x: number, y: number, z: number, r: number, fn: (id: number) => void): void;
}

export function createGrid(cell: number, pos: ArrayLike<number>): SpatialGrid {
  const size = cell > 1e-9 ? cell : 1;
  const cells = new Map<string, number[]>();
  const key = (cx: number, cy: number, cz: number): string => `${cx},${cy},${cz}`;
  const at = (v: number): number => Math.floor(v / size);
  const g: SpatialGrid = {
    insert(id, x, y, z) {
      const k = key(at(x), at(y), at(z));
      const c = cells.get(k);
      if (c) c.push(id);
      else cells.set(k, [id]);
    },
    move(id, ox, oy, oz, x, y, z) {
      const a = key(at(ox), at(oy), at(oz));
      const b = key(at(x), at(y), at(z));
      if (a === b) return;
      const c = cells.get(a);
      if (c) {
        const i = c.indexOf(id);
        if (i >= 0) c.splice(i, 1);
      }
      const d = cells.get(b);
      if (d) d.push(id);
      else cells.set(b, [id]);
    },
    query(x, y, z, r, fn) {
      const r2 = r * r;
      for (let cx = at(x - r); cx <= at(x + r); cx++) {
        for (let cy = at(y - r); cy <= at(y + r); cy++) {
          for (let cz = at(z - r); cz <= at(z + r); cz++) {
            const c = cells.get(key(cx, cy, cz));
            if (!c) continue;
            for (const id of c) {
              const dx = (pos[id * 3] as number) - x;
              const dy = (pos[id * 3 + 1] as number) - y;
              const dz = (pos[id * 3 + 2] as number) - z;
              if (dx * dx + dy * dy + dz * dz <= r2) fn(id);
            }
          }
        }
      }
    },
  };
  for (let i = 0; i * 3 + 2 < pos.length; i++) {
    g.insert(i, pos[i * 3] as number, pos[i * 3 + 1] as number, pos[i * 3 + 2] as number);
  }
  return g;
}
