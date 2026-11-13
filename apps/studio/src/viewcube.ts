// SPDX-License-Identifier: GPL-3.0-or-later
// Cubo de vistas no estilo do FreeCAD: 26 regiões clicáveis (6 faces, 12 arestas, 8 cantos) que levam a câmera
// à direção correspondente. Eixo Z para cima: "frente" é olhar de -Y para +Y.
// Dois formatos: chanfrado (cada região é uma peça própria, com realce ao passar o mouse) ou cubo simples.
import * as THREE from "three";

export type CubePosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface ViewCubeOptions {
  position: CubePosition;
  chamfered: boolean;
  /** Lado do cubo na tela, em pixels. */
  size: number;
}

export const CUBE_MARGIN = 10;
/** Abaixo deste lado (px) o cubo some: não dá para clicar nas regiões. */
export const CUBE_MIN_VISIBLE = 48;
const CHAMFER = 0.16; // largura do chanfro, como fração do lado do cubo
const FACE_COLOR = "#ece8da";
const PART_COLOR = new THREE.Color("#d2ccb9");
const HOVER_COLOR = new THREE.Color("#f2b134");
const FACE_HOVER = new THREE.Color("#ffd98a");

const FACES: { label: string; n: [number, number, number] }[] = [
  { label: "DIREITA", n: [1, 0, 0] },
  { label: "ESQUERDA", n: [-1, 0, 0] },
  { label: "TRÁS", n: [0, 1, 0] },
  { label: "FRENTE", n: [0, -1, 0] },
  { label: "TOPO", n: [0, 0, 1] },
  { label: "BASE", n: [0, 0, -1] },
];

function faceTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = FACE_COLOR;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#8a8575";
    g.lineWidth = 6;
    g.strokeRect(3, 3, 122, 122);
    g.fillStyle = "#2a2a2a";
    g.font = "bold 22px system-ui, Arial, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(label, 64, 66);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface ViewCube {
  setOptions(o: ViewCubeOptions): void;
  /** Desenha o cubo no canto escolhido, com a orientação da câmera principal. */
  render(renderer: THREE.WebGLRenderer, main: THREE.PerspectiveCamera, target: THREE.Vector3): void;
  /** O ponto (px, py), em pixels do canvas, cai sobre o cubo? */
  contains(px: number, py: number, width: number, height: number): boolean;
  /** Direção da região sob o ponto (de dentro para fora), ou null. */
  pick(px: number, py: number, width: number, height: number): [number, number, number] | null;
  /** Realça a região sob o ponto (formato chanfrado). Devolve se há região sob o ponto. */
  hover(px: number, py: number, width: number, height: number): boolean;
  clearHover(): void;
  dispose(): void;
}

/** Retângulo do cubo em pixels, com origem no canto superior esquerdo do canvas. */
export function cubeRect(o: ViewCubeOptions, width: number, height: number) {
  // numa área pequena o cubo encolhe (no máximo 45% do lado menor) e some se ficaria minúsculo
  const size = Math.min(o.size, Math.floor(Math.min(width, height) * 0.45));
  const x = o.position.endsWith("right") ? width - size - CUBE_MARGIN : CUBE_MARGIN;
  const y = o.position.startsWith("bottom") ? height - size - CUBE_MARGIN : CUBE_MARGIN;
  return { x, y, size, visible: size >= CUBE_MIN_VISIBLE };
}

type Region = { mesh: THREE.Mesh; dir: [number, number, number]; base: THREE.Color; face: boolean };

function chamferedParts(group: THREE.Group, regions: Region[], textures: THREE.Texture[]): void {
  const h = 0.5;
  const c = CHAMFER;
  const inner = h - c;
  const dirs: [number, number, number][] = [];
  for (const x of [-1, 0, 1])
    for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) dirs.push([x, y, z]);

  for (const dir of dirs) {
    const nz = dir.filter((v) => v !== 0).length;
    let geo: THREE.BufferGeometry;
    let mat: THREE.MeshBasicMaterial;
    let base: THREE.Color;
    if (nz === 1) {
      // face: quadrado interno, com o rótulo
      const f = FACES.find(
        (q) => q.n[0] === dir[0] && q.n[1] === dir[1] && q.n[2] === dir[2],
      ) as (typeof FACES)[number];
      const tex = faceTexture(f.label);
      textures.push(tex);
      geo = new THREE.PlaneGeometry(2 * inner, 2 * inner);
      const n = new THREE.Vector3(...dir);
      const up =
        Math.abs(dir[2]) === 1 ? new THREE.Vector3(0, dir[2] === 1 ? 1 : -1, 0) : new THREE.Vector3(0, 0, 1);
      const right = new THREE.Vector3().crossVectors(up, n);
      const m = new THREE.Matrix4().makeBasis(right, up, n).setPosition(n.clone().multiplyScalar(h));
      geo.applyMatrix4(m);
      mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
      base = new THREE.Color("#ffffff");
    } else if (nz === 2) {
      // aresta: faixa inclinada entre duas faces
      const axes = [0, 1, 2].filter((i) => dir[i] !== 0);
      const free = [0, 1, 2].find((i) => dir[i] === 0) as number;
      const [a, b] = axes as [number, number];
      const pt = (va: number, vb: number, vf: number) => {
        const p = [0, 0, 0];
        p[a] = (dir[a] as number) * va;
        p[b] = (dir[b] as number) * vb;
        p[free] = vf;
        return p;
      };
      const p1 = pt(h, inner, -inner);
      const p2 = pt(h, inner, inner);
      const p3 = pt(inner, h, inner);
      const p4 = pt(inner, h, -inner);
      geo = new THREE.BufferGeometry();
      geo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute([...p1, ...p2, ...p3, ...p1, ...p3, ...p4], 3),
      );
      mat = new THREE.MeshBasicMaterial({ color: PART_COLOR, side: THREE.DoubleSide });
      base = PART_COLOR;
    } else {
      // canto: triângulo
      const pt = (i: number) => {
        const p = [(dir[0] as number) * inner, (dir[1] as number) * inner, (dir[2] as number) * inner];
        p[i] = (dir[i] as number) * h;
        return p;
      };
      geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute([...pt(0), ...pt(1), ...pt(2)], 3));
      mat = new THREE.MeshBasicMaterial({ color: PART_COLOR, side: THREE.DoubleSide });
      base = PART_COLOR;
    }
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    regions.push({ mesh, dir, base, face: nz === 1 });
    // contorno fino para ler o formato
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: "#6b6656" }),
    );
    group.add(edges);
  }
}

function plainCube(group: THREE.Group, textures: THREE.Texture[]): THREE.Mesh {
  // ordem das faces do BoxGeometry: +x, -x, +y, -y, +z, -z
  const mats = FACES.map((f) => {
    const t = faceTexture(f.label);
    textures.push(t);
    return new THREE.MeshBasicMaterial({ map: t });
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mats);
  group.add(mesh);
  group.add(
    new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: "#6b6656" }),
    ),
  );
  return mesh;
}

export function createViewCube(initial: ViewCubeOptions): ViewCube {
  let opts = { ...initial };
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  camera.up.set(0, 0, 1);
  const ray = new THREE.Raycaster();

  let group = new THREE.Group();
  let regions: Region[] = [];
  let box: THREE.Mesh | null = null;
  let textures: THREE.Texture[] = [];
  let hovered: Region | null = null;

  const build = () => {
    scene.remove(group);
    group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        const m = o.material;
        for (const x of Array.isArray(m) ? m : [m]) x.dispose();
      }
    });
    for (const t of textures) t.dispose();
    textures = [];
    regions = [];
    hovered = null;
    group = new THREE.Group();
    box = null;
    if (opts.chamfered) chamferedParts(group, regions, textures);
    else box = plainCube(group, textures);
    scene.add(group);
  };
  build();

  const place = (main: THREE.PerspectiveCamera, target: THREE.Vector3) => {
    camera.position.copy(main.position).sub(target).setLength(2.6);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  };
  const toNdc = (px: number, py: number, width: number, height: number) => {
    const r = cubeRect(opts, width, height);
    return new THREE.Vector2(((px - r.x) / r.size) * 2 - 1, -(((py - r.y) / r.size) * 2 - 1));
  };
  const pickRegion = (px: number, py: number, width: number, height: number): Region | null => {
    ray.setFromCamera(toNdc(px, py, width, height), camera);
    const hit = ray.intersectObjects(
      regions.map((r) => r.mesh),
      false,
    )[0];
    return hit ? (regions.find((r) => r.mesh === hit.object) ?? null) : null;
  };
  const paintHover = (r: Region | null) => {
    if (hovered && hovered !== r) (hovered.mesh.material as THREE.MeshBasicMaterial).color.copy(hovered.base);
    hovered = r;
    if (r) (r.mesh.material as THREE.MeshBasicMaterial).color.copy(r.face ? FACE_HOVER : HOVER_COLOR);
  };

  return {
    setOptions(o) {
      const rebuild = o.chamfered !== opts.chamfered;
      opts = { ...o };
      if (rebuild) build();
    },
    render(renderer, main, target) {
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      place(main, target);
      const r = cubeRect(opts, w, h);
      if (!r.visible) return;
      const glY = h - (r.y + r.size); // viewport do WebGL: origem no canto inferior esquerdo
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(r.x, glY, r.size, r.size);
      renderer.setViewport(r.x, glY, r.size, r.size);
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.autoClear = true;
    },
    contains(px, py, width, height) {
      const r = cubeRect(opts, width, height);
      if (!r.visible) return false;
      return px >= r.x && px <= r.x + r.size && py >= r.y && py <= r.y + r.size;
    },
    pick(px, py, width, height) {
      if (opts.chamfered) return pickRegion(px, py, width, height)?.dir ?? null;
      ray.setFromCamera(toNdc(px, py, width, height), camera);
      const hit = box ? ray.intersectObject(box, false)[0] : undefined;
      if (!hit) return null;
      // cubo simples: cada componente perto da borda vale ±1; no meio da face vale 0
      const edge = 0.5 - 0.5 / 3;
      const d = [hit.point.x, hit.point.y, hit.point.z].map((c) => (Math.abs(c) > edge ? Math.sign(c) : 0));
      if (d[0] === 0 && d[1] === 0 && d[2] === 0) return null;
      return [d[0] as number, d[1] as number, d[2] as number];
    },
    hover(px, py, width, height) {
      if (!opts.chamfered) return false;
      const r = pickRegion(px, py, width, height);
      paintHover(r);
      return r !== null;
    },
    clearHover() {
      paintHover(null);
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          const m = o.material;
          for (const x of Array.isArray(m) ? m : [m]) x.dispose();
        }
      });
      for (const t of textures) t.dispose();
    },
  };
}
