// SPDX-License-Identifier: GPL-3.0-or-later
// Hash de texto (FNV-1a de 32 bits) para chaves estruturais de volta.

export function hashKey(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
