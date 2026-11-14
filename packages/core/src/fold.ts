// SPDX-License-Identifier: GPL-3.0-or-later
// Dobra de sequências de pontos iguais em corridas e blocos "(bloco) ×k". Vive no core para o impressor, o tutorial e a
// tabela do gráfico usarem a mesma regra (anexo v3 do gráfico, D-62).

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

export interface ChainRun {
  key: string;
  count: number;
}
/** Linha de uma volta no formato do gráfico v3: início, bloco repetido k vezes (ou o miolo por extenso) e fim. */
export interface Chains {
  head: ChainRun[];
  body: ChainRun[];
  times: number;
  tail: ChainRun[];
}

/** O que é início (corrente que não conta) e fim (pontos baixíssimos que fecham a volta) numa lista de chaves. */
export interface ChainRules {
  isStart: (key: string) => boolean;
  isEnd: (key: string) => boolean;
}

/** Chaves dos átomos da receita (`atomKey`). */
export const ATOM_RULES: ChainRules = {
  isStart: (k) => k === "CH0",
  isEnd: (k) => k === "SL" || k === "SL0" || k === "JOIN" || k === "SLINTO",
};

const sameRun = (a: ChainRun, b: ChainRun): boolean => a.key === b.key && a.count === b.count;

/** Menor período de 1 a 4 corridas que, repetido k ≥ 2 vezes, cobre o miolo inteiro. */
function period(body: ChainRun[]): { unit: ChainRun[]; times: number } | undefined {
  const n = body.length;
  for (let p = 1; p <= 4; p++) {
    if (n % p !== 0 || n / p < 2) continue;
    if (body.every((r, x) => sameRun(r, body[x % p] as ChainRun)))
      return { unit: body.slice(0, p), times: n / p };
  }
  return undefined;
}

/**
 * Regra de `compress` do v3.py (§4.4 do anexo): separa o início (itens de contagem 1) e o fim, junta pontos iguais em
 * corridas e, no miolo, procura o menor período de 1 a 4 corridas que, repetido k ≥ 2 vezes, cobre o miolo inteiro.
 * O fim (`rules.isEnd`) é o maior grupo de pontos baixíssimos finais que deixa o miolo dobrar; se nenhum deixa, todos ficam no fim.
 * Marcadores (`M:`) não entram.
 */
export function chainsOf(keys: string[], rules: ChainRules = ATOM_RULES): Chains {
  const { isStart, isEnd } = rules;
  const L: ChainRun[] = [];
  for (const key of keys) {
    if (key.startsWith("M:")) continue;
    const last = L[L.length - 1];
    if (last && last.key === key) last.count++;
    else L.push({ key, count: 1 });
  }
  let i = 0;
  // o v3.py só aceita itens de início com contagem 1; aqui "2 corr (não conta)" também fica no início (`2x corr*`)
  while (i < L.length && isStart((L[i] as ChainRun).key)) i++;
  let maxTail = 0;
  // o período máximo é 4 corridas: um fim maior que isso não muda o resultado e deixava a busca quadrática
  while (maxTail < 4 && L.length - maxTail > i && isEnd((L[L.length - 1 - maxTail] as ChainRun).key))
    maxTail++;
  const head = L.slice(0, i);
  // fim por corridas inteiras: "2x pbx" no fim é uma corrida só
  for (let t = maxTail; t >= 0; t--) {
    const found = period(L.slice(i, L.length - t));
    if (found) return { head, body: found.unit, times: found.times, tail: L.slice(L.length - t) };
  }
  return { head, body: L.slice(i, L.length - maxTail), times: 1, tail: L.slice(L.length - maxTail) };
}
