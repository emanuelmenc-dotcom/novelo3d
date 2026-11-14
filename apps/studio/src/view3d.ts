// SPDX-License-Identifier: GPL-3.0-or-later
// Vista 3D por ponto, seleção por clique. Estilo do desenho (D-57): com `features.realistic3d` desligado (o padrão) cada
// ligação do grafo vira um segmento de fio colorido, como o 3D do CrochetPARADE, e a elipsoide invisível de cada ponto só
// serve de alvo do clique; ligado, volta o desenho realista (modelos de ponto e tubo do `stitch3d`).
import { features } from "@novelo/commands";
import {
  BatchTable,
  buildTubeLod,
  computeMatrices,
  ModelCache,
  modelKey,
  parseModelKey,
  type TubeLod,
} from "@novelo/stitch3d";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createViewCube, cubeRect, type ViewCubeOptions } from "./viewcube.ts";

export type { ViewCubeOptions } from "./viewcube.ts";

const DEFAULT_CUBE: ViewCubeOptions = { position: "bottom-right", chamfered: true, size: 112 };

export interface NodeMeta {
  id: number;
  row: number;
  index: number;
  code: string;
  counted: boolean;
  parents: number[];
  yarn: string;
  /** Identidade permanente do ponto (#uid) e tamanho relativo (tensão). */
  uid?: number;
  size?: number;
  /** Escala de desenho (tamanho x volume do material) e cor já resolvida pelo fio e pelo comprimento gasto. */
  scale?: number;
  color?: string;
  /** Índice do modelo de ponto (em `geoms`) deste nó. */
  g?: number;
  /** Montagem: peça a que o ponto pertence e o rótulo da volta dele na receita dessa peça. */
  part?: string;
  rowLabel?: string | null;
}

/** Forma desenhada na tela, em pixels do canvas. */
export type ScreenShape =
  | { kind: "rect"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "lasso"; points: [number, number][] };

/** Ferramenta do botão esquerdo: girar a câmera ou desenhar uma forma / pincel sobre os pontos. */
export type Tool = "orbit" | "rect" | "ellipse" | "lasso" | "brush";

export interface Mods {
  shift: boolean;
  ctrl: boolean;
}

export interface Handlers {
  /** Clique (sem arrasto) num ponto ou no vazio. */
  onClick?(id: number | null, mods: Mods): void;
  /** Forma terminada: formato e projeção (x,y em pixels) de todos os pontos na ordem de trabalho. */
  /** `visible` calcula (sob demanda) os pontos que aparecem na tela, sem os escondidos atrás de outros. */
  onScreen?(shape: ScreenShape, xy: number[], mods: Mods, visible: () => number[]): void;
  /** Pincel: cada ponto novo tocado durante o arrasto. */
  onStroke?(id: number, first: boolean): void;
  onStrokeEnd?(): void;
}

export interface LayoutData {
  positions: number[];
  edges: number[];
  nodes: NodeMeta[];
  /** Cor de cada fio (id -> #rrggbb), vinda da paleta do projeto. */
  palette?: Record<string, string>;
  /** Montagem: pares de índices de pontos ligados por costuras (desenhados em vermelho). */
  seamLines?: number[];
  /** Mesma chave = mesma geometria (posições, tamanhos, poses): só as cores precisam ser atualizadas. */
  geomKey?: string;
  /** Chaves dos modelos de ponto usados (tipo, pernas, raio do fio, espelho). */
  geoms?: string[];
  /** Costuras como curvas: cor do fio de costura e pares de pontos (a, b, a, b...) em ordem. */
  seamCurves?: { id: string; name: string; color: string; type: string; pairs: number[] }[];
  parts?: { id: string; name: string; offset: number; count: number; error: string | null }[];
}

/** Estado do tutorial na vista: os pontos de `start` a `end` (exclusivo) são da peça do tutorial; os de fora ficam como estão. */
export interface TutorialView {
  current: number[];
  parents: number[];
  /** Último ponto já feito (índice da vista, inclusive). */
  doneThrough: number;
  start: number;
  end: number;
}

export interface View3D {
  setData(data: LayoutData | null): void;
  /** Destaca todos os pontos das voltas dadas (índices expandidos) ou limpa com null. */
  highlightRows(rows: number[] | null, part?: string): void;
  setShowGraph(on: boolean): void;
  /** Tutorial (P4): ponto atual, bases, o que já foi feito e o que falta (esmaecido). Índices dos pontos desta vista; null desliga. */
  setTutorial(t: TutorialView | null): void;
  /** Leva a câmera até o ponto `i` (índice da vista), olhando de fora da peça. */
  focusOn(i: number): void;
  /** Só as linhas das ligações (azul: dentro da volta, vermelho: entre voltas), como a vista padrão do CrochetPARADE. */
  setWire(on: boolean): void;
  /** Cor de base (fio) de um ponto, como #rrggbb; para testes e ferramentas. */
  nodeColor(id: number): string | null;
  /** Seleciona um ponto por id (o mesmo efeito de um clique). */
  select(id: number | null): void;
  /** Ferramenta do botão esquerdo (Alt + arrasto ainda gira a câmera). */
  setTool(t: Tool): void;
  setHandlers(h: Handlers): void;
  /** Destaca a seleção por uids dos pontos (azul), ou limpa com null. */
  setSelectionUids(uids: number[] | null, part?: string): void;
  /** Projeção atual de todos os pontos em pixels do canvas: [x0,y0,x1,y1,...]. */
  projectAll(): number[];
  /** Posição, formato e tamanho do cubo de vistas (aba Interface das configurações). */
  setViewCube(o: ViewCubeOptions): void;
  /** Enquadra a peça inteira (como "Ajustar tudo" do FreeCAD). */
  fit(): void;
  /** Câmera atual (posição, alvo, vetor para cima e abertura), para a janela de render copiar. */
  cameraState(): {
    position: [number, number, number];
    target: [number, number, number];
    up: [number, number, number];
    fovDeg: number;
  };
  /** Nível de detalhe: pontos modelados, tubo contínuo ou automático (tubo em peças muito grandes). */
  setDetail(d: "auto" | "stitch" | "tube"): void;
  /** Desenha todo quadro por `ms` milissegundos (medição de desempenho; normalmente só se desenha quando algo muda). */
  benchmark(ms: number): void;
  /** Índices dos pontos visíveis agora (não cobertos por outros), lidos de um quadro de identificadores. */
  visibleNodes(): number[];
  /** Leva a câmera à direção dada (de dentro para fora), com animação curta. Ex.: [0,-1,0] = frente. */
  snapView(dir: [number, number, number]): void;
  dispose(): void;
  /** Para testes: quantos pontos há, o que está selecionado e a direção atual da câmera. */
  state(): {
    count: number;
    selected: number | null;
    selectionCount: number;
    /** Segmentos de costura desenhados. */
    seamSegments: number;
    tool: Tool;
    rows: number[] | null;
    frames: number;
    /** Quantas vezes as malhas foram recriadas (mudar só cores não recria). */
    meshBuilds: number;
    /** Triângulos desenhados, lotes de pontos, tempo de montagem (ms) e nível de detalhe atual. */
    triangles: number;
    batches: number;
    /** Chaves dos modelos de ponto em uso (tipo, pernas, raio, espelho). */
    models: string[];
    buildMs: number;
    lod: "stitch" | "tube";
    viewDir: [number, number, number];
    animating: boolean;
    viewCube: ViewCubeOptions;
    /** Retângulo real do cubo em pixels do canvas (encolhe em 3D pequeno; visible=false quando some). */
    cubeRect: { x: number; y: number; size: number; visible: boolean };
    /** Tutorial: pontos esmaecidos (por fazer) e pontos em destaque agora; vazio sem tutorial. */
    tutorial: { faded: number; current: number[]; parents: number[] };
  };
}

/** Diâmetro do alvo de clique do estilo CrochetPARADE, em ligações (aresta média = 1): grande o bastante para fechar a malha. */
const PICK_DIAMETER = 1.45;
const YARN: Record<string, string> = { A: "#5d6b3a", B: "#f4f1e8" };
const SELECT = new THREE.Color("#e8590c");
const ROW_TINT = new THREE.Color("#f2b134");
const SET_TINT = new THREE.Color("#1f7ae0");

export function mountView3D(
  el: HTMLElement,
  onSelect: (node: NodeMeta | null) => void,
  initialCube: ViewCubeOptions = DEFAULT_CUBE,
): View3D {
  let cubeOpts = { ...initialCube };
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f1e8");
  const camera = new THREE.PerspectiveCamera(45, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 5000);
  camera.position.set(0, -30, 12);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  // navegação no estilo CAD: botão esquerdo gira, botão do meio e direito deslocam, roda aproxima
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.PAN,
    RIGHT: THREE.MOUSE.PAN,
  };
  controls.screenSpacePanning = true;
  const cube = createViewCube(cubeOpts);
  let fitCenter = new THREE.Vector3();
  let fitRadius = 10;
  let anim: { t0: number; from: THREE.Vector3; to: THREE.Vector3; dist: number } | null = null;
  const ANIM_MS = 260;

  const fit = () => {
    const d = fitRadius * 2.6 + 6;
    controls.target.copy(fitCenter);
    camera.position.set(fitCenter.x, fitCenter.y - d, fitCenter.z + d * 0.45);
    anim = null;
    controls.update();
  };
  const snapView = (dir: [number, number, number]) => {
    const to = new THREE.Vector3(...dir);
    if (to.lengthSq() === 0) return;
    // nos polos a câmera tem de ficar um pouco fora do eixo, senão "para cima" (Z) degenera
    if (Math.abs(to.x) < 1e-6 && Math.abs(to.y) < 1e-6) to.y = -0.001;
    to.normalize();
    const off = camera.position.clone().sub(controls.target);
    anim = { t0: performance.now(), from: off.clone().normalize(), to, dist: off.length() };
  };

  scene.add(new THREE.HemisphereLight("#ffffff", "#8a8a7a", 1.6));
  const sun = new THREE.DirectionalLight("#ffffff", 2.2);
  sun.position.set(20, -30, 40);
  scene.add(sun);
  const grid = new THREE.GridHelper(200, 100, "#cfc9b6", "#e2ddcc");
  grid.rotation.x = Math.PI / 2;
  scene.add(grid);

  // "casulo" de ponto: esfera achatada e suave, com leve relevo
  const geo = new THREE.SphereGeometry(0.5, 14, 10);
  geo.scale(0.98, 0.82, 0.78);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 });

  let mesh: THREE.InstancedMesh | null = null;
  let pickMesh: THREE.InstancedMesh | null = null;
  // pontos visíveis: um lote instanciado por variante de modelo; a elipsoide `mesh` só serve de alvo de seleção
  const modelCache = new ModelCache();
  const geoCache = new Map<string, THREE.BufferGeometry>();
  const pickMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const vmat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
  const tubeMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, vertexColors: true });
  let visual: THREE.Group | null = null;
  let batchMeshes: THREE.InstancedMesh[] = [];
  let nodeBatch = new Int32Array(0);
  let nodeRGB = new Float32Array(0);
  // centro visual de cada ponto (meio da haste): é onde se clica e o que projectAll devolve
  let centers = new Float32Array(0);
  let modelKeys: string[] = [];
  let nodeSlot = new Int32Array(0);
  let tubeMesh: THREE.Mesh | null = null;
  let tubeData: TubeLod | null = null;
  // estilo CrochetPARADE: um segmento (cilindro fino) por ligação do grafo e, no modo "só linhas", as linhas vermelhas e azuis
  let edgeMesh: THREE.InstancedMesh | null = null;
  let edgeA = new Int32Array(0);
  let edgeB = new Int32Array(0);
  let wireLines: THREE.LineSegments | null = null;
  let wire = false;
  const edgeGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  const edgeMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  // estados de um ponto na pintura, do mais fraco ao mais forte: 0 normal, 1 por fazer (tutorial), 2 volta, 3 ponto, 4 selecionado
  const EDGE_TINT = [null, null, ROW_TINT, SET_TINT, SELECT] as const;
  const FADE_TO = new THREE.Color("#f4f1e8");
  const FADE = 0.82;
  let tut: TutorialView | null = null;
  let tutFaded = 0;
  let tutCurrent: number[] = [];
  let tutParents: number[] = [];
  const WIRE_ROW = new THREE.Color("#2a6fdb");
  const WIRE_COL = new THREE.Color("#d63a2a");
  let isRowEdge = new Uint8Array(0);
  let detail: "auto" | "stitch" | "tube" = "auto";
  let lod: "stitch" | "tube" = "stitch";
  let triangles = 0;
  let buildMs = 0;
  const pickScene = new THREE.Scene();
  pickScene.background = new THREE.Color(0, 0, 0);
  let lines: THREE.LineSegments | null = null;
  let nodes: NodeMeta[] = [];
  let base: THREE.Color[] = [];
  let selected: number | null = null;
  let rowSel: Set<number> | null = null;
  let setSel: Set<number> | null = null;
  let selUids: Set<number> | null = null;
  let selPart: string | undefined;
  let rowPart: string | undefined;
  let seamObj: THREE.Group | null = null;
  let seamPairs = 0;
  let lastCount = -1;
  let positions: ArrayLike<number> = [];
  let tool: Tool = "orbit";
  let handlers: Handlers = {};
  let showGraph = false;
  let frames = 0;
  let dirty = true;
  let forceUntil = 0;
  let meshBuilds = 0;
  let lastGeomKey: string | null = null;
  const invalidate = () => {
    dirty = true;
  };
  let raf = 0;

  const paint = () => {
    if (!mesh) return;
    const c = new THREE.Color();
    if (nodeRGB.length !== nodes.length * 3) nodeRGB = new Float32Array(nodes.length * 3);
    const nodeState = new Uint8Array(nodes.length);
    let faded = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i] as NodeMeta;
      c.copy(base[i] as THREE.Color);
      if (rowSel?.has(n.row) && (!rowPart || n.part === rowPart)) {
        c.copy(ROW_TINT);
        nodeState[i] = 2;
      }
      if (setSel?.has(i)) {
        c.copy(SET_TINT);
        nodeState[i] = 3;
      }
      if (selected === i) {
        c.copy(SELECT);
        nodeState[i] = 4;
      }
      if (tut && i >= tut.start && i < tut.end) {
        // no tutorial o que importa é o passo: ponto atual, bases, feito (cor do fio) e por fazer (esmaecido)
        if (tut.current.includes(i)) {
          c.copy(SELECT);
          nodeState[i] = 4;
        } else if (tut.parents.includes(i)) {
          c.copy(SET_TINT);
          nodeState[i] = 3;
        } else if (i > tut.doneThrough) {
          c.copy(base[i] as THREE.Color).lerp(FADE_TO, FADE);
          nodeState[i] = 1;
          faded++;
        } else {
          c.copy(base[i] as THREE.Color);
          nodeState[i] = 0;
        }
      }
      const b = batchMeshes[nodeBatch[i] as number];
      if (b) b.setColorAt(nodeSlot[i] as number, c);
      nodeRGB[i * 3] = c.r;
      nodeRGB[i * 3 + 1] = c.g;
      nodeRGB[i * 3 + 2] = c.b;
    }
    if (tubeMesh && tubeData) {
      const col = tubeMesh.geometry.getAttribute("color") as THREE.BufferAttribute;
      const vn = tubeData.vertexNode;
      for (let v = 0; v < vn.length; v++) {
        const k = (vn[v] as number) * 3;
        col.setXYZ(v, nodeRGB[k] as number, nodeRGB[k + 1] as number, nodeRGB[k + 2] as number);
      }
    }
    if (edgeMesh) {
      // cada segmento leva a cor do fio dos dois pontos que liga; destaque (volta, seleção, ponto) vence a cor do fio
      const ec = new THREE.Color();
      for (let k = 0; k < edgeA.length; k++) {
        const a = edgeA[k] as number;
        const b = edgeB[k] as number;
        const st = Math.max(nodeState[a] as number, nodeState[b] as number);
        const tint = EDGE_TINT[st];
        if (tint) ec.copy(tint);
        else {
          ec.setRGB(
            ((nodeRGB[a * 3] as number) + (nodeRGB[b * 3] as number)) / 2,
            ((nodeRGB[a * 3 + 1] as number) + (nodeRGB[b * 3 + 1] as number)) / 2,
            ((nodeRGB[a * 3 + 2] as number) + (nodeRGB[b * 3 + 2] as number)) / 2,
          );
          // segmento que ainda não foi feito (uma das pontas por fazer): esmaecido como os pontos
          if (st === 1) ec.lerp(FADE_TO, FADE);
        }
        edgeMesh.setColorAt(k, ec);
      }
      if (edgeMesh.instanceColor) edgeMesh.instanceColor.needsUpdate = true;
      if (wireLines) {
        // "só linhas": vermelho/azul de fábrica, mas o destaque (volta, ponto, seleção) também aparece
        const wc = wireLines.geometry.getAttribute("color") as THREE.BufferAttribute;
        for (let k = 0; k < edgeA.length; k++) {
          const st = Math.max(
            nodeState[edgeA[k] as number] as number,
            nodeState[edgeB[k] as number] as number,
          );
          const tint = EDGE_TINT[st];
          const col =
            tint ??
            (isRowEdge[k] ? WIRE_ROW : WIRE_COL)
              .clone()
              .lerp(st === 1 ? FADE_TO : WIRE_ROW, st === 1 ? FADE : 0);
          wc.setXYZ(k * 2, col.r, col.g, col.b);
          wc.setXYZ(k * 2 + 1, col.r, col.g, col.b);
        }
        wc.needsUpdate = true;
      }
    }
    tutFaded = faded;
    tutCurrent = tut ? [...tut.current] : [];
    tutParents = tut ? [...tut.parents] : [];
    for (const b of batchMeshes) if (b.instanceColor) b.instanceColor.needsUpdate = true;
    if (tubeMesh) (tubeMesh.geometry.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
    invalidate();
  };

  const geometryOf = (key: string): THREE.BufferGeometry => {
    let g = geoCache.get(key);
    if (!g) {
      const m = modelCache.get(key);
      g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
      g.setIndex(new THREE.BufferAttribute(m.indices, 1));
      geoCache.set(key, g);
    }
    return g;
  };

  const applyDetail = () => {
    if (edgeMesh) {
      // estilo CrochetPARADE: não há níveis de detalhe
      lod = "stitch";
      edgeMesh.visible = !wire;
      if (wireLines) wireLines.visible = wire;
      triangles = edgeMesh.count * 12;
      invalidate();
      return;
    }
    lod = detail === "auto" ? (nodes.length > 60000 ? "tube" : "stitch") : detail;
    if (visual) visual.visible = lod === "stitch" || !tubeMesh;
    if (tubeMesh) tubeMesh.visible = lod === "tube";
    triangles =
      lod === "tube" && tubeData
        ? tubeData.triangles
        : batchMeshes.reduce((a, b) => a + ((b.geometry.index?.count ?? 0) / 3) * b.count, 0);
    invalidate();
  };

  /** Pontos modelados em lotes (um por variante) com a matriz linear de cada ponto, e o tubo contínuo (nível de detalhe). */
  const buildVisual = (
    data: LayoutData,
    mats: Float32Array,
    sizes: number[],
    ranges: { offset: number; count: number }[] | undefined,
  ) => {
    const n = nodes.length;
    // a vista de edição ignora tensão e qualidade da chave (o tamanho já vem na matriz): um lote por modelo canônico
    const canon = (data.geoms ?? []).map((k) => {
      const sp = parseModelKey(k);
      return sp ? modelKey({ ...sp, tension: 4, quality: 0 }) : k;
    });
    const keys: string[] = [];
    const keyIdx = new Map<string, number>();
    const remap = canon.map((k) => {
      let i = keyIdx.get(k);
      if (i === undefined) {
        i = keys.length;
        keys.push(k);
        keyIdx.set(k, i);
      }
      return i;
    });
    const table = new BatchTable(nodes.map((nd) => remap[nd.g ?? 0] ?? 0));
    const groups = new Map<number, number[]>();
    table.lists.forEach((list, g) => {
      if (list.length > 0) groups.set(g, list);
    });
    modelKeys = keys;
    visual = new THREE.Group();
    batchMeshes = [];
    nodeBatch = new Int32Array(n);
    nodeSlot = new Int32Array(n);
    const m4 = new THREE.Matrix4();
    for (const [g, list] of groups) {
      const im = new THREE.InstancedMesh(geometryOf(keys[g] ?? "SC@1|L1|R3|F0"), vmat, list.length);
      im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      list.forEach((node, slot) => {
        m4.fromArray(mats, node * 16);
        im.setMatrixAt(slot, m4);
        nodeBatch[node] = batchMeshes.length;
        nodeSlot[node] = slot;
      });
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;
      batchMeshes.push(im);
      visual.add(im);
    }
    scene.add(visual);
    // tubo contínuo: 8 triângulos por ponto, uma malha só
    // o tubo passa pelo centro visual de cada ponto (o mesmo alvo do clique e do ID-buffer)
    tubeData = buildTubeLod(centers, sizes, 0.12, ranges);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(tubeData.positions, 3));
    tg.setIndex(new THREE.BufferAttribute(tubeData.indices, 1));
    tg.setAttribute("color", new THREE.BufferAttribute(new Float32Array(tubeData.positions.length), 3));
    tg.computeVertexNormals();
    tubeMesh = new THREE.Mesh(tg, tubeMat);
    tubeMesh.frustumCulled = false;
    scene.add(tubeMesh);
  };

  const rebuildSel = () => {
    if (!selUids) {
      setSel = null;
      return;
    }
    const next = new Set<number>();
    nodes.forEach((nd, i) => {
      if (nd.uid !== undefined && selUids?.has(nd.uid) && (!selPart || nd.part === selPart)) next.add(i);
    });
    setSel = next;
  };

  /** Estilo CrochetPARADE: um segmento de fio por ligação do grafo e as linhas vermelhas (colunas) e azuis (voltas). */
  const buildEdges = (data: LayoutData) => {
    const e = data.edges;
    const p = data.positions;
    const m = Math.floor(e.length / 2);
    edgeA = new Int32Array(m);
    edgeB = new Int32Array(m);
    const pa = new THREE.Vector3();
    const pb = new THREE.Vector3();
    let total = 0;
    for (let k = 0; k < m; k++) {
      const a = e[k * 2] as number;
      const b = e[k * 2 + 1] as number;
      edgeA[k] = a;
      edgeB[k] = b;
      pa.set(p[a * 3] as number, p[a * 3 + 1] as number, p[a * 3 + 2] as number);
      pb.set(p[b * 3] as number, p[b * 3 + 1] as number, p[b * 3 + 2] as number);
      total += pa.distanceTo(pb);
    }
    const radius = 0.085 * (m > 0 && total > 0 ? total / m : 1);
    const im = new THREE.InstancedMesh(edgeGeo, edgeMat, Math.max(1, m));
    im.count = m;
    im.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const up = new THREE.Vector3(0, 1, 0);
    const dir = new THREE.Vector3();
    const q4 = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const m4 = new THREE.Matrix4();
    const wireVerts = new Float32Array(m * 6);
    const wireCols = new Float32Array(m * 6);
    const rowColor = WIRE_ROW;
    const colColor = WIRE_COL;
    isRowEdge = new Uint8Array(m);
    for (let k = 0; k < m; k++) {
      const a = edgeA[k] as number;
      const b = edgeB[k] as number;
      pa.set(p[a * 3] as number, p[a * 3 + 1] as number, p[a * 3 + 2] as number);
      pb.set(p[b * 3] as number, p[b * 3 + 1] as number, p[b * 3 + 2] as number);
      dir.subVectors(pb, pa);
      const len = dir.length();
      if (len > 1e-9) dir.divideScalar(len);
      else dir.copy(up);
      q4.setFromUnitVectors(up, dir);
      pos.addVectors(pa, pb).multiplyScalar(0.5);
      // tensão por ponto: o fio engrossa ou afina com o tamanho dos dois pontos que o segmento liga
      const w =
        (radius *
          (((nodes[a] as NodeMeta).scale ?? (nodes[a] as NodeMeta).size ?? 1) +
            ((nodes[b] as NodeMeta).scale ?? (nodes[b] as NodeMeta).size ?? 1))) /
        2;
      sc.set(w, Math.max(len, 1e-6), w);
      im.setMatrixAt(k, m4.compose(pos, q4, sc));
      // ligação dentro da volta em azul; ligação entre voltas (coluna) em vermelho, como a vista padrão do CrochetPARADE
      const sameRow = (nodes[a] as NodeMeta).row === (nodes[b] as NodeMeta).row;
      isRowEdge[k] = sameRow ? 1 : 0;
      const col = sameRow ? rowColor : colColor;
      wireVerts.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], k * 6);
      wireCols.set([col.r, col.g, col.b, col.r, col.g, col.b], k * 6);
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;
    im.setColorAt(0, new THREE.Color("#ffffff"));
    edgeMesh = im;
    scene.add(im);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(wireVerts, 3));
    wg.setAttribute("color", new THREE.BufferAttribute(wireCols, 3));
    wireLines = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ vertexColors: true }));
    wireLines.frustumCulled = false;
    scene.add(wireLines);
  };

  const setData = (data: LayoutData | null) => {
    invalidate();
    // mesma geometria (só cor, fio ou seleção mudaram): atualiza as cores sem recriar malhas, linhas nem a câmera
    if (
      mesh &&
      data?.geomKey &&
      data.geomKey === lastGeomKey &&
      data.nodes.length === nodes.length &&
      !data.seamCurves?.length &&
      seamPairs === 0
    ) {
      nodes = data.nodes;
      const pal0 = { ...YARN, ...(data.palette ?? {}) };
      base = nodes.map((nd) => new THREE.Color(nd.color ?? pal0[nd.yarn] ?? pal0.A));
      rebuildSel();
      paint();
      return;
    }
    lastGeomKey = null;
    if (mesh) {
      scene.remove(mesh);
      mesh.dispose();
      mesh = null;
    }
    if (visual) {
      scene.remove(visual);
      for (const b of batchMeshes) b.dispose();
      visual = null;
      batchMeshes = [];
    }
    if (tubeMesh) {
      scene.remove(tubeMesh);
      tubeMesh.geometry.dispose();
      tubeMesh = null;
      tubeData = null;
    }
    if (edgeMesh) {
      scene.remove(edgeMesh);
      edgeMesh.dispose();
      edgeMesh = null;
    }
    if (wireLines) {
      scene.remove(wireLines);
      wireLines.geometry.dispose();
      (wireLines.material as THREE.Material).dispose();
      wireLines = null;
    }
    if (pickMesh) {
      pickScene.remove(pickMesh);
      pickMesh.dispose();
      pickMesh = null;
    }
    if (lines) {
      scene.remove(lines);
      lines.geometry.dispose();
      (lines.material as THREE.Material).dispose();
      lines = null;
    }
    if (seamObj) {
      scene.remove(seamObj);
      for (const ch of seamObj.children) {
        (ch as THREE.LineSegments).geometry.dispose();
        ((ch as THREE.LineSegments).material as THREE.Material).dispose();
      }
      seamObj = null;
    }
    seamPairs = 0;
    selected = null;
    nodes = data?.nodes ?? [];
    if (!data || nodes.length === 0) {
      lastCount = -1;
      return;
    }
    const p = data.positions;
    positions = p;
    const n = nodes.length;
    mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    const pal = { ...YARN, ...(data.palette ?? {}) };
    base = nodes.map((nd) => new THREE.Color(nd.color ?? pal[nd.yarn] ?? pal.A));
    const t0 = performance.now();
    // mesmo referencial do modelo do ponto: a elipsoide de seleção cobre o ponto do topo à base (centro na meia haste)
    const sizes = nodes.map((nd) => nd.scale ?? nd.size ?? 1);
    const ranges = data.parts?.map((q) => ({ offset: q.offset, count: q.count }));
    centers = new Float32Array(n * 3);
    if (!features().realistic3d) {
      // estilo CrochetPARADE: a elipsoide invisível de clique fica sobre o ponto do grafo, onde o fio passa
      const mp = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        const sz = (sizes[i] as number) * PICK_DIAMETER;
        const x = p[i * 3] as number;
        const y = p[i * 3 + 1] as number;
        const z = p[i * 3 + 2] as number;
        // a malha `geo` é achatada (0,98 / 0,82 / 0,78): desfaz o achatamento para o alvo de clique ser uma esfera
        mp.makeScale(sz / 0.98, sz / 0.82, sz / 0.78).setPosition(x, y, z);
        mesh.setMatrixAt(i, mp);
        centers[i * 3] = x;
        centers[i * 3 + 1] = y;
        centers[i * 3 + 2] = z;
      }
      modelKeys = ["cp:fio"];
      nodeBatch = new Int32Array(n);
      nodeSlot = new Int32Array(n);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      buildEdges(data);
    } else {
      const mats = computeMatrices({
        positions: data.positions,
        parents: nodes.map((nd) => nd.parents),
        size: sizes,
        ...(ranges ? { ranges } : {}),
      });
      const mid = new THREE.Matrix4().makeTranslation(0, -0.5, 0);
      const mp = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        mp.fromArray(mats, i * 16).multiply(mid);
        mesh.setMatrixAt(i, mp);
        centers[i * 3] = mp.elements[12] as number;
        centers[i * 3 + 1] = mp.elements[13] as number;
        centers[i * 3 + 2] = mp.elements[14] as number;
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      buildVisual(data, mats, sizes, ranges);
    }
    applyDetail();
    buildMs = performance.now() - t0;
    rebuildSel();
    paint();
    meshBuilds++;
    lastGeomKey = data.geomKey ?? null;

    // malha de identificação: mesma geometria e posições, cada ponto com uma cor única (id + 1 em RGB)
    pickMesh = new THREE.InstancedMesh(geo, pickMat, n);
    pickMesh.instanceMatrix = mesh.instanceMatrix;
    const idc = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const v = i + 1;
      idc.setRGB(
        ((v >> 16) & 255) / 255,
        ((v >> 8) & 255) / 255,
        (v & 255) / 255,
        THREE.LinearSRGBColorSpace,
      );
      pickMesh.setColorAt(i, idc);
    }
    pickScene.add(pickMesh);

    // grafo: arestas de carreira e de coluna
    const e = data.edges;
    const verts = new Float32Array(e.length * 3);
    for (let k = 0; k < e.length; k++) {
      const id = e[k] as number;
      verts[k * 3] = p[id * 3] as number;
      verts[k * 3 + 1] = p[id * 3 + 1] as number;
      verts[k * 3 + 2] = p[id * 3 + 2] as number;
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    lines = new THREE.LineSegments(
      lg,
      new THREE.LineBasicMaterial({ color: "#2a6fdb", transparent: true, opacity: 0.55 }),
    );
    lines.visible = showGraph;
    scene.add(lines);

    // costuras: curvas arqueadas na cor do fio de costura; o tom clareia ao longo da linha (mostra o sentido)
    const curves = data.seamCurves ?? [];
    if (curves.length > 0) {
      const cen = new THREE.Vector3();
      for (let i = 0; i < n; i++) cen.add(new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]));
      cen.divideScalar(n);
      const group = new THREE.Group();
      const SAMPLES = 6;
      const va = new THREE.Vector3();
      const vb = new THREE.Vector3();
      const mid = new THREE.Vector3();
      const bow = new THREE.Vector3();
      const q0 = new THREE.Vector3();
      const q1 = new THREE.Vector3();
      const white = new THREE.Color("#ffffff");
      for (const cv of curves) {
        const pairs = cv.pairs.length / 2;
        if (pairs === 0) continue;
        const verts = new Float32Array(pairs * SAMPLES * 6);
        const cols = new Float32Array(pairs * SAMPLES * 6);
        const base = new THREE.Color(cv.color);
        const tint = new THREE.Color();
        let o = 0;
        for (let k = 0; k < pairs; k++) {
          const ia = cv.pairs[k * 2] as number;
          const ib = cv.pairs[k * 2 + 1] as number;
          va.set(p[ia * 3] as number, p[ia * 3 + 1] as number, p[ia * 3 + 2] as number);
          vb.set(p[ib * 3] as number, p[ib * 3 + 1] as number, p[ib * 3 + 2] as number);
          mid.addVectors(va, vb).multiplyScalar(0.5);
          bow.subVectors(mid, cen);
          if (bow.lengthSq() < 1e-8) bow.set(0, 0, 1);
          bow.normalize().multiplyScalar(0.18 * va.distanceTo(vb) + 0.3);
          tint.copy(base).lerp(white, 0.6 * (k / Math.max(1, pairs - 1)));
          for (let sIdx = 0; sIdx < SAMPLES; sIdx++) {
            const t0 = sIdx / SAMPLES;
            const t1 = (sIdx + 1) / SAMPLES;
            q0.lerpVectors(va, vb, t0).addScaledVector(bow, 4 * t0 * (1 - t0));
            q1.lerpVectors(va, vb, t1).addScaledVector(bow, 4 * t1 * (1 - t1));
            verts.set([q0.x, q0.y, q0.z, q1.x, q1.y, q1.z], o);
            cols.set([tint.r, tint.g, tint.b, tint.r, tint.g, tint.b], o);
            o += 6;
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
        g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
        group.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true })));
        seamPairs += pairs;
      }
      seamObj = group;
      scene.add(group);
    }

    // enquadra a peça
    const sphere = mesh.boundingSphere;
    let minZ = 0;
    for (let i = 0; i < n; i++) minZ = Math.min(minZ, p[i * 3 + 2] as number);
    grid.position.z = minZ - 0.6;
    grid.scale.setScalar(Math.max(1, (sphere?.radius ?? 0) / 40));
    if (sphere) {
      fitCenter = sphere.center.clone();
      fitRadius = sphere.radius;
      // editar pontos refaz os dados sem mexer na câmera; só enquadra quando a peça muda de tamanho
      if (n !== lastCount) fit();
      lastCount = n;
    }
  };

  /** Pontos visíveis: desenha a malha de identificação fora da tela e lê os pixels. */
  const visibleNodes = (): number[] => {
    if (!pickMesh) return [];
    const w = renderer.domElement.width;
    const h = renderer.domElement.height;
    const rt = new THREE.WebGLRenderTarget(w, h);
    const buf = new Uint8Array(w * h * 4);
    try {
      renderer.setRenderTarget(rt);
      renderer.render(pickScene, camera);
      renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    } finally {
      renderer.setRenderTarget(null);
      rt.dispose();
    }
    const seen = new Set<number>();
    for (let k = 0; k < buf.length; k += 4) {
      const v = ((buf[k] as number) << 16) | ((buf[k + 1] as number) << 8) | (buf[k + 2] as number);
      if (v > 0 && v <= nodes.length) seen.add(v - 1);
    }
    return [...seen];
  };

  const choose = (id: number | null) => {
    selected = id;
    paint();
    onSelect(id === null ? null : (nodes[id] as NodeMeta));
  };

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickAt = (clientX: number, clientY: number): number | null => {
    if (!mesh) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(mesh, false)[0]?.instanceId ?? null;
  };
  const projectAll = (): number[] => {
    const r = renderer.domElement.getBoundingClientRect();
    const out: number[] = new Array(nodes.length * 2);
    const v = new THREE.Vector3();
    camera.updateMatrixWorld();
    for (let i = 0; i < nodes.length; i++) {
      v.set(centers[i * 3] as number, centers[i * 3 + 1] as number, centers[i * 3 + 2] as number).project(
        camera,
      );
      out[i * 2] = ((v.x + 1) / 2) * r.width;
      out[i * 2 + 1] = ((1 - v.y) / 2) * r.height;
    }
    return out;
  };

  // camada SVG para desenhar a forma de seleção enquanto se arrasta (SVG, para o único <canvas> ser o do three.js)
  const NS = "http://www.w3.org/2000/svg";
  const overlay = document.createElementNS(NS, "svg");
  overlay.setAttribute("style", "position:absolute;inset:0;width:100%;height:100%;pointer-events:none");
  overlay.setAttribute("data-testid", "shape-overlay");
  if (getComputedStyle(el).position === "static") el.style.position = "relative";
  el.appendChild(overlay);
  const drawShape = (shape: ScreenShape | null) => {
    overlay.replaceChildren();
    if (!shape) return;
    let node: SVGElement;
    if (shape.kind === "rect") {
      node = document.createElementNS(NS, "rect");
      node.setAttribute("x", String(Math.min(shape.x0, shape.x1)));
      node.setAttribute("y", String(Math.min(shape.y0, shape.y1)));
      node.setAttribute("width", String(Math.abs(shape.x1 - shape.x0)));
      node.setAttribute("height", String(Math.abs(shape.y1 - shape.y0)));
    } else if (shape.kind === "ellipse") {
      node = document.createElementNS(NS, "ellipse");
      node.setAttribute("cx", String(shape.cx));
      node.setAttribute("cy", String(shape.cy));
      node.setAttribute("rx", String(Math.max(1, shape.rx)));
      node.setAttribute("ry", String(Math.max(1, shape.ry)));
    } else {
      node = document.createElementNS(NS, "polygon");
      node.setAttribute("points", shape.points.map(([x, y]) => `${x},${y}`).join(" "));
    }
    node.setAttribute("fill", "rgba(31,122,224,0.12)");
    node.setAttribute("stroke", "#1f7ae0");
    node.setAttribute("stroke-width", "1.5");
    node.setAttribute("stroke-dasharray", "6 4");
    overlay.appendChild(node);
  };

  type Gesture = { sx: number; sy: number; points: [number, number][]; lastId: number | null };
  let gesture: Gesture | null = null;
  let down: [number, number] | null = null;
  const local = (ev: PointerEvent): [number, number] => {
    const r = renderer.domElement.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };
  const shapeOf = (g: Gesture, x: number, y: number): ScreenShape | null => {
    if (tool === "rect") return { kind: "rect", x0: g.sx, y0: g.sy, x1: x, y1: y };
    if (tool === "ellipse") {
      return {
        kind: "ellipse",
        cx: (g.sx + x) / 2,
        cy: (g.sy + y) / 2,
        rx: Math.abs(x - g.sx) / 2,
        ry: Math.abs(y - g.sy) / 2,
      };
    }
    if (tool === "lasso") return { kind: "lasso", points: g.points };
    return null;
  };
  // no modo ferramenta, o botão esquerdo (sem Alt) não gira a câmera: desliga o orbit só neste gesto
  const onDownCapture = (ev: PointerEvent) => {
    if (tool === "orbit" || ev.button !== 0 || ev.altKey) return;
    const [x, y] = local(ev);
    const r = renderer.domElement.getBoundingClientRect();
    if (cube.contains(x, y, r.width, r.height)) return;
    controls.enabled = false;
    gesture = { sx: x, sy: y, points: [[x, y]], lastId: null };
    if (tool === "brush") {
      const id = pickAt(ev.clientX, ev.clientY);
      if (id !== null) {
        gesture.lastId = id;
        handlers.onStroke?.(id, true);
      }
    }
  };
  const onDown = (ev: PointerEvent) => {
    down = [ev.clientX, ev.clientY];
  };
  const onUp = (ev: PointerEvent) => {
    if (gesture) {
      const g = gesture;
      gesture = null;
      controls.enabled = true;
      const [x, y] = local(ev);
      drawShape(null);
      const mods = { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey };
      if (tool === "brush") {
        handlers.onStrokeEnd?.();
        return;
      }
      if (Math.hypot(x - g.sx, y - g.sy) < 4) {
        const id = pickAt(ev.clientX, ev.clientY);
        choose(id);
        handlers.onClick?.(id, mods);
        return;
      }
      const shape = shapeOf(g, x, y);
      if (shape && (shape.kind !== "lasso" || shape.points.length >= 3)) {
        handlers.onScreen?.(shape, projectAll(), mods, visibleNodes);
      }
      return;
    }
    if (!down) return;
    const moved = Math.hypot(ev.clientX - down[0], ev.clientY - down[1]);
    down = null;
    if (moved > 4) return; // foi arrasto da câmera, não clique
    const r = renderer.domElement.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    if (cube.contains(px, py, r.width, r.height)) {
      const dir = cube.pick(px, py, r.width, r.height);
      if (dir) snapView(dir);
      return;
    }
    if (!mesh) return;
    const id = pickAt(ev.clientX, ev.clientY);
    choose(id);
    handlers.onClick?.(id, { shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey });
  };
  const onMove = (ev: PointerEvent) => {
    invalidate();
    if (gesture) {
      const [x, y] = local(ev);
      if (tool === "brush") {
        const id = pickAt(ev.clientX, ev.clientY);
        if (id !== null && id !== gesture.lastId) {
          handlers.onStroke?.(id, gesture.lastId === null);
          gesture.lastId = id;
        }
      } else {
        const last = gesture.points[gesture.points.length - 1] as [number, number];
        if (tool === "lasso" && Math.hypot(x - last[0], y - last[1]) > 3) gesture.points.push([x, y]);
        drawShape(shapeOf(gesture, x, y));
      }
      return;
    }
    const r = renderer.domElement.getBoundingClientRect();
    const px = ev.clientX - r.left;
    const py = ev.clientY - r.top;
    const over = cube.contains(px, py, r.width, r.height) && cube.hover(px, py, r.width, r.height);
    if (!over) cube.clearHover();
    renderer.domElement.style.cursor = over ? "pointer" : tool === "orbit" ? "" : "crosshair";
  };
  el.addEventListener("pointerdown", onDownCapture, true);
  renderer.domElement.addEventListener("pointerdown", onDown);
  renderer.domElement.addEventListener("pointerup", onUp);
  window.addEventListener("pointerup", onUp);
  renderer.domElement.addEventListener("pointermove", onMove);

  const onResize = () => {
    invalidate();
    renderer.setSize(el.clientWidth, el.clientHeight);
    camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(el);

  const q = new THREE.Quaternion();
  const ident = new THREE.Quaternion();
  const tick = () => {
    if (anim) {
      const p = Math.min(1, (performance.now() - anim.t0) / ANIM_MS);
      const e = p * p * (3 - 2 * p); // suavização
      q.setFromUnitVectors(anim.from, anim.to);
      const dir = anim.from.clone().applyQuaternion(ident.clone().slerp(q, e));
      camera.position.copy(controls.target).addScaledVector(dir, anim.dist);
      dirty = true;
      if (p >= 1) anim = null;
    }
    const moved = controls.update();
    if (performance.now() < forceUntil) dirty = true;
    // só desenha quando algo mudou (câmera, dados, cores, cubo): parado, a GPU descansa
    if (dirty || moved) {
      dirty = false;
      renderer.render(scene, camera);
      cube.render(renderer, camera, controls.target);
      frames++;
    }
    raf = requestAnimationFrame(tick);
  };
  tick();

  return {
    setData,
    highlightRows(rows, part) {
      rowSel = rows === null ? null : new Set(rows);
      rowPart = part;
      paint();
    },
    setShowGraph(on) {
      invalidate();
      showGraph = on;
      if (lines) lines.visible = on;
    },
    focusOn(i) {
      if (i < 0 || i >= nodes.length) return;
      const p = new THREE.Vector3(centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]);
      const dir = p.clone().sub(fitCenter);
      if (dir.lengthSq() < 1e-6) dir.set(0, -1, 0);
      dir.normalize();
      // nos polos (voltas 1, 2 e as últimas) "para cima" (Z) degenera: tira a câmera um pouco do eixo, como o snapView
      const side = Math.hypot(dir.x, dir.y);
      if (side < 0.2) {
        if (side < 1e-6) dir.set(0, -0.2, Math.sign(dir.z) || 1);
        else dir.set((dir.x / side) * 0.2, (dir.y / side) * 0.2, dir.z);
        dir.normalize();
      }
      anim = null;
      controls.target.copy(p);
      camera.position.copy(p).addScaledVector(dir, Math.max(fitRadius * 0.9, 4));
      controls.update();
      invalidate();
    },
    setTutorial(t) {
      tut = t;
      paint();
    },
    setWire(on) {
      wire = on;
      applyDetail();
    },
    select: choose,
    setTool(t) {
      tool = t;
      renderer.domElement.style.cursor = t === "orbit" ? "" : "crosshair";
    },
    setHandlers(h) {
      handlers = h;
    },
    setSelectionUids(uids, part) {
      selUids = uids === null ? null : new Set(uids);
      selPart = part;
      rebuildSel();
      paint();
    },
    projectAll,
    nodeColor: (id) => (base[id] ? `#${base[id].getHexString()}` : null),
    fit: () => {
      fit();
      invalidate();
    },
    cameraState: () => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
      up: [camera.up.x, camera.up.y, camera.up.z],
      fovDeg: camera.fov,
    }),
    setDetail(d) {
      detail = d;
      applyDetail();
    },
    benchmark(ms) {
      forceUntil = performance.now() + ms;
    },
    visibleNodes,
    snapView,
    setViewCube(o) {
      invalidate();
      cubeOpts = { ...o };
      cube.setOptions(cubeOpts);
    },
    dispose() {
      mesh?.dispose();
      pickMesh?.dispose();
      geo.dispose();
      mat.dispose();
      pickMat.dispose();
      lines?.geometry.dispose();
      (lines?.material as THREE.Material | undefined)?.dispose();
      for (const ch of seamObj?.children ?? []) {
        (ch as THREE.LineSegments).geometry.dispose();
        ((ch as THREE.LineSegments).material as THREE.Material).dispose();
      }
      for (const g of geoCache.values()) g.dispose();
      geoCache.clear();
      vmat.dispose();
      tubeMat.dispose();
      for (const b of batchMeshes) b.dispose();
      tubeMesh?.geometry.dispose();
      edgeMesh?.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      wireLines?.geometry.dispose();
      (wireLines?.material as THREE.Material | undefined)?.dispose();
      renderer.domElement.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      cube.dispose();
      ro.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerdown", onDownCapture, true);
      overlay.remove();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
    state: () => {
      const v = camera.position.clone().sub(controls.target).normalize();
      return {
        count: nodes.length,
        selected,
        selectionCount: setSel?.size ?? 0,
        seamSegments: seamPairs,
        tool,
        rows: rowSel ? [...rowSel] : null,
        frames,
        meshBuilds,
        triangles,
        batches: edgeMesh ? 1 : batchMeshes.length,
        models: modelKeys,
        buildMs,
        lod,
        viewDir: [v.x, v.y, v.z],
        animating: anim !== null,
        viewCube: { ...cubeOpts },
        cubeRect: cubeRect(cubeOpts, renderer.domElement.clientWidth, renderer.domElement.clientHeight),
        tutorial: { faded: tutFaded, current: tutCurrent, parents: tutParents },
      };
    },
  };
}
