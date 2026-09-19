import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { ROOM, SHELF, TABLE } from './layout.js';

export const BAG = { width: 0.4, depth: 0.24, height: 0.24, handleHeight: 0.07 };

// Particles collide with statics/items (group 1) but not with each other or the generator.
export const PARTICLE_GROUP = 2;
export const GENERATOR_GROUP = 4;

// 8 corner particles, index = x | y<<1 | z<<2 (y=1 is the rim, z=1 faces the camera), plus a handle.
const HANDLE = 8;
const PARTICLE_COUNT = 9;
const PARTICLE_MASS = 0.02;
const PARTICLE_RADIUS = 0.014;
const TOTAL_MASS = PARTICLE_MASS * PARTICLE_COUNT;

// Cursor spring mirrors drag.js tuning (per kg of the whole bag) and its safety limits.
const STIFFNESS_PER_KG = 300;
const DAMPING_PER_KG = 15.5;
const MAX_STRETCH = 0.5;
const MAX_SPEED = 4;

const EDGE_K = 22;
const FACE_DIAG_K = 9;
const BODY_DIAG_K = 4;
const HANDLE_K = 25;
const SPRING_DAMPING = 0.25;

const SNAP_DURATION = 0.35;
const WALL_T = 0.03;
const SEG = 4;
const RIM_BACK = [2, 3];
const RIM_FRONT = [6, 7];

const REST = Array.from({ length: PARTICLE_COUNT }, (_, n) =>
  n === HANDLE
    ? new THREE.Vector3(0, BAG.height + BAG.handleHeight, 0)
    : new THREE.Vector3(((n & 1) - 0.5) * BAG.width, ((n >> 1) & 1) * BAG.height, (((n >> 2) & 1) - 0.5) * BAG.depth)
);

const SPRING_LAYOUT = (() => {
  const list = [];
  for (let a = 0; a < 8; a++) {
    for (let b = a + 1; b < 8; b++) {
      const diff = a ^ b;
      const bits = (diff & 1) + ((diff >> 1) & 1) + ((diff >> 2) & 1);
      if (diff === 5 && a & 2) continue; // no top-face diagonals, so the mouth can pinch and flop
      list.push([a, b, bits === 1 ? EDGE_K : bits === 2 ? FACE_DIAG_K : BODY_DIAG_K]);
    }
  }
  for (const c of [...RIM_BACK, ...RIM_FRONT]) list.push([HANDLE, c, HANDLE_K]);
  return list;
})();

const BAG_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xf4f6f2,
  roughness: 0.3,
  transparent: true,
  opacity: 0.55,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const HANDLE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xf4f6f2, roughness: 0.35, transparent: true, opacity: 0.85 });
const HANDLE_GEOMETRY = new THREE.CylinderGeometry(0.005, 0.005, 1, 6);
const UP = new THREE.Vector3(0, 1, 0);

// Open-top box whose vertices are stored as (u,v,w) in the unit cube and trilinearly
// mapped onto the 8 corner particles each frame.
function buildBagGeometry() {
  const faces = [
    (s, t) => [s, 0, t],
    (s, t) => [s, t, 0],
    (s, t) => [s, t, 1],
    (s, t) => [0, t, s],
    (s, t) => [1, t, s],
  ];
  const uvw = [];
  const index = [];
  for (const face of faces) {
    const base = uvw.length / 3;
    for (let b = 0; b <= SEG; b++) {
      for (let a = 0; a <= SEG; a++) uvw.push(...face(a / SEG, b / SEG));
    }
    for (let b = 0; b < SEG; b++) {
      for (let a = 0; a < SEG; a++) {
        const p = base + b * (SEG + 1) + a;
        index.push(p, p + SEG + 1, p + 1, p + 1, p + SEG + 1, p + SEG + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(uvw.length), 3));
  geometry.setIndex(index);
  return { geometry, uvw: Float32Array.from(uvw) };
}

export function clampToRoom(p) {
  p.x = Math.min(Math.max(p.x, ROOM.minX + 0.05), ROOM.maxX - 0.05);
  p.y = Math.min(Math.max(p.y, 0.01), ROOM.height);
  p.z = Math.min(Math.max(p.z, ROOM.backZ + 0.03), ROOM.frontZ - 0.03);
}

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/**
 * One bag: soft mass-spring body while loose/dragged, snaps into a single static body on the table.
 * origin = bottom-centre of the spawn pose. canPlace(x) vetoes a snap (e.g. overlapping another bag).
 */
export function createBag({ world, scene, origin, canPlace, onSnapStart }) {
  const { geometry, uvw } = buildBagGeometry();
  const mesh = new THREE.Mesh(geometry, BAG_MATERIAL);
  scene.add(mesh);
  const handleSegments = Array.from({ length: 4 }, () => {
    const m = new THREE.Mesh(HANDLE_GEOMETRY, HANDLE_MATERIAL);
    mesh.add(m);
    return m;
  });

  const particles = REST.map((rest) => {
    const body = new CANNON.Body({
      mass: PARTICLE_MASS,
      shape: new CANNON.Sphere(PARTICLE_RADIUS),
      linearDamping: 0.6,
      angularDamping: 0.9,
      collisionFilterGroup: PARTICLE_GROUP,
      collisionFilterMask: 1,
      allowSleep: false,
    });
    body.position.set(origin.x + rest.x, origin.y + PARTICLE_RADIUS + 0.001 + rest.y, origin.z + rest.z);
    world.addBody(body);
    return body;
  });

  const springs = SPRING_LAYOUT.map(
    ([a, b, k]) =>
      new CANNON.Spring(particles[a], particles[b], {
        restLength: REST[a].distanceTo(REST[b]),
        stiffness: k,
        damping: SPRING_DAMPING,
      })
  );

  let state = 'soft';
  let cursor = null;
  const target = new CANNON.Vec3();
  const grabOffset = new CANNON.Vec3();
  const stretch = new CANNON.Vec3();
  const pts = REST.map(() => new THREE.Vector3());
  const from = REST.map(() => new THREE.Vector3());
  const snapOrigin = new THREE.Vector3();
  const center = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const apexFront = new THREE.Vector3();
  const apexBack = new THREE.Vector3();
  let snapT = 0;

  function onPostStep() {
    if (cursor) {
      const h = particles[HANDLE].position;
      target.vsub(h, stretch);
      const len = stretch.length();
      if (len > MAX_STRETCH) stretch.scale(MAX_STRETCH / len, stretch);
      h.vadd(stretch, cursor.anchor.position);
      cursor.spring.applyForce();
    }
    for (const s of springs) s.applyForce();
    for (const p of particles) {
      const speed = p.velocity.length();
      if (speed > MAX_SPEED) p.velocity.scale(MAX_SPEED / speed, p.velocity);
    }
  }
  world.addEventListener('postStep', onPostStep);

  function setTarget(x, y, z) {
    target.set(x + grabOffset.x, y + grabOffset.y, z + grabOffset.z);
    clampToRoom(target);
  }

  function beginDrag(point) {
    if (state !== 'soft') return null;
    const h = particles[HANDLE].position;
    grabOffset.set(h.x - point.x, h.y - point.y, h.z - point.z);
    setTarget(point.x, point.y, point.z);
    const anchor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    anchor.position.copy(h);
    cursor = {
      anchor,
      spring: new CANNON.Spring(anchor, particles[HANDLE], {
        restLength: 0,
        stiffness: TOTAL_MASS * STIFFNESS_PER_KG,
        damping: TOTAL_MASS * DAMPING_PER_KG,
      }),
    };
    return { setTarget, release };
  }

  function release() {
    if (!cursor) return;
    cursor = null;

    const c = tmp.set(0, 0, 0);
    for (let n = 0; n < 8; n++) c.add(particles[n].position);
    c.multiplyScalar(1 / 8);
    const overTable =
      Math.abs(c.x - TABLE.centerX) <= TABLE.width / 2 &&
      Math.abs(c.z - TABLE.centerZ) <= TABLE.depth / 2 &&
      c.y >= TABLE.topY - 0.02;
    if (!overTable) return;

    const mx = TABLE.width / 2 - BAG.width / 2 - WALL_T;
    const mz = TABLE.depth / 2 - BAG.depth / 2 - WALL_T;
    const x = clamp(c.x, TABLE.centerX - mx, TABLE.centerX + mx);
    // Centre the bag on the items' depth plane so every item can reach its mouth.
    const z = clamp(SHELF.centerZ, TABLE.centerZ - mz, TABLE.centerZ + mz);
    if (!canPlace(x, z)) return;

    state = 'snapping';
    onSnapStart?.();
    world.removeEventListener('postStep', onPostStep);
    particles.forEach((p, n) => {
      from[n].copy(p.position);
      world.removeBody(p);
    });
    snapOrigin.set(x, TABLE.topY + PARTICLE_RADIUS, z);
    center.set(x, TABLE.topY, z);
    snapT = 0;
  }

  function finishPlacement() {
    state = 'placed';
    const hx = BAG.width / 2;
    const hy = BAG.height / 2;
    const hz = BAG.depth / 2;
    const t = WALL_T / 2;
    // Walls grow outward from the visible surface so fast-moving items can't tunnel into the bag.
    const body = new CANNON.Body({ type: CANNON.Body.STATIC });
    const frontBack = new CANNON.Box(new CANNON.Vec3(hx + WALL_T, hy, t));
    const sides = new CANNON.Box(new CANNON.Vec3(t, hy, hz));
    body.addShape(frontBack, new CANNON.Vec3(0, hy, hz + t - 0.005));
    body.addShape(frontBack, new CANNON.Vec3(0, hy, -(hz + t - 0.005)));
    body.addShape(sides, new CANNON.Vec3(hx + t - 0.005, hy, 0));
    body.addShape(sides, new CANNON.Vec3(-(hx + t - 0.005), hy, 0));
    body.position.set(center.x, TABLE.topY, center.z);
    world.addBody(body);
  }

  function placeSegment(seg, a, b) {
    tmp.subVectors(b, a);
    const len = tmp.length() || 1e-4;
    seg.position.addVectors(a, b).multiplyScalar(0.5);
    seg.scale.set(1, len, 1);
    seg.quaternion.setFromUnitVectors(UP, tmp.divideScalar(len));
  }

  function deform(spread) {
    const pos = geometry.attributes.position.array;
    for (let i = 0; i < uvw.length; i += 3) {
      const u = uvw[i];
      const v = uvw[i + 1];
      const w = uvw[i + 2];
      let x = 0;
      let y = 0;
      let z = 0;
      for (let c = 0; c < 8; c++) {
        const wt = (c & 1 ? u : 1 - u) * ((c >> 1) & 1 ? v : 1 - v) * ((c >> 2) & 1 ? w : 1 - w);
        x += wt * pts[c].x;
        y += wt * pts[c].y;
        z += wt * pts[c].z;
      }
      pos[i] = x;
      pos[i + 1] = y - (1 - v) * PARTICLE_RADIUS;
      pos[i + 2] = z;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    const s = spread * BAG.depth * 0.45;
    apexFront.copy(pts[HANDLE]).z += s;
    apexBack.copy(pts[HANDLE]).z -= s;
    placeSegment(handleSegments[0], pts[RIM_FRONT[0]], apexFront);
    placeSegment(handleSegments[1], apexFront, pts[RIM_FRONT[1]]);
    placeSegment(handleSegments[2], pts[RIM_BACK[0]], apexBack);
    placeSegment(handleSegments[3], apexBack, pts[RIM_BACK[1]]);
  }

  function update(dt) {
    if (state === 'placed') return;
    if (state === 'soft') {
      particles.forEach((p, n) => pts[n].copy(p.position));
      deform(0);
      return;
    }
    snapT = Math.min(1, snapT + dt / SNAP_DURATION);
    const e = 1 - (1 - snapT) ** 3;
    for (let n = 0; n < PARTICLE_COUNT; n++) {
      pts[n].lerpVectors(from[n], tmp.addVectors(REST[n], snapOrigin), e);
    }
    deform(e);
    if (snapT === 1) finishPlacement();
  }

  update(0);

  return {
    mesh,
    center,
    beginDrag,
    update,
    get state() {
      return state;
    },
  };
}
