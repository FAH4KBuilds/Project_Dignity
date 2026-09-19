import * as CANNON from 'cannon-es';
import { ROOM, buildStaticParts } from './layout.js';

// Fixed simulation step. Small because some items (lip balm, toothbrushes)
// are thin and would otherwise risk tunnelling through 3 cm shelf boards.
export const FIXED_DT = 1 / 240;
export const MAX_SUBSTEPS = 10;

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 20;
  world.solver.tolerance = 1e-4;
  world.defaultContactMaterial.contactEquationRelaxation = 4;

  const staticMaterial = new CANNON.Material('static');
  const itemMaterial = new CANNON.Material('item');
  world.addContactMaterial(
    new CANNON.ContactMaterial(staticMaterial, itemMaterial, { friction: 0.5, restitution: 0.15 })
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(itemMaterial, itemMaterial, { friction: 0.4, restitution: 0.1 })
  );

  // Ground plane. cannon Plane normal is local +Z, so rotate it to face +Y.
  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, material: staticMaterial });
  ground.addShape(new CANNON.Plane());
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);

  // Invisible room bounds: back, front, left, right planes rotated to face inward.
  const walls = [
    { pos: [0, 0, ROOM.backZ], axis: [0, 1, 0], angle: 0 }, // plane normal +Z
    { pos: [0, 0, ROOM.frontZ], axis: [0, 1, 0], angle: Math.PI }, // normal -Z
    { pos: [ROOM.minX, 0, 0], axis: [0, 1, 0], angle: Math.PI / 2 }, // normal +X
    { pos: [ROOM.maxX, 0, 0], axis: [0, 1, 0], angle: -Math.PI / 2 }, // normal -X
  ];
  for (const w of walls) {
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: staticMaterial });
    body.addShape(new CANNON.Plane());
    body.position.set(...w.pos);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(...w.axis), w.angle);
    world.addBody(body);
  }

  // Shelving unit + table: static boxes (mass 0 => unaffected by gravity).
  const staticParts = buildStaticParts();
  for (const part of staticParts) {
    const { size, pos } = part.collider ?? part;
    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: staticMaterial });
    body.addShape(new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)));
    body.position.set(...pos);
    world.addBody(body);
  }

  function createItemBody(item) {
    const shape =
      item.shape === 'cylinder'
        ? new CANNON.Cylinder(item.radius, item.radius, item.height, 16) // axis along Y in cannon-es
        : new CANNON.Box(new CANNON.Vec3(item.size[0] / 2, item.size[1] / 2, item.size[2] / 2));
    const body = new CANNON.Body({
      mass: item.mass,
      material: itemMaterial,
      linearDamping: 0.05,
      angularDamping: 0.1,
      sleepSpeedLimit: 0.05,
      sleepTimeLimit: 0.6,
      // Items stay on their spawn depth plane (move in X/Y, spin about Z) so nothing rolls out of the bags' reach.
      linearFactor: new CANNON.Vec3(1, 1, 0),
      angularFactor: new CANNON.Vec3(0, 0, 1),
    });
    body.addShape(shape);
    body.position.set(...item.pos);
    world.addBody(body);
    return body;
  }

  return { world, staticParts, createItemBody };
}
