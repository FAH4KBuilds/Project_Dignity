import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { clampToRoom } from './softBodyBag.js';

// A washrag is a chain of particles along X. Items are locked to one depth plane, so the cloth
// only folds in the X/Y plane; its depth is purely visual (extruded along Z).
const PARTICLES = 6;
const RADIUS = 0.014;
const BEND_K = 2.5;
const BEND_DAMPING = 0.05;
const THICKNESS = 0.024;
const SAMPLES = 16;
export const RAG_GROUP = 8;

// Cursor spring mirrors drag.js tuning and safety limits.
const STIFFNESS_PER_KG = 300;
const DAMPING_PER_KG = 15.5;
const MAX_STRETCH = 0.5;
const MAX_SPEED = 4;

function buildRibbonIndex() {
  const index = [];
  for (let j = 0; j < SAMPLES; j++) {
    for (let s = 0; s < 4; s++) {
      const a = j * 4 + s;
      const b = j * 4 + ((s + 1) % 4);
      index.push(a, b, b + 4, a, b + 4, a + 4);
    }
  }
  const last = SAMPLES * 4;
  index.push(0, 2, 1, 0, 3, 2, last, last + 1, last + 2, last, last + 2, last + 3);
  return index;
}

/** Soft washrag. `body` is a read-only proxy (centroid position/velocity) for containment checks. */
export function createSoftRag({ world, scene, item }) {
  const [width, height, depth] = item.size;
  const spacing = width / (PARTICLES - 1);

  const particles = Array.from({ length: PARTICLES }, (_, i) => {
    const p = new CANNON.Body({
      mass: item.mass / PARTICLES,
      shape: new CANNON.Sphere(RADIUS),
      linearDamping: 0.4,
      linearFactor: new CANNON.Vec3(1, 1, 0),
      angularFactor: new CANNON.Vec3(0, 0, 0), // slide with friction instead of rolling like beads
      collisionFilterGroup: RAG_GROUP,
      allowSleep: false,
    });
    p.position.set(item.pos[0] - width / 2 + i * spacing, item.pos[1] - height / 2 + RADIUS + 0.001, item.pos[2]);
    world.addBody(p);
    return p;
  });
  for (let i = 0; i < PARTICLES - 1; i++) {
    world.addConstraint(new CANNON.DistanceConstraint(particles[i], particles[i + 1], spacing));
  }
  const bends = [];
  for (let i = 0; i < PARTICLES - 2; i++) {
    bends.push(
      new CANNON.Spring(particles[i], particles[i + 2], { restLength: 2 * spacing, stiffness: BEND_K, damping: BEND_DAMPING })
    );
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SAMPLES + 1) * 12), 3));
  geometry.setIndex(buildRibbonIndex());
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: item.color, roughness: 0.95, side: THREE.DoubleSide })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  const controlPoints = particles.map(() => new THREE.Vector3());
  const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal');
  const point = new THREE.Vector3();
  const tangent = new THREE.Vector3();

  const body = { position: new CANNON.Vec3(), velocity: new CANNON.Vec3() };
  let cursor = null;
  const target = new CANNON.Vec3();
  const grabOffset = new CANNON.Vec3();
  const stretch = new CANNON.Vec3();

  world.addEventListener('postStep', () => {
    if (cursor) {
      const p = cursor.particle.position;
      target.vsub(p, stretch);
      const len = stretch.length();
      if (len > MAX_STRETCH) stretch.scale(MAX_STRETCH / len, stretch);
      p.vadd(stretch, cursor.anchor.position);
      cursor.spring.applyForce();
    }
    for (const s of bends) s.applyForce();
    for (const p of particles) {
      const speed = p.velocity.length();
      if (speed > MAX_SPEED) p.velocity.scale(MAX_SPEED / speed, p.velocity);
    }
  });

  function setTarget(x, y, z) {
    target.set(x + grabOffset.x, y + grabOffset.y, z + grabOffset.z);
    clampToRoom(target);
  }

  function release() {
    cursor = null;
  }

  function beginDrag(hit) {
    let nearest = particles[0];
    for (const p of particles) {
      if (p.position.distanceSquared(hit) < nearest.position.distanceSquared(hit)) nearest = p;
    }
    grabOffset.set(nearest.position.x - hit.x, nearest.position.y - hit.y, nearest.position.z - hit.z);
    setTarget(hit.x, hit.y, hit.z);
    const anchor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    anchor.position.copy(nearest.position);
    cursor = {
      particle: nearest,
      anchor,
      spring: new CANNON.Spring(anchor, nearest, {
        restLength: 0,
        stiffness: item.mass * STIFFNESS_PER_KG,
        damping: item.mass * DAMPING_PER_KG,
      }),
    };
    return { setTarget, release };
  }
  mesh.userData.onGrab = beginDrag;

  function update() {
    body.position.set(0, 0, 0);
    body.velocity.set(0, 0, 0);
    particles.forEach((p, i) => {
      controlPoints[i].copy(p.position);
      body.position.vadd(p.position, body.position);
      body.velocity.vadd(p.velocity, body.velocity);
    });
    body.position.scale(1 / PARTICLES, body.position);
    body.velocity.scale(1 / PARTICLES, body.velocity);

    const pos = geometry.attributes.position.array;
    const h = THICKNESS / 2;
    const d = depth / 2;
    for (let j = 0; j <= SAMPLES; j++) {
      const t = j / SAMPLES;
      curve.getPoint(t, point);
      curve.getTangent(t, tangent);
      tangent.z = 0;
      tangent.normalize();
      const nx = -tangent.y * h;
      const ny = tangent.x * h;
      const o = j * 12;
      pos.set([point.x + nx, point.y + ny, point.z + d], o);
      pos.set([point.x + nx, point.y + ny, point.z - d], o + 3);
      pos.set([point.x - nx, point.y - ny, point.z - d], o + 6);
      pos.set([point.x - nx, point.y - ny, point.z + d], o + 9);
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
  }
  update();

  return {
    mesh,
    body,
    update,
    get held() {
      return cursor !== null;
    },
  };
}
