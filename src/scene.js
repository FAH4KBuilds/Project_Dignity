import * as THREE from 'three';
import { ROOM } from './layout.js';

const CAMERA_TARGET = new THREE.Vector3(0, 0.95, 0);
const CAMERA_HEIGHT = 1.35;
const MIN_VISIBLE_WIDTH = 4.3; // meters of scene width that must always fit on screen
const FOV = 45;

export function createScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e4dc);

  // Fixed, locked perspective camera. No orbit controls: gameplay reads as 2.5D.
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    const aspect = w / h;
    camera.aspect = aspect;
    // Pull the camera straight back on narrow screens so the whole room stays visible;
    // the viewing angle never changes.
    const halfV = THREE.MathUtils.degToRad(FOV / 2);
    const distForWidth = MIN_VISIBLE_WIDTH / 2 / (Math.tan(halfV) * aspect);
    const dist = Math.max(3.3, distForWidth);
    camera.position.set(0, CAMERA_HEIGHT, dist);
    camera.lookAt(CAMERA_TARGET);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }
  resize();
  window.addEventListener('resize', resize);

  // Lights
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb8a894, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(1.5, 3.5, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -2.5;
  sun.shadow.camera.right = 2.5;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -1;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 10;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.01;
  scene.add(sun);

  // Room: floor and back wall
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8),
    new THREE.MeshStandardMaterial({ color: 0xcdb99c, roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1.5;
  floor.receiveShadow = true;
  scene.add(floor);

  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 6),
    new THREE.MeshStandardMaterial({ color: 0xf1ece4, roughness: 1 })
  );
  wall.position.set(0, 3, ROOM.backZ);
  wall.receiveShadow = true;
  scene.add(wall);

  const baseboard = new THREE.Mesh(
    new THREE.BoxGeometry(12, 0.08, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 })
  );
  baseboard.position.set(0, 0.04, ROOM.backZ + 0.01);
  scene.add(baseboard);

  return { renderer, scene, camera };
}

export function addStaticMeshes(scene, parts) {
  const materials = new Map();
  for (const part of parts) {
    if (!materials.has(part.color)) {
      materials.set(part.color, new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.55 }));
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), materials.get(part.color));
    mesh.position.set(...part.pos);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}

// ---------------------------------------------------------------------------
// Item visuals. Each is a Group centered on the physics body's origin and kept
// inside the physics shape's bounds so what you see is what collides.
// ---------------------------------------------------------------------------
function mat(color, roughness = 0.45) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function shade(color, amount) {
  return new THREE.Color(color).lerp(new THREE.Color(amount > 0 ? 0xffffff : 0x000000), Math.abs(amount));
}

function add(group, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const builders = {
  // Bottles: body + narrower cap, total height = physics cylinder height.
  bottle(g, it) {
    const bodyH = it.height * 0.8;
    const capH = it.height - bodyH;
    add(g, new THREE.CylinderGeometry(it.radius, it.radius, bodyH, 24), mat(it.color, 0.35), 0, -it.height / 2 + bodyH / 2);
    add(g, new THREE.CylinderGeometry(it.radius * 0.5, it.radius * 0.6, capH, 20), mat(0xffffff, 0.3), 0, it.height / 2 - capH / 2);
    // label band, slightly inset in height, same radius + hair to avoid z-fighting
    add(g, new THREE.CylinderGeometry(it.radius * 1.004, it.radius * 1.004, bodyH * 0.35, 24, 1, true), mat(shade(it.color, 0.55), 0.6), 0, -it.height / 2 + bodyH * 0.45);
  },
  wipes(g, it) {
    const bodyH = it.height * 0.78;
    const lidH = it.height - bodyH;
    add(g, new THREE.CylinderGeometry(it.radius * 0.97, it.radius * 0.97, bodyH, 28), mat(it.color, 0.4), 0, -it.height / 2 + bodyH / 2);
    add(g, new THREE.CylinderGeometry(it.radius, it.radius, lidH, 28), mat(0xffffff, 0.35), 0, it.height / 2 - lidH / 2);
  },
  soap(g, it) {
    const [x, y, z] = it.size;
    add(g, new THREE.BoxGeometry(x, y, z), mat(it.color, 0.7));
    add(g, new THREE.BoxGeometry(x * 0.35, y * 1.001, z * 1.001), mat(0x6fa8dc, 0.6));
  },
  toothbrush(g, it) {
    const [, h, len] = it.size;
    const r = 0.008;
    const handleY = -h / 2 + r;
    const handle = add(g, new THREE.CapsuleGeometry(r, len - 2 * r, 6, 12), mat(it.color, 0.35), 0, handleY, 0);
    handle.rotation.x = Math.PI / 2;
    const bristleH = h / 2 - (handleY + r);
    add(g, new THREE.BoxGeometry(0.014, bristleH, 0.035), mat(0xffffff, 0.8), 0, handleY + r + bristleH / 2, len / 2 - 0.03);
  },
  deodorant(g, it) {
    const [x, y, z] = it.size;
    const capH = y * 0.28;
    add(g, new THREE.BoxGeometry(x, y - capH, z), mat(it.color, 0.4), 0, -capH / 2);
    add(g, new THREE.BoxGeometry(x, capH, z), mat(shade(it.color, 0.45), 0.35), 0, y / 2 - capH / 2);
  },
  lipBalm(g, it) {
    const capH = it.height * 0.4;
    add(g, new THREE.CylinderGeometry(it.radius, it.radius, it.height - capH, 16), mat(it.color, 0.4), 0, -capH / 2);
    add(g, new THREE.CylinderGeometry(it.radius, it.radius, capH, 16), mat(0xf5f5f5, 0.35), 0, (it.height - capH) / 2);
  },
};

const builderFor = {
  shampoo: 'bottle',
  bodyWash: 'bottle',
  conditioner: 'bottle',
  wipes: 'wipes',
  soap: 'soap',
  toothbrush: 'toothbrush',
  deodorant: 'deodorant',
  lipBalm: 'lipBalm',
};

export function createItemMesh(item) {
  const group = new THREE.Group();
  builders[builderFor[item.kind]](group, item);
  return group;
}
