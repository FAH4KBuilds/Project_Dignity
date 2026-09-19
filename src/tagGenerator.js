import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SHELF } from './layout.js';
import { GENERATOR_GROUP } from './softBodyBag.js';

const SIZE = [0.16, 0.1, 0.15];
export const TAG_GENERATOR_X = SHELF.centerX - 0.35;

/**
 * Static stack of blank gift tags on shelf 5, left of the bag generator.
 * Clicking it (onGrab returning nothing aborts the drag in interaction.js) opens the tag-drawing popup.
 */
export function createTagGenerator({ world, scene, pickables, onGrab }) {
  const baseY = SHELF.levels[4];
  const x = TAG_GENERATOR_X;
  const z = SHELF.centerZ;

  const group = new THREE.Group();
  const cardMat = new THREE.MeshStandardMaterial({ color: 0xf0e2c0, roughness: 0.6 });
  for (let n = 0; n < 4; n++) {
    const tag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.13), cardMat);
    tag.position.set((n % 2 ? 1 : -1) * 0.004, 0.006 + n * 0.01, ((n % 3) - 1) * 0.003);
    tag.rotation.y = (n - 1.5) * 0.04;
    tag.castShadow = true;
    tag.receiveShadow = true;
    group.add(tag);
  }
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.012, 0.0025, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xb0b0b0, roughness: 0.4, metalness: 0.6 })
  );
  ring.position.set(0, 0.05, 0.05);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);

  // Little crayon-tip dabs hinting "customize me".
  [0xff4d6d, 0x2f9e44, 0x2f7de1].forEach((c, i) => {
    const dab = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
    dab.position.set(-0.035 + i * 0.02, 0.044, 0.05);
    group.add(dab);
  });

  group.position.set(x, baseY, z);
  group.userData.label = 'Tag Maker';
  group.userData.onGrab = () => {
    onGrab();
  };
  scene.add(group);
  pickables.push(group);

  const body = new CANNON.Body({ type: CANNON.Body.STATIC, collisionFilterGroup: GENERATOR_GROUP });
  body.addShape(new CANNON.Box(new CANNON.Vec3(SIZE[0] / 2, SIZE[1] / 2, SIZE[2] / 2)));
  body.position.set(x, baseY + SIZE[1] / 2, z);
  world.addBody(body);

  return { position: new THREE.Vector3(x, baseY, z) };
}
