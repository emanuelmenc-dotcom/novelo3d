#!/usr/bin/env python3
"""Gerador de gráficos de crochê (símbolos Craft Yarn Council) em SVG A4."""
import math, subprocess, sys
from pypdf import PdfWriter

BLACK = "#1a1a1a"; GREY = "#9a9a9a"; ADAPT = "#c2185b"; LINK = "#8c8c8c"
ALT = ["#1b4f8a", "#b4521a"]          # cores alternadas (iniciante)
START = "#1e8449"
FONT = "DejaVu Sans, Arial, sans-serif"
W = {"pb": 4.7, "aum": 4.7, "dim": 5.2, "d4": 8.6, "ch": 5.4, "ch0": 5.4, "pbx": 3.2, "toe": 10.0, "unw": 5.0, "mark": 30.0}

# ---------------------------------------------------------------- modelo
class Item:
    def __init__(s, typ, parents=(), counted=True):
        s.typ, s.parents, s.counted, s.a = typ, list(parents), counted, None

def build(prev, tokens):
    """Expande os tokens de uma volta consumindo os pontos da volta anterior."""
    items, cur = [], 0
    def nxt(counted=True):
        nonlocal cur
        while prev[cur].counted != counted:
            cur += 1
        cur += 1
        return prev[cur - 1]
    for tok in tokens:
        t, n = tok if isinstance(tok, tuple) else (tok, 1)
        if t == "toe":
            it = Item("toe", counted=False); it.n = n; it.adapt = False; items.append(it); continue
        if t == "mark":
            it = Item("mark", counted=False); it.text = n; items.append(it); continue
        for _ in range(n):
            if t == "pb":    items.append(Item("pb", [nxt()]))
            elif t == "aum":
                p = nxt(); items += [Item("aum", [p]), Item("aum", [p])]
            elif t == "dim": items.append(Item("dim", [nxt(), nxt()]))
            elif t == "d4":  items.append(Item("d4", [nxt() for _ in range(4)]))
            elif t == "ch0": items.append(Item("ch0", counted=False))
            elif t == "ch":  items.append(Item("ch"))
            elif t == "skip": nxt()
            elif t == "slch": items.append(Item("pbx", [nxt(False)], counted=False))
            elif t == "sl":   items.append(Item("pbx", [nxt()], counted=False))
            elif t == "sl0":  items.append(Item("pbx", counted=False))
            elif t == "unw":  items.append(Item("unw", [nxt()], counted=False))
            else: raise ValueError(t)
    rest = [p for p in prev[cur:] if p.counted]
    assert not rest, f"sobraram {len(rest)} pontos"
    return items

STRICT = False      # True = método híbrido: pernas no ponto-base + linhas de ligação
STRICT_LAYOUT = False   # True = posições presas ao ponto-base (acumula desvio)
PULL = 0.12
LINK_MIN = 3.0      # mm: deslocamento a partir do qual a linha de ligação é desenhada

def count(items): return sum(1 for i in items if i.counted)

def layout(items, r, label_w, first=False, rot=0.0):
    """Atribui ângulos: alinhado aos pontos-base, com separação mínima."""
    n = len(items)
    seq = items + [None]                                   # None = rótulo da volta
    tg = []
    if first:
        tg = [rot + 2 * math.pi * (i + 0.9) / (n + 0.8) for i in range(n)] + [None]
    else:
        seen = {}
        for it in seq:
            if it is None or not it.parents:
                tg.append(None); continue
            ref = it.parents[0].a
            vals = [ref + ((p.a - ref + math.pi) % (2 * math.pi) - math.pi) for p in it.parents]
            a = sum(vals) / len(vals)
            if it.typ == "aum":
                k = seen.get(id(it.parents[0]), 0); seen[id(it.parents[0])] = k + 1
                a += (-1 if k == 0 else 1) * 2.45 / r
            tg.append(a)
    # desdobrar
    known = [i for i, t in enumerate(tg) if t is not None]
    last = None
    for i in known:
        if last is not None:
            while tg[i] < last - math.pi: tg[i] += 2 * math.pi
            while tg[i] > last + math.pi: tg[i] -= 2 * math.pi
        last = tg[i]
    # interpolar itens sem ponto-base
    m = len(seq)
    tg0 = tg[:]
    for i in range(m):
        if tg0[i] is None:
            los = [k for k in known if k < i]
            if los: lo, lv = los[-1], tg[los[-1]]
            else:   lo, lv = known[-1] - m, tg[known[-1]] - 2 * math.pi
            his = [k for k in known if k > i]
            if his: hi, hv = his[0], tg[his[0]]
            else:   hi, hv = m + known[0], tg[known[0]] + 2 * math.pi
            tg[i] = lv + (hv - lv) * (i - lo) / (hi - lo)
    # unidades de layout: o par de pb de um aumento anda junto
    units, i = [], 0
    while i < m:
        it = seq[i]
        if it is not None and it.typ == "aum" and i + 1 < m and seq[i + 1] is not None \
           and seq[i + 1].typ == "aum" and seq[i + 1].parents[0] is it.parents[0]:
            units.append(([i, i + 1], (tg[i] + tg[i + 1]) / 2, 2 * W["aum"])); i += 2
        else:
            units.append(([i], tg[i], label_w if it is None else W[it.typ])); i += 1
    m2 = len(units)
    ut = [u[1] for u in units]
    wd = [u[2] / r for u in units]
    tot = sum(wd)
    if tot > 2 * math.pi * 0.995:
        wd = [w * 2 * math.pi * 0.995 / tot for w in wd]
    x = ut[:]
    for itn in range(4000):
        pull = (0.25 if STRICT_LAYOUT else (PULL if STRICT else 0.02)) if itn < 3600 else 0.0
        if pull and not STRICT_LAYOUT:                            # suaviza o espaçamento entre vizinhos
            nx = x[:]
            for i in range(m2):
                a = x[i - 1] - (2 * math.pi if i == 0 else 0)
                b = x[(i + 1) % m2] + (2 * math.pi if i == m2 - 1 else 0)
                # ponto médio do vão livre entre os vizinhos
                mid = ((a + wd[i - 1] / 2) + (b - wd[(i + 1) % m2] / 2)) / 2
                nx[i] = x[i] + 0.35 * (mid - x[i])
            x = nx
        for i in range(m2):
            j = (i + 1) % m2
            off = 2 * math.pi if j == 0 else 0
            need = (wd[i] + wd[j]) / 2
            gap = x[j] + off - x[i]
            if gap < need:
                d = (need - gap) / 2
                x[i] -= d; x[j] += d
        if pull:
            x = [xi + pull * (t - xi) for xi, t in zip(x, ut)]
    lab = None
    for it in items: it.r = r
    for (idx, _, _), xa in zip(units, x):
        if len(idx) == 2:
            seq[idx[0]].a = xa - 2.35 / r; seq[idx[1]].a = xa + 2.35 / r
        elif seq[idx[0]] is None: lab = xa
        else: seq[idx[0]].a = xa
    return lab


# ---------------------------------------------------------------- desenho
class Svg:
    def __init__(s): s.o = []
    def add(s, t): s.o.append(t)
    def line(s, p, q, col, w=0.45):
        s.add(f'<line x1="{p[0]:.2f}" y1="{p[1]:.2f}" x2="{q[0]:.2f}" y2="{q[1]:.2f}" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>')
    def text(s, x, y, t, size=3, col=BLACK, anchor="start", bold=False, italic=False):
        st = f'font-family="{FONT}" font-size="{size}" fill="{col}" text-anchor="{anchor}"'
        if bold: st += ' font-weight="bold"'
        if italic: st += ' font-style="italic"'
        s.add(f'<text x="{x:.2f}" y="{y:.2f}" {st}>{t}</text>')
    def out(s):
        return ('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">\n'
                '<rect width="210" height="297" fill="white"/>\n' + "\n".join(s.o) + "\n</svg>\n")

def frame(c, r, a):
    """ponto no anel e vetores (para fora, tangente no sentido do trabalho)"""
    u = (math.cos(a), -math.sin(a)); t = (-math.sin(a), -math.cos(a))
    return (c[0] + r * u[0], c[1] + r * u[1]), u, t

def clampd(d, lim):
    d = (d + math.pi) % (2 * math.pi) - math.pi
    return max(-lim, min(lim, d))

def loc(o, u, t, x, y): return (o[0] + x * t[0] + y * u[0], o[1] + x * t[1] + y * u[1])

def sym_pb(s, o, u, t, col, k=1.0):
    h = 2.1 * k
    s.line(loc(o, u, t, -h * .8, -h), loc(o, u, t, h * .8, h), col)
    s.line(loc(o, u, t, h * .8, -h), loc(o, u, t, -h * .8, h), col)

def sym_mpa(s, o, u, t, col):
    s.line(loc(o, u, t, 0, -3.0), loc(o, u, t, 0, 3.0), col)
    s.line(loc(o, u, t, -1.7, 3.0), loc(o, u, t, 1.7, 3.0), col)

def sym_ch(s, o, u, t, col):
    ang = math.degrees(math.atan2(t[1], t[0]))
    s.add(f'<ellipse cx="{o[0]:.2f}" cy="{o[1]:.2f}" rx="2.3" ry="0.75" fill="none" stroke="{col}" stroke-width="0.42" transform="rotate({ang:.1f} {o[0]:.2f} {o[1]:.2f})"/>')

def sym_pbx(s, o, col):
    s.add(f'<circle cx="{o[0]:.2f}" cy="{o[1]:.2f}" r="0.95" fill="{col}"/>')

def sym_tog(s, apex, bases, col):
    """sc2tog / sc3tog / 4 juntos: pernas que se unem no topo, traço em cada perna"""
    for b in bases:
        s.line(b, apex, col)
        d = (apex[0] - b[0], apex[1] - b[1]); L = math.hypot(*d)
        m = (b[0] + d[0] * .27, b[1] + d[1] * .27)
        nrm = (-d[1] / L * 1.05, d[0] / L * 1.05)
        s.line((m[0] - nrm[0], m[1] - nrm[1]), (m[0] + nrm[0], m[1] + nrm[1]), col)

def sym_inc(s, base, tips, col):
    """aumento: 2 pb no mesmo ponto — pernas que saem da mesma base, traço em cada perna"""
    for tp in tips:
        s.line(base, tp, col)
        d = (tp[0] - base[0], tp[1] - base[1]); L = math.hypot(*d)
        m = (base[0] + d[0] * .62, base[1] + d[1] * .62)
        nrm = (-d[1] / L * 1.25, d[0] / L * 1.25)
        s.line((m[0] - nrm[0], m[1] - nrm[1]), (m[0] + nrm[0], m[1] + nrm[1]), col)

def sym_am(s, c, col):
    s.add(f'<circle cx="{c[0]}" cy="{c[1]}" r="3.3" fill="none" stroke="{col}" stroke-width="0.45"/>')
    s.add(f'<path d="M {c[0]+3.3} {c[1]} q 1.6 1.2 0.6 3.0" fill="none" stroke="{col}" stroke-width="0.45" stroke-linecap="round"/>')

def draw_ring(s, c, r, items, col, guide=True, inward=False):
    """inward=True: gráfico de fora para dentro (volta anterior fica do lado de fora)"""
    g = -1 if inward else 1                                # lado da volta seguinte
    if guide:
        s.add(f'<circle cx="{c[0]}" cy="{c[1]}" r="{r:.2f}" fill="none" stroke="#cfcfcf" stroke-width="0.22"/>')
    aum_done = {}
    lk = lambda p: frame(c, p.r + g * 2.5, p.a)[0]         # ponto de encaixe no ponto de baixo
    if STRICT:                                             # linhas de ligação só onde o ponto foi deslocado
        for it in items:
            if it.typ in ("pb", "pbx", "unw") and it.parents:
                p = it.parents[0]
                if abs(clampd(it.a - p.a, 9)) * min(r, p.r) > LINK_MIN:
                    s.line(frame(c, r - g * 2.5, it.a)[0], lk(p), LINK, 0.3)
    for it in items:
        o, u, t = frame(c, r, it.a)
        if it.typ == "pb": sym_pb(s, o, u, t, col)
        elif it.typ in ("ch", "ch0"): sym_ch(s, o, u, t, col)
        elif it.typ == "pbx": sym_pbx(s, o, col)
        elif it.typ == "aum":
            k = id(it.parents[0])
            if k in aum_done:                              # par completo: "V" com um traço em cada perna
                a1 = aum_done[k]; am = (a1 + it.a) / 2
                pa = it.parents[0]
                if STRICT and abs(clampd(pa.a - am, 9)) * r <= 2.6:
                    base, _, _ = frame(c, r - g * 2.6, pa.a)
                else:
                    base, _, _ = frame(c, r - g * 2.4, am)
                    if STRICT: s.line(base, lk(pa), LINK, 0.3)
                sym_inc(s, base, [frame(c, r + g * 2.2, aa)[0] for aa in (a1, it.a)], col)
            else: aum_done[k] = it.a
        elif it.typ == "toe": draw_toe(s, o, u, t, it.n, col, it.adapt)
        elif it.typ == "unw": mark_adapt(s, o, 2.6, dashed=True)
        elif it.typ == "mark": draw_label(s, c, r, it.a, it.text[0], it.text[1], col, True)
        elif it.typ in ("dim", "d4"):
            apex, _, _ = frame(c, r + g * 2.3, it.a)
            offs = (-2.1, 2.1) if it.typ == "dim" else (-4.2, -1.4, 1.4, 4.2)
            rb = r - g * 2.5                               # raio onde as pernas pousam
            if STRICT:                                     # pernas pousam nos pontos-base reais, se estiverem perto
                ds = [clampd(p.a - it.a, 9) for p in it.parents]
                cap = 3.8 if it.typ == "dim" else 7.0
                if max(abs(d) for d in ds) * rb <= cap:
                    for q in range(1, len(ds)): ds[q] = max(ds[q], ds[q - 1] + 1.8 / rb)
                    bases = [frame(c, rb, it.a + d)[0] for d in ds]
                else:                                      # longe: símbolo normal + linhas de ligação
                    bases = [frame(c, rb, it.a + d / r)[0] for d in offs]
                    for bpt, p in zip(bases, it.parents):
                        s.line(bpt, lk(p), LINK, 0.3)
            else:
                bases = [frame(c, r - 2.3, it.a + d / r)[0] for d in offs]
            sym_tog(s, apex, bases, col)

def pill(s, p, txt, col, size=2.7):
    w = max(4.5, 1.75 * len(str(txt)) + 2.6)
    s.add(f'<rect x="{p[0]-w/2:.2f}" y="{p[1]-2.25:.2f}" width="{w:.2f}" height="4.5" rx="2.25" fill="{col}"/>')
    s.text(p[0], p[1] + 0.95, str(txt), size, "white", "middle", True)
    return w

def mark_adapt(s, p, rad=2.9, dashed=False, star=True):
    da = ' stroke-dasharray="1.2 0.8"' if dashed else ""
    s.add(f'<circle cx="{p[0]:.2f}" cy="{p[1]:.2f}" r="{rad}" fill="none" stroke="{ADAPT}" stroke-width="0.5"{da}/>')
    if star: s.text(p[0] + rad * 0.85, p[1] - rad * 0.55, "*", 4.2, ADAPT, "middle", True)

def draw_toe(s, o, u, t, n, col, adapt=False):
    """dedo: n corr para fora, (n-1) pb voltando pela corrente, pbx na base"""
    cc = ADAPT if adapt else col
    for i in range(n):
        sym_ch(s, loc(o, u, t, -2.1, 2.6 + i * 4.9), u, u, cc)
    for i in range(n - 1):
        sym_pb(s, loc(o, u, t, 2.3, 2.6 + i * 4.9), u, t, col, 0.9)
    sym_pbx(s, loc(o, u, t, 2.3, -1.6), col)
    if adapt:
        tip = loc(o, u, t, -2.1, 2.6 + (n - 1) * 4.9 + 4.2)
        s.text(tip[0], tip[1] + 1.4, "*", 4.2, ADAPT, "middle", True)

def draw_label(s, c, r, a, num, cnt, col, beginner=True, adapt=False):
    """rótulo da volta: (total) à esquerda = fim da volta; etiqueta colorida = início da volta"""
    o, u, t = frame(c, r, a)
    w = max(4.5, 1.75 * len(str(num)) + 2.6)
    cw = (1.3 * (len(str(cnt)) + 2) + 1.2) if cnt != "" else 0
    x0 = -(w + cw) / 2                                     # centraliza o conjunto no vão
    if cnt != "":
        q = loc(o, u, t, x0 + cw / 2 - 0.6, 0)
        s.text(q[0], q[1] + 0.8, f"({cnt})", 2.3, col, "middle")
    p = loc(o, u, t, x0 + cw + w / 2, 0)
    pill(s, p, num, col)
    if adapt:
        s.add(f'<rect x="{p[0]-w/2-0.9:.2f}" y="{p[1]-3.15:.2f}" width="{w+1.8:.2f}" height="6.3" rx="3.15" fill="none" stroke="{ADAPT}" stroke-width="0.5"/>')
        s.text(p[0] + w / 2 + 1.6, p[1] - 1.8, "*", 4.2, ADAPT, "middle", True)

def arrow(s, c, r, a0, a1, col):
    pts = [frame(c, r, a0 + (a1 - a0) * i / 30)[0] for i in range(31)]
    s.add('<path d="M ' + " L ".join(f"{p[0]:.2f} {p[1]:.2f}" for p in pts) + f'" fill="none" stroke="{col}" stroke-width="0.6"/>')
    o, u, t = frame(c, r, a1)
    h = [loc(o, u, t, 0.8, 0), loc(o, u, t, -2.4, 1.4), loc(o, u, t, -2.4, -1.4)]
    s.add('<polygon points="' + " ".join(f"{p[0]:.2f},{p[1]:.2f}" for p in h) + f'" fill="{col}"/>')

# ---------------------------------------------------------------- legenda / tabela
LEG = {
 "am":  "anel mágico (am) — símbolo próprio",
 "corr": "corrente (corr)",
 "pbx": "ponto baixíssimo (pbx)",
 "pb":  "ponto baixo (pb)",
 "aum": "aumento (aum): 2 pb no mesmo ponto da volta anterior",
 "dim": "diminuição (dim): 2 pb fechados juntos (2 pontos da volta anterior)",
 "d4":  "4 pb fechados juntos (pb4jun) — símbolo próprio",
 "ref": "ponto da volta anterior (referência)",
 "mpa": "meio ponto alto (mpa)",
 "lig": "linha de ligação ao ponto de baixo",
 "ini": "primeiro ponto do diagrama (começar aqui)",
 "fim": "último ponto do diagrama",
 "liso": "anel tracejado: voltas só de pb",
 "unw": "ponto não trabalhado (adaptação)",
}
def legend(s, x0, y0, keys, colw=93, ncol=2):
    s.text(x0, y0, "Legenda", 3.4, BLACK, bold=True)
    U, T = (0, -1), (1, 0)
    for i, k in enumerate(keys):
        cx = x0 + 5 + (i % ncol) * colw; cy = y0 + 6.5 + (i // ncol) * 7.6
        o = (cx, cy)
        if k == "am": sym_am(s, o, BLACK)
        elif k == "corr": sym_ch(s, o, U, T, BLACK)
        elif k == "pbx": sym_pbx(s, o, BLACK)
        elif k == "pb": sym_pb(s, o, U, T, BLACK)
        elif k == "ref": sym_pb(s, o, U, T, GREY, 0.85)
        elif k == "mpa": sym_mpa(s, o, U, T, BLACK)
        elif k == "ini": start_mark(s, (cx + 0.4, cy), (1, 0))
        elif k == "fim": end_mark(s, (cx, cy))
        elif k == "lig": s.line((cx - 2.5, cy + 2.2), (cx + 2.5, cy - 2.2), LINK, 0.3)
        elif k == "liso": s.add(f'<line x1="{cx-3.5}" y1="{cy}" x2="{cx+3.5}" y2="{cy}" stroke="{LINK}" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>')
        elif k == "unw": mark_adapt(s, o, 2.4, dashed=True, star=False)
        elif k == "aum":
            sym_inc(s, (cx, cy + 2.4), [(cx - 2.35, cy - 2.2), (cx + 2.35, cy - 2.2)], BLACK)
        elif k == "dim": sym_tog(s, (cx, cy - 2.3), [(cx - 2.1, cy + 2.3), (cx + 2.1, cy + 2.3)], BLACK)
        elif k == "d4": sym_tog(s, (cx, cy - 2.3), [(cx + d, cy + 2.3) for d in (-3.6, -1.2, 1.2, 3.6)], BLACK)
        s.text(cx + 7, cy + 1.0, LEG[k], 2.75)
    return y0 + 6.5 + ((len(keys) + ncol - 1) // ncol) * 7.6

def table(s, x0, y0, title, rows, hdr=("Volta", "Instrução", "Total")):
    s.text(x0, y0, title, 3.4, BLACK, bold=True)
    y = y0 + 3
    cols = [x0, x0 + 26, x0 + 160]
    s.add(f'<rect x="{x0}" y="{y}" width="186" height="5.6" fill="#eeeeee"/>')
    for cx, h in zip(cols, hdr):
        s.text(cx + 1.5, y + 3.9, h, 2.8, BLACK, bold=True)
    y += 5.6
    for v, ins, tot in rows:
        s.text(cols[0] + 1.5, y + 3.7, v, 2.8); s.text(cols[1] + 1.5, y + 3.7, ins, 2.8); s.text(cols[2] + 1.5, y + 3.7, tot, 2.8)
        y += 5.2
        s.add(f'<line x1="{x0}" y1="{y}" x2="{x0+186}" y2="{y}" stroke="#cccccc" stroke-width="0.2"/>')
    return y

def notes(s, x0, y0, title, lines, col=BLACK):
    s.text(x0, y0, title, 3.2, col, bold=True)
    y = y0
    for ln in lines:
        y += 4.5
        s.text(x0, y, ln, 2.7, col)
    return y

YARN = {"A": ("primária", "verde musgo", "#5d6b3a"), "B": ("secundária", "off white", "#f4f1e8")}

def yarn_card(s, x, y, key):
    """card do fio: x = borda esquerda, y = topo; 47 x 7.4 mm"""
    papel, nome, cor = YARN[key]
    s.add(f'<rect x="{x}" y="{y}" width="47" height="7.4" rx="1.6" fill="white" stroke="#b5b5b5" stroke-width="0.3"/>')
    s.add(f'<circle cx="{x+4.4}" cy="{y+3.7}" r="2.5" fill="{cor}" stroke="#8a8a8a" stroke-width="0.3"/>')
    s.text(x + 8.6, y + 3.1, f"Fio {key} · cor {papel}", 2.6, BLACK, bold=True)
    s.text(x + 8.6, y + 6.1, f"recomendada: {nome}", 2.3, "#555555")

def header(s, title, sub, beginner=True):
    s.text(12, 13, title, 5.0, BLACK, bold=True)
    s.text(12, 18.5, sub, 3.0, "#555555")
    s.sub_y = 18.5
    keys = [k for k in ("A", "B") if f"Fio {k}" in sub or f"fio {k}" in sub]
    for i, k in enumerate(reversed(keys)):                 # cards alinhados à direita, abaixo do título
        yarn_card(s, 198 - 47 - i * 50, 15.0, k)
    s.text(198, 293.5, "Original: Crochet Frog, © Claire Garland (Dot Pebbles). Gráfico para uso pessoal.", 2.2, "#777777", "end")

def export(name, pages):
    pdfs = []
    multi = len(pages) > 1
    for i, sv in enumerate(pages, 1):
        base = f"{name}_p{i}" if multi else name
        open(base + ".svg", "w", encoding="utf-8").write(sv.out())
        subprocess.run(["rsvg-convert", "-f", "pdf", "-o", base + ".tmp.pdf", base + ".svg"], check=True)
        subprocess.run(["rsvg-convert", "-d", "170", "-p", "170", "-o", base + ".png", base + ".svg"], check=True)
        pdfs.append(base + ".tmp.pdf")
    w = PdfWriter()
    for p in pdfs: w.append(p)
    w.write(name + ".pdf")
    for p in pdfs: subprocess.run(["rm", p])


def plain_ring(s, c, r, a, txt):
    """anel tracejado para voltas só de pb, com etiqueta"""
    s.add(f'<circle cx="{c[0]}" cy="{c[1]}" r="{r:.2f}" fill="none" stroke="{LINK}" stroke-width="0.3" stroke-dasharray="1.2 0.9"/>')
    o, u, t = frame(c, r, a)
    w = 1.28 * len(txt) + 2.6
    s.add(f'<rect x="{o[0]-w/2:.2f}" y="{o[1]-1.75:.2f}" width="{w:.2f}" height="3.5" rx="1.75" fill="white" stroke="{LINK}" stroke-width="0.3"/>')
    s.text(o[0], o[1] + 0.8, txt, 2.15, "#555555", "middle")


# ---------------------------------------------------------------- marcas de início e fim
END_RED = "#d32f2f"

def start_mark(s, p, toward, num=None):
    """triângulo verde apontando para o primeiro ponto"""
    L = math.hypot(*toward); tx, ty = toward[0] / L, toward[1] / L; px, py = -ty, tx
    pts = [(p[0] + 1.8 * tx, p[1] + 1.8 * ty), (p[0] - 1.4 * tx + 1.7 * px, p[1] - 1.4 * ty + 1.7 * py),
           (p[0] - 1.4 * tx - 1.7 * px, p[1] - 1.4 * ty - 1.7 * py)]
    s.add('<polygon points="' + " ".join(f"{a:.2f},{b:.2f}" for a, b in pts) + f'" fill="{START}"/>')
    if num is not None:
        s.text(p[0] - 3.9 * tx, p[1] - 3.9 * ty + 0.85, str(num), 2.4, START, "middle", True)

def end_mark(s, p, num=None):
    """quadrado vermelho no último ponto"""
    s.add(f'<rect x="{p[0]-1.6:.2f}" y="{p[1]-1.6:.2f}" width="3.2" height="3.2" fill="{END_RED}" stroke="#6d1111" stroke-width="0.25"/>')
    if num is not None:
        s.text(p[0], p[1] + 0.75, str(num), 2.1, "white", "middle", True)

def ring_mark(s, c, r, a, kind, g=1, rad=4.2, tan=0.0, num=None):
    """kind 'ini': do lado da volta anterior, apontando para o ponto; 'fim': do lado da volta seguinte"""
    if kind == "ini":
        o, u, t = frame(c, r - g * rad, a)
        start_mark(s, loc(o, u, t, tan, 0), (g * u[0], g * u[1]), num)
    else:
        o, u, t = frame(c, r + g * rad, a)
        end_mark(s, loc(o, u, t, tan, 0), num)

def plain_end(s, c, rp, la, text, num=None, ang=None):
    """fim sobre um anel tracejado: logo antes da etiqueta (fim da volta)"""
    w = 1.28 * len(text) + 2.6
    a = (la if ang is None else ang) - (w / 2 + 3.2) / rp
    end_mark(s, frame(c, rp, a)[0], num)
