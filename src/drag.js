import * as CANNON from 'cannon-es';
import { ROOM } from './layout.js';

// Spring tuning, expressed per kg so every item feels the same regardless of mass.
// natural frequency = sqrt(300) ≈ 17 rad/s (≈2.8 Hz), damping ratio ≈ 0.45 → visible
// trailing lag plus a small overshoot. Gravity sag at rest ≈ 9.82 / 300 ≈ 3 cm.
const STIFFNESS_PER_KG = 300;
const DAMPING_PER_KG = 15.5;
const REST_LENGTH = 0;
const HELD_ANGULAR_DAMPING = 0.9;
// Safety limits so a held item pushed against a shelf/table can't be forced through it:
const MAX_STRETCH = 0.5; // m; anchor never gets further than this from the grab point
const MAX_SPEED = 4; // m/s

/**
 * Spring-based dragging, independent of rendering.
 * grab(body, worldPoint) → setTarget(x, y, z) each frame → release().
 */
export function createDragController(world) {
  // Created per grab: an invisible, massless (static, shapeless) anchor body that
  // follows the cursor. It is never added to the world, so it cannot collide.
  let anchor = null;
  let spring = null;
  let held = null;
  let savedAngularDamping = 0;
  const target = new CANNON.Vec3(); // cursor position on the interaction plane
  const grabWorld = new CANNON.Vec3();
  const offset = new CANNON.Vec3();

  world.addEventListener('postStep', () => {
    if (!spring) return;
    // Anchor follows the cursor, limited to MAX_STRETCH from the grab point.
    held.pointToWorldFrame(spring.localAnchorB, grabWorld);
    target.vsub(grabWorld, offset);
    const stretch = offset.length();
    if (stretch > MAX_STRETCH) offset.scale(MAX_STRETCH / stretch, offset);
    grabWorld.vadd(offset, anchor.position);

    spring.applyForce(); // forces are consumed by the next internal step

    const v = held.velocity;
    const speed = v.length();
    if (speed > MAX_SPEED) v.scale(MAX_SPEED / speed, v);
  });

  function clampToRoom(p) {
    p.x = Math.min(Math.max(p.x, ROOM.minX + 0.05), ROOM.maxX - 0.05);
    p.y = Math.min(Math.max(p.y, 0.01), ROOM.height);
    p.z = Math.min(Math.max(p.z, ROOM.backZ + 0.03), ROOM.frontZ - 0.03);
  }

  function grab(body, worldPoint) {
    if (held) release();
    held = body;
    target.set(worldPoint.x, worldPoint.y, worldPoint.z);
    clampToRoom(target);
    anchor = new CANNON.Body({ mass: 0, type: CANNON.Body.STATIC });
    anchor.position.copy(target);

    const localAnchorB = new CANNON.Vec3();
    body.pointToLocalFrame(new CANNON.Vec3(worldPoint.x, worldPoint.y, worldPoint.z), localAnchorB);

    spring = new CANNON.Spring(anchor, body, {
      localAnchorA: new CANNON.Vec3(0, 0, 0),
      localAnchorB,
      restLength: REST_LENGTH,
      stiffness: body.mass * STIFFNESS_PER_KG,
      damping: body.mass * DAMPING_PER_KG,
    });

    savedAngularDamping = body.angularDamping;
    body.angularDamping = HELD_ANGULAR_DAMPING;
    body.allowSleep = false;
    body.wakeUp();
  }

  function setTarget(x, y, z) {
    if (!spring) return;
    target.set(x, y, z);
    clampToRoom(target);
  }

  function release() {
    if (!held) return;
    held.angularDamping = savedAngularDamping;
    held.allowSleep = true;
    held.wakeUp(); // keeps its last velocity and falls under normal physics
    spring = null;
    anchor = null;
    held = null;
  }

  return {
    grab,
    setTarget,
    release,
    get held() {
      return held;
    },
    get target() {
      return held ? target : null;
    },
  };
}
