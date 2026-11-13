// SPDX-License-Identifier: GPL-3.0-or-later
// Cena inicial: uma esfera de "pontos" (instâncias) girando. Prova do pipeline three.js.
import * as THREE from "three";

export function mountScene(el: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(el.clientWidth, el.clientHeight);
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f4f1e8");
  const camera = new THREE.PerspectiveCamera(45, el.clientWidth / el.clientHeight, 0.1, 100);
  camera.position.set(0, 0, 6);
  scene.add(new THREE.HemisphereLight("#ffffff", "#8a8a7a", 2.2));
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.16, 16, 12);
  const mat = new THREE.MeshStandardMaterial({ color: "#5d6b3a", roughness: 0.8 });
  for (let r = 1; r < 12; r++) {
    const phi = (r / 12) * Math.PI;
    const n = Math.max(6, Math.round(Math.sin(phi) * 24));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, mat);
      const th = (i / n) * 2 * Math.PI;
      m.position.set(2 * Math.sin(phi) * Math.cos(th), 2 * Math.cos(phi), 2 * Math.sin(phi) * Math.sin(th));
      group.add(m);
    }
  }
  scene.add(group);
  let raf = 0;
  const tick = () => {
    group.rotation.y += 0.005;
    renderer.render(scene, camera);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    renderer.dispose();
    renderer.domElement.remove();
  };
}
