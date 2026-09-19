import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SHELF } from './layout.js';
import { GENERATOR_GROUP } from './softBodyBag.js';

const SIZE = [0.3, 0.086, 0.22];

/** Static stack of folded plastic bags on shelf 5. Grabbing it spawns a new bag instead of moving it. */
export function createBagGenerator({ world, scene, pickables, onGrab }) {
  const baseY = SHELF.levels[4];
  const x = SHELF.centerX + 0.2; // shifted right to leave room for the tag generator on its left
  const z = SHELF.centerZ;

  const group = new THREE.Group();
  const shades = [0xf1f3ef, 0xe4e8e2];
  for (let n = 0; n < 5; n++) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.015, 0.2),
      new THREE.MeshStandardMaterial({ color: shades[n % 2], roughness: 0.4 })
    );
    slab.position.set(n % 2 ? 0.007 : -0.006, 0.0075 + n * 0.016, ((n % 3) - 1) * 0.004);
    slab.rotation.y = (n - 2) * 0.025;
    slab.castShadow = true;
    slab.receiveShadow = true;
    group.add(slab);
  }
  const band = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.084, 0.206),
    new THREE.MeshStandardMaterial({ color: 0x3f9d5a, roughness: 0.7 })
  );
  band.position.y = 0.042;
  band.castShadow = true;
  group.add(band);

  group.position.set(x, baseY, z);
  group.userData.label = 'Plastic Bags';
  group.userData.onGrab = (point) => onGrab(point, new THREE.Vector3(x, baseY, z));
  scene.add(group);
  pickables.push(group);

  const body = new CANNON.Body({ type: CANNON.Body.STATIC, collisionFilterGroup: GENERATOR_GROUP });
  body.addShape(new CANNON.Box(new CANNON.Vec3(SIZE[0] / 2, SIZE[1] / 2, SIZE[2] / 2)));
  body.position.set(x, baseY + SIZE[1] / 2, z);
  world.addBody(body);
}
