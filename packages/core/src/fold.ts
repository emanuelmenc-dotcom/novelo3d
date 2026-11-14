// SPDX-License-Identifier: GPL-3.0-or-later
// Dobra de sequências de pontos iguais em corridas e blocos "(bloco) ×k". Vive no core para o impressor, o tutorial e a
// tabela do gráfico usarem a mesma regra (v3, D-19).

export type Seg = { t: "run"; key: string; count: number } | { t: "block"; keys: string[]; times: number };

const distinct = (k: string[]): number => new Set(k).size;

export function runs(keys: string[]): Seg[] {
  const out: Seg[] = [];
  for (const key of keys) {
    const last = out[out.length - 1];
    if (last && last.t === "run" && last.key === key) last.count++;
    else out.push({ t: "run", key, count: 1 });
  }
  return out;
}

const same = (K: string[], a: number, b: number, len: number): boolean => {
  for (let i = 0; i < len; i++) if (K[a + i] !== K[b + i]) return false;
  return true;
};

/** Dobra a sequência: cobertura total por um bloco repetido (maior k), senão cobertura parcial. */
export function foldKeys(K: string[]): Seg[] {
  const n = K.length;
  for (let p = 2; p <= n / 2; p++) {
    if (n % p !== 0 || distinct(K.slice(0, p)) < 2) continue;
    let ok = true;
    for (let i = p; i < n && ok; i += p) ok = same(K, 0, i, p);
    if (ok) return [{ t: "block", keys: K.slice(0, p), times: n / p }];
  }
  let best: { s: number; p: number; k: number; cov: number } | undefined;
  for (let s = 0; s < n; s++) {
    for (let p = 2; p <= (n - s) / 2; p++) {
      if (distinct(K.slice(s, s + p)) < 2) continue;
      let k = 1;
      while (s + (k + 1) * p <= n && same(K, s, s + k * p, p)) k++;
      if (k >= 2 && (!best || p * k > best.cov)) best = { s, p, k, cov: p * k };
    }
  }
  if (best && best.cov >= Math.max(4, n / 2)) {
    return [
      ...runs(K.slice(0, best.s)),
      { t: "block", keys: K.slice(best.s, best.s + best.p), times: best.k },
      ...runs(K.slice(best.s + best.cov)),
    ];
  }
  return runs(K);
}

const isStart = (k: string): boolean => k === "CH0";
const isEnd = (k: string): boolean => k === "JOIN" || k === "SL";

/**
 * Cadeias de uma volta, regra do gráfico v3 (§4.4): o início (corr*) e o fim (fechamento) ficam fora; no miolo, o menor
 * período de 2 a 4 pontos que, repetido k ≥ 2 vezes, cobre o miolo inteiro vira `(bloco) ×k`; senão, corridas de pontos
 * iguais. Marcadores (`M:`) não entram.
 */
export function chainSegs(keys: string[]): Seg[] {
  const K = keys.filter((k) => !k.startsWith("M:"));
  let s = 0;
  while (s < K.length && isStart(K[s] as string)) s++;
  let e = K.length;
  while (e > s && isEnd(K[e - 1] as string)) e--;
  const mid = K.slice(s, e);
  let middle: Seg[] = runs(mid);
  for (let p = 2; p <= 4; p++) {
    if (mid.length % p !== 0 || mid.length / p < 2 || distinct(mid.slice(0, p)) < 2) continue;
    if (same(mid, 0, p, mid.length - p)) {
      middle = [{ t: "block", keys: mid.slice(0, p), times: mid.length / p }];
      break;
    }
  }
  return [...runs(K.slice(0, s)), ...middle, ...runs(K.slice(e))];
}
