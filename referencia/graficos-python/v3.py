#!/usr/bin/env python3
"""Versão 3 dos gráficos: faixas de pb seguidos, contagem "Nx" no 1º ponto,
tabela "Receita volta a volta" com símbolo + abreviação e faixa de marcas."""
import math
import chart
from chart import *

ABR = {"pb": "pb", "aum": "aum", "dim": "dim", "d4": "pb4jun", "ch0": "corr*", "ch": "corr",
       "pbx": "pbx", "pbxj": "pbx", "am": "am", "toe": "dedo", "unw": "não trab.", "mpa": "mpa"}
MINRUN = 5
PENDING = []                      # rótulos "Nx" da página atual

# ------------------------------------------------------------------ sequências de pb
def find_runs(items, minrun=MINRUN):
    runs, cur = [], []
    for it in items:
        if it.typ == "pb": cur.append(it)
        else:
            if len(cur) >= minrun: runs.append(cur)
            cur = []
    if len(cur) >= minrun: runs.append(cur)
    return runs

def band_arc(s, c, r, a0, a1, col):
    pts = [frame(c, r, a0 + (a1 - a0) * i / 60)[0] for i in range(61)]
    s.add('<path d="M ' + " L ".join(f"{p[0]:.2f} {p[1]:.2f}" for p in pts) +
          f'" fill="none" stroke="{col}" stroke-opacity="0.17" stroke-width="5.0" stroke-linecap="round"/>')

def band_line(s, p, q, col):
    s.add(f'<line x1="{p[0]:.2f}" y1="{p[1]:.2f}" x2="{q[0]:.2f}" y2="{q[1]:.2f}" stroke="{col}" '
          f'stroke-opacity="0.17" stroke-width="5.0" stroke-linecap="round"/>')

def run_bands(s, c, r, items, col):
    """desenhar ANTES dos símbolos"""
    for run in find_runs(items):
        band_arc(s, c, r, run[0].a - 1.2 / r, run[-1].a + 1.2 / r, col)

def run_labels(s, c, r, items, col):
    for run in find_runs(items):
        PENDING.append((frame(c, r, run[0].a), r, run[0].a, f"{len(run)}x", col, c))

def count_tag(s, m, txt, col):
    w = 1.45 * len(txt) + 1.4
    s.add(f'<rect x="{m[0]-w/2:.2f}" y="{m[1]-1.2:.2f}" width="{w:.2f}" height="2.4" rx="1.2" fill="white" stroke="{col}" stroke-width="0.25"/>')
    s.text(m[0], m[1] + 0.78, txt, 2.1, col, "middle", True)

def place_labels(s, all_pts):
    """coloca cada "Nx" do lado (fora/dentro do anel) com mais folga, sem encostar em outro rótulo"""
    all_pts = list(all_pts)
    for _, r, a, txt, col, c in PENDING:
        best = None
        for dr in (3.1, -3.1, 2.6, -2.6):
            m = frame(c, r + dr, a)[0]
            d = min((math.hypot(m[0] - q[0], m[1] - q[1]) for q in all_pts), default=9)
            if best is None or d > best[0]: best = (d, m)
        count_tag(s, best[1], txt, col)
        m = best[1]; all_pts += [(m[0] + dx, m[1]) for dx in (-2.5, 0, 2.5)]
    PENDING.clear()

def ring_points(c, rings):
    return [frame(c, it.r, it.a)[0] for items in rings for it in items
            if getattr(it, "a", None) is not None and getattr(it, "r", None) is not None]

# ------------------------------------------------------------------ tabela de receita
def units(items, first_am=False):
    out = ["am"] if first_am else []
    seen = set()
    for it in items:
        if it.typ == "aum":
            k = id(it.parents[0])
            if k in seen: continue
            seen.add(k); out.append("aum")
        elif it.typ == "pbx" and not it.parents:
            out.append("pbxj")                           # pbx que fecha a volta
        elif it.typ == "mark":
            out.append(("mark", it.text[0]))
        else:
            out.append(it.typ)
    return out

def rle(us):
    L = []
    for u in us:
        if L and L[-1][0] == u and u not in ("am",) and not isinstance(u, tuple): L[-1][1] += 1
        else: L.append([u, 1])
    return [tuple(x) for x in L]

def compress(L):
    """separa início (am, corr*) e fim (pbx de fechamento) e procura repetição no meio"""
    i, j = 0, len(L)
    while i < j and L[i][0] in ("am", "ch0") and L[i][1] == 1: i += 1
    while j > i and L[j - 1][0] == "pbxj": j -= 1
    head, body, tail = L[:i], L[i:j], L[j:]
    n = len(body)
    for p in range(1, 5):
        if n % p == 0 and n // p >= 2 and body == body[:p] * (n // p):
            return head, body[:p], n // p, tail
    return head, body, 1, tail

def tokens_of(items, first_am=False):
    return compress(rle(units(items, first_am)))

def tsym(s, key, cx, cy, col):
    """símbolo pequeno para a tabela; devolve a largura ocupada"""
    U, T = (0, -1), (1, 0)
    if key == "pb": sym_pb(s, (cx, cy), U, T, col, 0.85)
    elif key == "aum": sym_inc(s, (cx, cy + 2.0), [(cx - 2.0, cy - 1.9), (cx + 2.0, cy - 1.9)], col)
    elif key == "dim": sym_tog(s, (cx, cy - 1.9), [(cx - 1.9, cy + 1.9), (cx + 1.9, cy + 1.9)], col)
    elif key == "d4": sym_tog(s, (cx, cy - 1.9), [(cx + d, cy + 1.9) for d in (-3.6, -1.2, 1.2, 3.6)], col)
    elif key in ("ch0", "ch"): sym_ch(s, (cx, cy), U, T, col)
    elif key in ("pbx", "pbxj"): sym_pbx(s, (cx, cy), col)
    elif key == "mpa":
        s.line((cx, cy - 2.1), (cx, cy + 2.1), col); s.line((cx - 1.5, cy - 2.1), (cx + 1.5, cy - 2.1), col)
    elif key == "am":
        s.add(f'<circle cx="{cx}" cy="{cy}" r="2.2" fill="none" stroke="{col}" stroke-width="0.45"/>')
    elif key == "toe":
        for dy in (-1.2, 1.2):
            s.add(f'<ellipse cx="{cx}" cy="{cy+dy}" rx="0.6" ry="1.15" fill="none" stroke="{col}" stroke-width="0.35"/>')
        s.line((cx + 1.6, cy - 2.0), (cx + 1.6, cy + 2.0), col, 0.35)
    elif key == "unw":
        s.add(f'<circle cx="{cx}" cy="{cy}" r="1.8" fill="none" stroke="{ADAPT}" stroke-width="0.45" stroke-dasharray="1.0 0.7"/>')
    return {"d4": 9.0, "am": 5.6}.get(key, 5.2)

class Null:                                   # svg "de mentira" para medir
    def add(self, *a, **k): pass
    def text(self, *a, **k): pass
    def line(self, *a, **k): pass

def _row(s, x0, y, lab, col, toks, tot, extra, adapt, plain, RH=5.6, LH=4.7, W=186):
    """desenha (ou mede, se s for Null) uma linha; devolve a altura"""
    x = x0 + 17; maxx = x0 + W - 20; cy = y + RH / 2; lines = 1
    def need(w):
        nonlocal x, cy, lines
        if x + w > maxx:
            x = x0 + 17; cy += LH; lines += 1
    if plain:
        s.add(f'<line x1="{x}" y1="{cy}" x2="{x+7}" y2="{cy}" stroke="{LINK}" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>')
        x += 9
    head, body, times, *rest = toks
    tail = rest[0] if rest else []
    def emit(tok, last):
        nonlocal x
        key, n = tok
        if isinstance(key, tuple):                      # marcador (ex.: perna 2)
            w = 1.55 * len(key[1]) + 3; need(w)
            s.text(x, cy + 0.95, "| " + key[1] + ":", 2.6, "#333333", bold=True); x += w; return
        if key == "am":
            need(12); tsym(s, "am", x + 2.4, cy, col); s.text(x + 5.6, cy + 0.95, "am:", 2.7, BLACK, bold=True); x += 12; return
        ab = ABR[key]
        w = 1.8 * len(f"{n}x") + 1.3 + {"d4": 9.0}.get(key, 5.2) + 0.4 + 1.6 * len(ab) + (3.0 if not last else 1.2)
        need(w)
        s.text(x, cy + 0.95, f"{n}x", 2.7, BLACK, bold=True); x += 1.8 * len(f"{n}x") + 1.3
        wsym = tsym(s, key, x + (4.0 if key == "d4" else 2.3), cy, col); x += wsym + 0.4
        s.text(x, cy + 0.95, ab + ("" if last else ";"), 2.7, BLACK); x += 1.6 * len(ab) + (3.0 if not last else 1.2)
    for tk in head: emit(tk, False)
    if times > 1:
        need(1.6); s.text(x, cy + 1.0, "(", 3.4, BLACK); x += 1.6
    for i, tk in enumerate(body): emit(tk, i == len(body) - 1 and not (tail and times == 1))
    if times > 1:
        need(9); s.text(x, cy + 1.0, f") ×{times}" + (";" if tail else ""), 3.0, BLACK, bold=True); x += 11 if tail else 9
    for i, tk in enumerate(tail): emit(tk, i == len(tail) - 1)
    if extra:
        w = 1.4 * len(extra) + 2; need(w)
        s.text(x + 1.5, cy + 0.95, extra, 2.4, "#555555", italic=True)
    h = RH + LH * (lines - 1)
    if not isinstance(s, Null):
        my = y + RH / 2
        w = pill(s, (x0 + 7, my), lab, col, 2.6 if len(str(lab)) < 5 else 2.2)
        if adapt:
            s.add(f'<rect x="{x0+7-w/2-0.8:.2f}" y="{my-3.05:.2f}" width="{w+1.6:.2f}" height="6.1" rx="3.05" fill="none" stroke="{ADAPT}" stroke-width="0.45"/>')
            s.text(x0 + 7 + w / 2 + 1.6, my - 1.6, "*", 3.8, ADAPT, "middle", True)
        s.text(x0 + W - 9, my + 0.95, f"({tot})", 2.7, col, "middle", True)
        s.add(f'<line x1="{x0}" y1="{y+h}" x2="{x0+W}" y2="{y+h}" stroke="#d6d6d6" stroke-width="0.2"/>')
    return h

TABLE_HEAD = 7.5
def table_height(rows):
    return TABLE_HEAD + sum(_row(Null(), 12, 0, *r) for r in rows)

def recipe_table(s, x0, y0, rows, title="Receita volta a volta", W=186):
    """rows: (rótulo, cor, tokens, total, extra, adapt, plain)"""
    s.text(x0, y0, title, 3.4, BLACK, bold=True)
    if W > 120:
        s.text(x0 + 4.0 + 2.05 * len(title), y0, "símbolo + abreviação, na ordem em que os pontos são feitos", 2.5, "#555555")
    y = y0 + 2.5
    s.add(f'<rect x="{x0}" y="{y}" width="{W}" height="5.0" fill="#eeeeee"/>')
    for cx, h in ((x0 + 1.5, "Volta"), (x0 + 17, "Sequência de pontos"), (x0 + W - 14, "Total")):
        s.text(cx, y + 3.5, h, 2.7, BLACK, bold=True)
    y += 5.0
    for r in rows:
        y += _row(s, x0, y, *r, W=W)
    return y

def plain_row(text, col="#9a9a9a", joined=False, extra=""):
    """linha da tabela para um anel tracejado "3–5 · 9 pb [resto]" """
    lab, rest = [t.strip() for t in text.split("·", 1)]
    n = int(rest.split()[0]); more = rest.split(" ", 2)[2] if len(rest.split(" ", 2)) > 2 else ""
    head = [("ch0", 1)] if joined else []; tail = [("pbxj", 1)] if joined else []
    return (lab, col, (head, [("pb", n)], 1, tail), n, (more + ("; " if more and extra else "") + extra).strip(), False, True)

# ------------------------------------------------------------------ faixa das marcas (o que não é ponto)
def mark_strip(s, x0, y, keys, xmax=175):
    x = x0 + 2
    for k in keys:
        if k == "ini": start_mark(s, (x + 0.4, y), (1, 0)); t = "primeiro ponto"; dx = 4
        elif k == "fim": end_mark(s, (x, y)); t = "último ponto"; dx = 3.5
        elif k == "lig": s.line((x - 2, y + 1.6), (x + 2, y - 1.6), LINK, 0.3); t = "ligação ao ponto de baixo"; dx = 3.5
        elif k == "liso":
            s.add(f'<line x1="{x-3}" y1="{y}" x2="{x+3}" y2="{y}" stroke="{LINK}" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>')
            t = "volta só de pb"; dx = 4.5
        elif k == "run":
            x += 3
            s.add(f'<line x1="{x-3}" y1="{y}" x2="{x+3}" y2="{y}" stroke="{ALT[0]}" stroke-opacity="0.17" stroke-width="4.4" stroke-linecap="round"/>')
            count_tag(s, (x + 7.6, y), "15x", ALT[0]); x += 10.6; t = "pb seguidos"; dx = 1.8
        elif k == "ref": sym_pb(s, (x, y), (0, -1), (1, 0), GREY, 0.8); t = "ponto de outra volta (referência)"; dx = 3.5
        elif k == "unw": mark_adapt(s, (x, y), 2.0, dashed=True, star=False); t = "ponto não trabalhado"; dx = 3.5
        s.text(x + dx, y + 0.9, t, 2.5)
        x += dx + 1.5 * len(t) + 6
        if x > xmax and k != keys[-1]:
            x = x0 + 2; y += 6
    return y

def strip_keys(has_plain=True, extra=()):
    return ["ini", "fim", "lig"] + (["liso"] if has_plain else []) + ["run"] + list(extra)

NOTE_RUN = "Etiqueta = número e início da volta; (n) = total. Faixa clara = pb seguidos (5 ou mais); o número fica no 1º ponto."
