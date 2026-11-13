// SPDX-License-Identifier: GPL-3.0-or-later
// Motor da janela de render (R3b): monta os pontos em blocos (deformados pela curva do fio, com raio constante e uma
// pequena variação por ponto), desenha com luz e sombras, acumula amostras de suavização e entrega a imagem. Verifica o
// controle (pausar/parar) a cada bloco e a cada amostra. Só three e os pacotes puros; sem estado global do app.
import type { RenderInfo, RenderSettings } from "@novelo/commands";
import {
  childrenOf,
  computeFrames,
  deformToCurve,
  type FrameSet,
  frameScale,
  hash01,
  type ModelSpec,
  NEUTRAL,
  parseModelKey,
  RHO_BANDS,
  relaxedScCell,
  relaxSelection,
  shapeKey,
  type TopShape,
  topShapeAt,
  topShapes,
} from "@novelo/stitch3d";
import * as THREE from "three";
import type { LayoutData } from "../view3d.ts";

export interface RenderControl {
  /** Resolve true para continuar; espera enquanto pausado; resolve false se foi parado ou ficou obsoleto. */
  gate(): Promise<boolean>;
  report(done: number, total: number, phase: string, ms: number): void;
  /** Contagens do render por seleção (depois do relaxamento). */
  info?(i: RenderInfo): void;
}

/** Subconjunto a desenhar: a seleção (livre para relaxar) e o contexto (vizinhos fixos), em índices do layout. */
export interface RenderSubset {
  selected: number[];
  context: number[];
}

export interface CameraState {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

/** Pontos por bloco de malha (unidade de reaproveitamento entre rodadas e de progresso no modo completo). */
export const BLOCK = 32;

/** Malha de um bloco, guardada entre rodadas: vale enquanto o hash das entradas do bake não mudar. */
interface Chunk {
  hash: number;
  colorHash: number;
  geo: THREE.BufferGeometry;
  tri: number;
  drawn: number;
  checksum: number;
  /** Vértices de cada ponto do bloco (0 = não desenhado), para regravar só as cores. */
  vcount: number[];
  /** Índices acumulados até cada ponto do bloco, para revelar ponto a ponto (drawRange). */
  icum: number[];
}

function strHash(t: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h;
}

function rgbOf(hex: string): [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/** Halton: deslocamentos de subpixel bem distribuídos para a acumulação de amostras. */
function halton(i: number, b: number): number {
  let f = 1;
  let r = 0;
  let n = i;
  while (n > 0) {
    f /= b;
    r += f * (n % b);
    n = Math.floor(n / b);
  }
  return r;
}

export class RenderView {
  readonly display: HTMLCanvasElement;
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 5000);
  private readonly mat = new THREE.MeshStandardMaterial({
    roughness: 0.85,
    metalness: 0,
    vertexColors: true,
  });
  private readonly meshes: THREE.Mesh[] = [];
  private readonly chunks = new Map<number, Chunk>();
  /** Já há imagem na tela de exibição (mesmo parcial). */
  hasImage = false;
  private bgTexture: THREE.CanvasTexture | null = null;
  private sun: THREE.DirectionalLight | null = null;
  /** Oclusão de ambiente: luz direcional com sombra cuja direção muda a cada amostra. */
  private aoLight: THREE.DirectionalLight | null = null;
  private hemi: THREE.HemisphereLight | null = null;
  private aoCenter = new THREE.Vector3();
  private aoRadius = 10;
  /** Soma (em ponto flutuante, alfa pré-multiplicado) das amostras de suavização. */
  private acc: Float32Array | null = null;
  private px: Uint8Array | null = null;
  private readonly shadowPlane: THREE.Mesh;
  /** Estatísticas da última rodada (testes e a interface). */
  stats = { blocks: 0, triangles: 0, bakeMs: 0, samples: 0, width: 0, height: 0, drawn: 0 };

  constructor() {
    this.display = document.createElement("canvas");
    this.gl = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.gl.setPixelRatio(1);
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.shadowPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.ShadowMaterial({ opacity: 0.28 }),
    );
    this.shadowPlane.receiveShadow = true;
  }

  /** Limpa a cena da rodada anterior. */
  private clear(): void {
    // as malhas dos blocos continuam no cache (reaproveitadas pela rodada seguinte); só saem da cena
    for (const m of this.meshes) this.scene.remove(m);
    this.meshes.length = 0;
    this.sun?.shadow.map?.dispose();
    this.sun?.dispose();
    this.sun = null;
    this.aoLight?.shadow.map?.dispose();
    this.aoLight?.dispose();
    this.aoLight = null;
    this.hemi = null;
    this.scene.clear();
    this.acc = null;
    this.px = null;
    this.bgTexture?.dispose();
    this.bgTexture = null;
  }

  private setup(s: RenderSettings, cam: CameraState, bounds: THREE.Box3): void {
    const { width: w, height: h } = s;
    this.hasImage = false;
    this.camera.clearViewOffset();
    this.gl.setSize(w, h, false);
    this.display.width = w;
    this.display.height = h;
    this.camera.aspect = w / h;
    this.camera.fov = s.fovDeg;
    this.camera.position.set(...cam.position);
    this.camera.up.set(...cam.up);
    this.camera.lookAt(new THREE.Vector3(...cam.target));
    this.camera.updateProjectionMatrix();

    // fundo
    const b = s.background;
    this.scene.background = null;
    this.gl.setClearColor(b.c1, b.kind === "transparent" ? 0 : 1);
    if (b.kind === "color") this.scene.background = new THREE.Color(b.c1);
    if (b.kind === "gradient") {
      const c = document.createElement("canvas");
      c.width = 2;
      c.height = 256;
      const g = c.getContext("2d");
      if (g) {
        const grad = g.createLinearGradient(0, 0, 0, 256);
        grad.addColorStop(0, b.c1);
        grad.addColorStop(1, b.c2);
        g.fillStyle = grad;
        g.fillRect(0, 0, 2, 256);
      }
      this.bgTexture = new THREE.CanvasTexture(c);
      this.bgTexture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = this.bgTexture;
    }

    // luz: hemisfério (ambiente) + direcional com sombras
    const l = s.light;
    this.hemi = new THREE.HemisphereLight("#ffffff", "#8a8a7a", l.ambient);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight("#ffffff", l.intensity);
    const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius || 10;
    const center = bounds.getCenter(new THREE.Vector3());
    const az = (l.azimuth * Math.PI) / 180;
    const el = (l.elevation * Math.PI) / 180;
    sun.position.set(
      center.x + radius * 3 * Math.cos(el) * Math.sin(az),
      center.y - radius * 3 * Math.cos(el) * Math.cos(az),
      center.z + radius * 3 * Math.sin(el),
    );
    sun.target.position.copy(center);
    sun.castShadow = s.shadows;
    if (s.shadows) {
      sun.shadow.mapSize.set(s.quality === 2 ? 4096 : 2048, s.quality === 2 ? 4096 : 2048);
      const cam2 = sun.shadow.camera;
      // cobre a peça e a sombra projetada no chão, mesmo com a luz baixa
      const ext = radius * (s.light.elevation < 25 ? 3 : 1.8);
      cam2.left = -ext;
      cam2.right = ext;
      cam2.top = ext;
      cam2.bottom = -ext;
      cam2.near = 0.1;
      cam2.far = radius * 12;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.02;
    }
    this.sun = sun;
    this.scene.add(sun, sun.target);
    // AO por sombras acumuladas: só com sombras e pelo menos 8 amostras (a média das direções é o que dá o efeito)
    this.aoCenter.copy(center);
    this.aoRadius = radius;
    if (s.ao > 0 && s.shadows && s.samples >= 8) {
      const ao = new THREE.DirectionalLight("#ffffff", 0);
      ao.castShadow = true;
      ao.shadow.mapSize.set(1024, 1024);
      const c3 = ao.shadow.camera;
      const e3 = radius * 1.8;
      c3.left = -e3;
      c3.right = e3;
      c3.top = e3;
      c3.bottom = -e3;
      c3.near = 0.1;
      c3.far = radius * 12;
      ao.shadow.bias = -0.0008;
      ao.shadow.normalBias = 0.03;
      ao.target.position.copy(center);
      // fora das amostras a luz de AO não existe (evita desenhar o mapa de sombra a cada pré-visualização)
      ao.visible = false;
      this.aoLight = ao;
      this.scene.add(ao, ao.target);
    }
    this.gl.shadowMap.enabled = s.shadows;

    // chão que só recebe sombra (não aparece com fundo transparente)
    if (s.shadows && b.kind !== "transparent") {
      this.shadowPlane.scale.set(radius * 6, radius * 6, 1);
      this.shadowPlane.position.set(center.x, center.y, bounds.min.z - 0.02 * radius);
      this.scene.add(this.shadowPlane);
    }
  }

  private frame(): void {
    this.gl.render(this.scene, this.camera);
  }

  /** Copia o quadro atual para a tela de exibição (pré-visualização durante a montagem). */
  private blit(): void {
    const g = this.display.getContext("2d");
    if (!g) return;
    this.hasImage = true;
    g.clearRect(0, 0, this.display.width, this.display.height);
    g.drawImage(this.gl.domElement, 0, 0, this.display.width, this.display.height);
  }

  /** Soma o quadro atual (lido do GL) à acumulação em ponto flutuante e mostra a média até aqui. */
  private accumulate(count: number): void {
    const gl = this.gl.getContext();
    const w = this.display.width;
    const h = this.display.height;
    if (!this.acc || this.acc.length !== w * h * 4) {
      this.acc = new Float32Array(w * h * 4);
      this.px = new Uint8Array(w * h * 4);
    }
    const acc = this.acc;
    const px = this.px as Uint8Array;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let i = 0; i < px.length; i++) acc[i] = (acc[i] as number) + (px[i] as number);
    const g = this.display.getContext("2d");
    if (!g) return;
    const img = g.createImageData(w, h);
    const out = img.data;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * w * 4; // o GL lê de baixo para cima
      let dst = y * w * 4;
      for (let x = 0; x < w; x++, dst += 4) {
        const k = src + x * 4;
        const a = (acc[k + 3] as number) / count; // alfa 0..255
        if (a <= 0) continue;
        const u = 255 / a / count; // desfaz o pré-multiplicado e tira a média
        out[dst] = Math.min(255, (acc[k] as number) * u);
        out[dst + 1] = Math.min(255, (acc[k + 1] as number) * u);
        out[dst + 2] = Math.min(255, (acc[k + 2] as number) * u);
        out[dst + 3] = Math.round(a);
      }
    }
    g.putImageData(img, 0, 0);
  }

  /**
   * Monta e desenha. Devolve "done" ou "stopped". Blocos de `BLOCK` pontos em ordem de trabalho; a cada bloco o quadro
   * é redesenhado, o progresso é relatado e o controle é consultado.
   */
  async run(
    layout: LayoutData,
    s: RenderSettings,
    cam: CameraState,
    ctl: RenderControl,
    subset?: RenderSubset,
  ): Promise<"done" | "stopped"> {
    const t0 = performance.now();
    this.clear();
    const nodes = layout.nodes;
    const n = nodes.length;
    const ranges = layout.parts?.map((q) => ({ offset: q.offset, count: q.count }));
    const sizes = nodes.map((nd) => nd.scale ?? nd.size ?? 1);
    // seleção: relaxa só os pontos livres (vizinhos fixos) e usa as posições novas nos quadros
    let positions: ArrayLike<number> = layout.positions;
    let relax: ReturnType<typeof relaxSelection>["stats"] | null = null;
    if (subset && s.relaxIterations > 0) {
      const out = relaxSelection({
        positions: layout.positions,
        edges: layout.edges,
        size: sizes,
        free: subset.selected,
        iterations: s.relaxIterations,
      });
      positions = out.positions;
      relax = out.stats;
    }
    const order: number[] = subset
      ? [...new Set([...subset.selected, ...subset.context])]
          .filter((i) => i >= 0 && i < n)
          .sort((a, b) => a - b)
      : Array.from({ length: n }, (_, i) => i);
    const frames: FrameSet = computeFrames({
      positions,
      parents: nodes.map((nd) => nd.parents),
      size: sizes,
      ...(ranges ? { ranges } : {}),
    }).frames;

    const bounds = new THREE.Box3();
    for (const i of order) {
      bounds.expandByPoint(
        new THREE.Vector3(
          positions[i * 3] as number,
          positions[i * 3 + 1] as number,
          positions[i * 3 + 2] as number,
        ),
      );
    }
    this.setup(s, cam, bounds);
    this.stats = {
      blocks: 0,
      triangles: 0,
      bakeMs: 0,
      samples: 0,
      width: s.width,
      height: s.height,
      drawn: order.length,
    };

    const specs = (layout.geoms ?? []).map((k) => {
      const sp = parseModelKey(k);
      return sp ? ({ ...sp, quality: s.quality } as ModelSpec) : null;
    });
    const palette = layout.palette ?? {};
    const total = order.length;
    // forma do topo do ponto de base (derivada da topologia; só no render)
    const full = s.mode === "full";
    const parentsArr = nodes.map((nd) => nd.parents);
    const children = s.baseShape ? childrenOf(parentsArr, n) : null;
    const finalShapes: TopShape[] | null = s.baseShape
      ? topShapes({ frames, parents: parentsArr, legs: nodes.map((nd) => specs[nd.g ?? 0]?.legs ?? 1) })
      : null;
    // modo rápido: formas finais desde o início; completo: começam neutras e se abrem à medida que os filhos aparecem
    const shapes: TopShape[] | null = finalShapes
      ? full
        ? finalShapes.map(() => NEUTRAL)
        : finalShapes
      : null;
    let shaped = 0;
    if (finalShapes) {
      for (const i of order) {
        const sh = finalShapes[i];
        if (sh && (sh.open !== 0 || sh.leanX !== 0 || sh.leanZ !== 0)) shaped++;
      }
    }
    const posInOrder = new Map<number, number>();
    for (let j = 0; j < order.length; j++) posInOrder.set(order[j] as number, j);
    // modelo relaxado: uma célula por raio, calculada uma vez (acima de 0,12 volta ao modelo traçado)
    const cell = s.yarnModel === "relaxed" ? (relaxedScCell(s.yarnRho) ?? undefined) : undefined;
    const specKeys = (layout.geoms ?? []).map((k) => strHash(k));
    const radiusOf = (i: number, spec: ModelSpec, nd: { uid?: number }): number => {
      // pequena variação por ponto (±3% no raio), estável: depende só do uid
      const jitter = 1 + (hash01((nd.uid ?? i) * 7 + 3) - 0.5) * 0.06;
      return (RHO_BANDS[spec.band] ?? 0.16) * frameScale(frames, i) * jitter;
    };
    const colorOf = (nd: { color?: string; yarn: string }): [number, number, number] =>
      rgbOf(nd.color ?? palette[nd.yarn] ?? "#888888");
    const hashChunk = (lo: number, hi: number): number => {
      let h = 0x811c9dc5;
      const mx = (v: number): void => {
        h ^= v | 0;
        h = Math.imul(h, 0x01000193);
      };
      const q = (v: number | undefined): number => Math.round((v ?? 0) * 1e4);
      const mixArr = (a: Float32Array, i: number): void => {
        mx(q(a[i * 3]));
        mx(q(a[i * 3 + 1]));
        mx(q(a[i * 3 + 2]));
      };
      mx(s.quality);
      mx(s.yarnModel === "simple" ? 0 : s.yarnModel === "traced" ? 1 : 2);
      mx(q(s.yarnRho));
      for (let j = lo; j < hi; j++) {
        const i = order[j] as number;
        const nd = nodes[i];
        mx(i);
        mx(specKeys[nd?.g ?? 0] ?? 0);
        const spec = specs[nd?.g ?? 0];
        if (!nd || !spec) continue;
        mx(q(radiusOf(i, spec, nd)));
        for (const a of [frames.E, frames.X, frames.tE, frames.tX, frames.ex, frames.ey, frames.ez])
          mixArr(a, i);
        for (const nb of [frames.prev[i] as number, frames.next[i] as number]) {
          if (nb >= 0) {
            mixArr(frames.ey, nb);
            mixArr(frames.ez, nb);
          } else mx(-1);
        }
        const sh = shapes?.[i];
        mx(sh ? sh.open * 1000 + Math.round(sh.leanX * 100) * 31 + Math.round(sh.leanZ * 100) : 0);
      }
      return h;
    };
    const hashColors = (lo: number, hi: number): number => {
      let h = 0x811c9dc5;
      for (let j = lo; j < hi; j++) {
        const nd = nodes[order[j] as number];
        if (!nd) continue;
        for (const c of colorOf(nd)) {
          h ^= Math.round(c * 255);
          h = Math.imul(h, 0x01000193);
        }
      }
      return h;
    };
    const bakeChunk = (lo: number, hi: number, hash: number, colorHash: number): Chunk => {
      const pos: number[] = [];
      const nor: number[] = [];
      const col: number[] = [];
      const idx: number[] = [];
      const vcount: number[] = [];
      const icum: number[] = [];
      let sum = 0x811c9dc5;
      let drawnHere = 0;
      for (let j = lo; j < hi; j++) {
        const i = order[j] as number;
        const nd = nodes[i];
        const spec = specs[nd?.g ?? 0];
        if (!nd || !spec) {
          vcount.push(0);
          icum.push(idx.length);
          continue;
        }
        drawnHere++;
        const useCell = cell && spec.type === "SC" && spec.legs <= 1 && spec.quality >= 1;
        const m = deformToCurve(
          spec,
          frames,
          i,
          useCell ? s.yarnRho * frameScale(frames, i) : radiusOf(i, spec, nd),
          shapes?.[i],
          { customStrands: s.yarnModel !== "simple", ...(cell ? { cell } : {}) },
        );
        for (let q = 0; q < m.positions.length; q++) {
          sum ^= Math.round((m.positions[q] as number) * 1e4) | 0;
          sum = Math.imul(sum, 0x01000193);
        }
        const base = pos.length / 3;
        for (let k = 0; k < m.positions.length; k++) pos.push(m.positions[k] as number);
        for (let k = 0; k < m.normals.length; k++) nor.push(m.normals[k] as number);
        const [cr, cg, cb] = colorOf(nd);
        for (let v = 0; v < m.positions.length / 3; v++) col.push(cr, cg, cb);
        for (let k = 0; k < m.indices.length; k++) idx.push(base + (m.indices[k] as number));
        vcount.push(m.positions.length / 3);
        icum.push(idx.length);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      return {
        hash,
        colorHash,
        geo,
        tri: idx.length / 3,
        drawn: drawnHere,
        checksum: sum >>> 0,
        vcount,
        icum,
      };
    };
    const recolor = (e: Chunk, lo: number, hi: number): void => {
      const attr = e.geo.getAttribute("color") as THREE.BufferAttribute;
      let v = 0;
      for (let j = lo; j < hi; j++) {
        const nd = nodes[order[j] as number];
        const cnt = e.vcount[j - lo] ?? 0;
        if (!nd || cnt === 0) continue;
        const [cr, cg, cb] = colorOf(nd);
        for (let t = 0; t < cnt; t++, v++) attr.setXYZ(v, cr, cg, cb);
      }
      attr.needsUpdate = true;
    };
    let rebuilt = 0;
    let reused = 0;
    /** Monta (ou reaproveita) o bloco que começa em `lo` e o coloca na cena. */
    const buildChunk = (lo: number, hide = false): void => {
      const hi = Math.min(total, lo + BLOCK);
      const hash = hashChunk(lo, hi);
      const colorHash = hashColors(lo, hi);
      let e = this.chunks.get(lo);
      if (e && e.hash === hash) {
        if (e.colorHash !== colorHash) {
          recolor(e, lo, hi);
          e.colorHash = colorHash;
        }
        reused++;
      } else {
        e?.geo.dispose();
        e = bakeChunk(lo, hi, hash, colorHash);
        this.chunks.set(lo, e);
        rebuilt++;
      }
      // o desenho pode ter parado no meio de uma revelação: volta ao bloco inteiro (ou escondido, se for revelar)
      e.geo.setDrawRange(0, hide ? 0 : Number.POSITIVE_INFINITY);
      const slot = lo / BLOCK;
      let mesh = this.meshes[slot];
      if (!mesh) {
        mesh = new THREE.Mesh(e.geo, this.mat);
        mesh.castShadow = s.shadows;
        mesh.receiveShadow = s.shadows;
        this.meshes[slot] = mesh;
      } else mesh.geometry = e.geo;
      if (!mesh.parent) this.scene.add(mesh);
    };
    const baseInfo: RenderInfo = subset
      ? {
          scope: "selection",
          selected: new Set(subset.selected).size,
          context: Math.max(0, total - new Set(subset.selected).size),
          drawn: total,
          relax: relax
            ? {
                iterations: relax.iterations,
                residualBefore: relax.residualBefore,
                residualAfter: relax.residualAfter,
                maxShift: relax.maxShift,
              }
            : null,
        }
      : { scope: "all", selected: 0, context: 0, drawn: total, relax: null };
    baseInfo.shaped = shaped;
    ctl.info?.(baseInfo);
    ctl.report(0, total, "modelos", 0);
    this.meshes.length = 0;
    let lastFrame = 0;
    let lastYield = performance.now();

    for (let lo = 0; lo < total; lo += BLOCK) {
      if (!(await ctl.gate())) return "stopped";
      const hi = Math.min(total, lo + BLOCK);
      const redo = new Set<number>();
      if (full && shapes && children) {
        // modo completo: os filhos deste bloco acabaram de ser trabalhados; as bases deles mudam de forma
        const upTo = order[hi - 1] as number;
        for (let j = lo; j < hi; j++) {
          for (const p of parentsArr[order[j] as number] ?? []) {
            const pj = posInOrder.get(p);
            if (pj === undefined) continue;
            const ns = topShapeAt(frames, children, p, upTo);
            if (shapeKey(ns) === shapeKey(shapes[p] as TopShape)) continue;
            shapes[p] = ns;
            const plo = Math.floor(pj / BLOCK) * BLOCK;
            if (plo < lo) redo.add(plo);
          }
        }
      }
      const reveal = full && s.pace > 0;
      for (const plo of redo) buildChunk(plo);
      buildChunk(lo, reveal);
      if (reveal) {
        // ponto a ponto: cada ponto do bloco aparece no seu ritmo, com pausa e parada a cada passo
        const e = this.chunks.get(lo) as Chunk;
        // acima de ~60 pontos/s revela vários pontos por quadro (um quadro por ponto não acompanharia o ritmo pedido)
        const per = Math.max(1, Math.ceil(s.pace / 60));
        for (let j = lo; j < hi; j += per) {
          if (!(await ctl.gate())) return "stopped";
          const end = Math.min(hi, j + per);
          e.geo.setDrawRange(0, e.icum[end - 1 - lo] as number);
          this.frame();
          this.blit();
          ctl.report(end, total, "modelos", performance.now() - t0);
          await new Promise((resolve) => setTimeout(resolve, (1000 * (end - j)) / s.pace));
        }
        e.geo.setDrawRange(0, Number.POSITIVE_INFINITY);
      }
      // a pré-visualização é redesenhada no máximo a cada ~150 ms (o custo por bloco não cresce com a peça inteira)
      const now = performance.now();
      if (now - lastFrame > 150 || hi >= total) {
        this.frame();
        this.blit();
        lastFrame = now;
      }
      ctl.report(hi, total, "modelos", now - t0);
      // cede o fio ao navegador de tempos em tempos: a interface não trava e o quadro aparece
      if (now - lastYield > 12) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        lastYield = performance.now();
      }
    }
    // modo completo: o que ficou de fora do trabalho (filhos fora do alcance) também recebe a forma final
    if (full && shapes && finalShapes) {
      const late = new Set<number>();
      for (const p of order) {
        if (shapeKey(shapes[p] as TopShape) === shapeKey(finalShapes[p] as TopShape)) continue;
        shapes[p] = finalShapes[p] as TopShape;
        late.add(Math.floor((posInOrder.get(p) as number) / BLOCK) * BLOCK);
      }
      for (const lo of late) buildChunk(lo);
    }
    // libera os blocos que sobraram de uma rodada com mais pontos
    for (const [lo, e] of this.chunks) {
      if (lo >= total) {
        e.geo.dispose();
        this.chunks.delete(lo);
      }
    }
    let drawn = 0;
    let checksum = 0x811c9dc5;
    for (let lo = 0; lo < total; lo += BLOCK) {
      const e = this.chunks.get(lo);
      if (!e) continue;
      drawn += e.drawn;
      this.stats.blocks++;
      this.stats.triangles += e.tri;
      checksum ^= e.checksum | 0;
      checksum = Math.imul(checksum, 0x01000193);
    }
    this.frame();
    this.blit();
    this.stats.bakeMs = performance.now() - t0;
    ctl.info?.({ ...baseInfo, geomChecksum: checksum >>> 0, chunks: { rebuilt, reused } });
    if (drawn === 0) throw new Error("nenhum ponto pôde ser desenhado (modelos de ponto ausentes)");

    // suavização: acumula amostras com deslocamento de subpixel (média móvel por cima da imagem)
    const samples = Math.max(1, s.samples);
    if (this.aoLight && this.hemi) {
      // o céu difuso passa a vir da média das direções com sombra: parte do ambiente sai da luz de hemisfério
      // 1,5: com direções ponderadas pelo cosseno, uma face voltada para cima sem oclusão recebe em média 2/3; sobra 20% do
      // hemisfério para as faces voltadas para baixo não ficarem pretas
      this.hemi.intensity = s.light.ambient * (1 - 0.8 * s.ao);
      this.aoLight.intensity = s.light.ambient * s.ao * 1.5;
      this.aoLight.visible = true;
    }
    for (let k = 0; k < samples; k++) {
      if (!(await ctl.gate())) return "stopped";
      if (this.aoLight) {
        // direção ponderada pelo cosseno no hemisfério +z (Halton), por amostra
        const u = halton(k + 1, 5);
        const v = halton(k + 1, 7);
        const rr = Math.sqrt(v);
        const dir = new THREE.Vector3(
          rr * Math.cos(2 * Math.PI * u),
          rr * Math.sin(2 * Math.PI * u),
          Math.sqrt(1 - v),
        );
        this.aoLight.position.copy(this.aoCenter).addScaledVector(dir, this.aoRadius * 3);
      }
      const jx = halton(k + 1, 2) - 0.5;
      const jy = halton(k + 1, 3) - 0.5;
      this.camera.setViewOffset(s.width, s.height, jx, jy, s.width, s.height);
      this.frame();
      this.accumulate(k + 1);
      this.stats.samples = k + 1;
      ctl.report(total, total, "amostras", performance.now() - t0);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    this.camera.clearViewOffset();
    // solta a acumulação (centenas de MB em 4K); a imagem final já está na tela de exibição
    this.acc = null;
    this.px = null;
    // uma pausa na última amostra segura aqui até continuar ou parar
    if (!(await ctl.gate())) return "stopped";
    return "done";
  }

  /** Imagem atual em PNG. */
  png(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.display.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("não foi possível gerar o PNG"))),
        "image/png",
      );
    });
  }

  /** Fração de pixels (amostra 64x64) diferentes do fundo, para testes. Com fundo transparente: fração com alpha. */
  coverage(bg: { kind: string; c1: string }): number {
    const w = 64;
    const h = 64;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const g = tmp.getContext("2d");
    if (!g) return 0;
    g.drawImage(this.display, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const ref = rgbOf(bg.c1).map((v) => Math.round(v * 255));
    let diff = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (bg.kind === "transparent") {
        if ((d[i + 3] as number) > 8) diff++;
      } else if (
        Math.abs((d[i] as number) - (ref[0] as number)) +
          Math.abs((d[i + 1] as number) - (ref[1] as number)) +
          Math.abs((d[i + 2] as number) - (ref[2] as number)) >
        60
      ) {
        diff++;
      }
    }
    return diff / (w * h);
  }

  /** Luminância média (0..255) dos pixels cobertos pela peça (amostra 64x64), para o teste de AO. */
  meanLuma(bg: { kind: string; c1: string }): number {
    const w = 64;
    const h = 64;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const g = tmp.getContext("2d");
    if (!g) return 0;
    g.drawImage(this.display, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const ref = rgbOf(bg.c1).map((v) => Math.round(v * 255));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) {
      const covered =
        bg.kind === "transparent"
          ? (d[i + 3] as number) > 8
          : Math.abs((d[i] as number) - (ref[0] as number)) +
              Math.abs((d[i + 1] as number) - (ref[1] as number)) +
              Math.abs((d[i + 2] as number) - (ref[2] as number)) >
            60;
      if (!covered) continue;
      sum += 0.2126 * (d[i] as number) + 0.7152 * (d[i + 1] as number) + 0.0722 * (d[i + 2] as number);
      n++;
    }
    return n ? sum / n : 0;
  }

  /** Desvio-padrão da luminância dos pixels cobertos (contraste: o AO aumenta o contraste entre frestas e faces expostas). */
  lumaSpread(bg: { kind: string; c1: string }): number {
    const w = 96;
    const h = 96;
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const g = tmp.getContext("2d");
    if (!g) return 0;
    g.drawImage(this.display, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const ref = rgbOf(bg.c1).map((v) => Math.round(v * 255));
    const ys: number[] = [];
    for (let i = 0; i < d.length; i += 4) {
      const covered =
        bg.kind === "transparent"
          ? (d[i + 3] as number) > 8
          : Math.abs((d[i] as number) - (ref[0] as number)) +
              Math.abs((d[i + 1] as number) - (ref[1] as number)) +
              Math.abs((d[i + 2] as number) - (ref[2] as number)) >
            60;
      if (covered)
        ys.push(0.2126 * (d[i] as number) + 0.7152 * (d[i + 1] as number) + 0.0722 * (d[i + 2] as number));
    }
    if (ys.length === 0) return 0;
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length;
    return Math.sqrt(ys.reduce((a, b) => a + (b - mean) ** 2, 0) / ys.length);
  }

  /** Alfa (0..255) do pixel do canto superior esquerdo da imagem, para testes de fundo transparente. */
  alphaAtCorner(): number {
    const g = this.display.getContext("2d");
    return g ? (g.getImageData(0, 0, 1, 1).data[3] as number) : -1;
  }

  dispose(): void {
    this.clear();
    for (const e of this.chunks.values()) e.geo.dispose();
    this.chunks.clear();
    this.mat.dispose();
    this.shadowPlane.geometry.dispose();
    (this.shadowPlane.material as THREE.Material).dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}
