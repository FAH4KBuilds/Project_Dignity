import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createTagGenerator } from './tagGenerator.js';
import { createTagPopup } from './tagPopup.js';
import { BAG } from './softBodyBag.js';

const TAG_W = 0.08;
const TAG_H = 0.11;
const TAG_MASS = 0.01;
const SNAP_DURATION = 0.25;
const SETTLE_SPEED = 0.15;
const SETTLE_TIME = 0.15;

const ARROW_STYLE = `
@keyframes tag-arrow-osc {
  0%, 100% { transform: translate(calc(-50% + 14px), -50%); }
  50% { transform: translate(calc(-50% - 14px), -50%); }
}
.tag-arrow {
  position: fixed;
  font-size: 30px;
  color: #ffcf40;
  text-shadow: 0 0 4px #000, 0 0 8px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 9999;
  display: none;
  animation: tag-arrow-osc 0.9s ease-in-out infinite;
}
`;

/**
 * Gift-tag generator + popup drawing tool + spawned tags that snap onto a completed bag.
 * `bags` is the object returned by createBagSystem (its `.list` entries gain `complete`/`tag` fields).
 */
export function createTagSystem({ world, scene, camera, domElement, drag, pickables, bags }) {
  const looseTags = [];

  const style = document.createElement('style');
  style.textContent = ARROW_STYLE;
  document.head.appendChild(style);
  const arrow = document.createElement('div');
  arrow.className = 'tag-arrow';
  arrow.textContent = '⟵';
  document.body.appendChild(arrow);

  const popup = createTagPopup({ onComplete: (canvas) => spawnTag(canvas) });

  const gen = createTagGenerator({
    world,
    scene,
    pickables,
    onGrab: () => popup.open(),
  });
  const generatorPos = gen.position;

  function spawnTag(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const geometry = new THREE.PlaneGeometry(TAG_W, TAG_H);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.009, 0.0018, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.4, metalness: 0.6 })
    );
    ring.position.set(0, TAG_H / 2 + 0.006, 0);
    mesh.add(ring);

    const body = new CANNON.Body({
      mass: TAG_MASS,
      shape: new CANNON.Box(new CANNON.Vec3(TAG_W / 2, TAG_H / 2, 0.004)),
      linearDamping: 0.3,
      angularDamping: 0.5,
      // Same depth-plane lock as every other pickable item.
      linearFactor: new CANNON.Vec3(1, 1, 0),
      angularFactor: new CANNON.Vec3(0, 0, 1),
    });
    body.position.set(generatorPos.x, generatorPos.y + 0.15, generatorPos.z);
    world.addBody(body);

    // A plain body-backed pickable: no custom onGrab, so it rides the same drag path as any toiletry.
    mesh.userData.body = body;
    mesh.userData.label = 'Gift Tag';
    scene.add(mesh);
    pickables.push(mesh);

    looseTags.push({ mesh, body, settle: 0, state: 'loose' });
  }

  function findAttachTarget(pos) {
    for (const entry of bags.list) {
      if (!entry.complete || entry.tag) continue;
      const c = entry.bag.center;
      if (
        Math.abs(pos.x - c.x) < BAG.width / 2 + 0.06 &&
        Math.abs(pos.z - c.z) < BAG.depth / 2 + 0.15 &&
        Math.abs(pos.y - (c.y + BAG.height)) < 0.22
      ) {
        return entry;
      }
    }
    return null;
  }

  const projected = new THREE.Vector3();
  const lerpPos = new THREE.Vector3();

  function update(dt) {
    // Arrow: point at the tag generator whenever some completed bag still has no tag.
    const needsTag = bags.list.some((e) => e.complete && !e.tag);
    if (needsTag) {
      const rect = domElement.getBoundingClientRect();
      projected.set(generatorPos.x + 0.18, generatorPos.y + 0.12, generatorPos.z).project(camera);
      arrow.style.left = ((projected.x + 1) / 2) * rect.width + rect.left + 'px';
      arrow.style.top = ((1 - projected.y) / 2) * rect.height + rect.top + 'px';
      arrow.style.display = 'block';
    } else {
      arrow.style.display = 'none';
    }

    for (let i = looseTags.length - 1; i >= 0; i--) {
      const t = looseTags[i];

      if (t.state === 'attaching') {
        t.snapT = Math.min(1, t.snapT + dt / SNAP_DURATION);
        const e = 1 - (1 - t.snapT) ** 3;
        t.mesh.position.lerpVectors(t.fromPos, t.toPos, e);
        t.mesh.quaternion.slerpQuaternions(t.fromQuat, t.toQuat, e);
        if (t.snapT >= 1) {
          t.state = 'attached';
          t.entry.tag = t;
        }
        continue;
      }
      if (t.state === 'attached') continue;

      // Loose: follow physics unless currently held.
      t.mesh.position.copy(t.body.position);
      t.mesh.quaternion.copy(t.body.quaternion);
      if (drag.held === t.body) {
        t.settle = 0;
        continue;
      }

      const target = findAttachTarget(t.body.position);
      t.settle = target && t.body.velocity.length() < SETTLE_SPEED ? t.settle + dt : 0;
      if (target && t.settle >= SETTLE_TIME) {
        const c = target.bag.center;
        t.fromPos = t.mesh.position.clone();
        t.fromQuat = t.mesh.quaternion.clone();
        t.toPos = lerpPos.set(c.x + BAG.width / 2 - TAG_W * 0.6, c.y + BAG.height - TAG_H * 0.3, c.z + BAG.depth / 2 + 0.01).clone();
        t.toQuat = new THREE.Quaternion();
        t.entry = target;
        t.state = 'attaching';
        t.snapT = 0;
        world.removeBody(t.body);
        pickables.splice(pickables.indexOf(t.mesh), 1);
      }
    }
  }

  return { update };
}
