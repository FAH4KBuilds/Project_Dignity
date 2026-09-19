import * as THREE from 'three';
import { BAG, createBag } from './softBodyBag.js';
import { createBagGenerator } from './bagGenerator.js';
import { createWorldLabel } from './hoverLabel.js';

const SETTLE_SPEED = 0.2;
const SETTLE_TIME = 0.2;
// Items share one depth plane, so a full bag piles up; count items poking a little out of the mouth.
const MOUTH_TOLERANCE = 0.08;
const MIN_BAG_GAP = BAG.width + 0.07;

const CHECK_CSS = `
  background: #22a447;
  border-color: #fff;
  border-width: 2px;
  border-radius: 50%;
  width: 22px;
  height: 22px;
  padding: 4px;
  font-size: 20px;
  font-weight: 700;
  line-height: 22px;
  text-align: center;
`;

/** Bag generator + all spawned bags, containment tracking and per-bag completion checkmarks. */
export function createBagSystem({ world, scene, camera, domElement, drag, pickables, items }) {
  const bags = [];
  const required = new Set(items.map((i) => i.label));
  const checkPos = new THREE.Vector3();

  function canPlace(x) {
    return bags.every(({ bag }) => bag.state === 'soft' || Math.abs(bag.center.x - x) >= MIN_BAG_GAP);
  }

  function spawnBag(origin) {
    const bag = createBag({
      world,
      scene,
      origin,
      canPlace,
      onSnapStart: () => pickables.splice(pickables.indexOf(bag.mesh), 1),
    });
    bag.mesh.userData.label = 'Plastic Bag';
    bag.mesh.userData.onGrab = (point) => bag.beginDrag(point);
    pickables.push(bag.mesh);
    bags.push({
      bag,
      contained: new Set(),
      settle: new Map(),
      checkmark: createWorldLabel(camera, domElement, '✓', CHECK_CSS),
      complete: false,
      tag: null, // set by tags.js once a gift tag has snapped onto this bag
    });
    return bag;
  }

  createBagGenerator({
    world,
    scene,
    pickables,
    onGrab: (point, origin) => spawnBag(origin).beginDrag(point),
  });

  function trackContents(entry, dt) {
    const c = entry.bag.center;
    for (const item of items) {
      const p = item.body.position;
      const inside =
        Math.abs(p.x - c.x) < BAG.width / 2 &&
        Math.abs(p.z - c.z) < BAG.depth / 2 &&
        p.y > c.y &&
        p.y < c.y + BAG.height + MOUTH_TOLERANCE;
      if (!inside || drag.held === item.body || item.isHeld?.()) {
        entry.contained.delete(item);
        entry.settle.delete(item);
        continue;
      }
      if (entry.contained.has(item)) continue;
      const t = item.body.velocity.length() < SETTLE_SPEED ? (entry.settle.get(item) ?? 0) + dt : 0;
      entry.settle.set(item, t);
      if (t >= SETTLE_TIME) entry.contained.add(item);
    }
    const labels = new Set([...entry.contained].map((i) => i.label));
    return [...required].every((l) => labels.has(l));
  }

  function update(dt) {
    for (const entry of bags) {
      entry.bag.update(dt);
      if (entry.bag.state !== 'placed') continue;
      const complete = trackContents(entry, dt);
      entry.complete = complete;
      const c = entry.bag.center;
      entry.checkmark.update(checkPos.set(c.x, c.y + BAG.height + BAG.handleHeight + 0.08, c.z), complete);
    }
  }

  return {
    update,
    get list() {
      return bags;
    },
  };
}
