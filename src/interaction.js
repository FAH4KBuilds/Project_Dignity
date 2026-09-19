import * as THREE from 'three';

/**
 * Pointer → spring drag. On pointer down over an item, the drag controller hangs the
 * item from a spring whose anchor follows the cursor projected onto a vertical
 * interaction plane (normal +Z) at the depth where the item was grabbed.
 * The camera never moves; depth is limited to the room's shallow Z slab.
 */
export function createInteraction({ camera, domElement, drag, pickables }) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const point = new THREE.Vector3();
  let activePointer = null;
  // Set when the grabbed object supplies its own drag (userData.onGrab), e.g. bags and the bag generator.
  let customDrag = null;

  function updateNdc(event) {
    const rect = domElement.getBoundingClientRect();
    ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function findBody(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData.body) return o.userData.body;
    }
    return null;
  }

  function findOnGrab(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData.onGrab) return o.userData.onGrab;
    }
    return null;
  }

  function onPointerDown(event) {
    if (activePointer !== null || event.button !== 0) return;
    updateNdc(event);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, true)[0];
    if (!hit) return;
    const onGrab = findOnGrab(hit.object);
    const body = onGrab ? null : findBody(hit.object);
    if (onGrab) {
      customDrag = onGrab(hit.point);
      if (!customDrag) return;
    } else if (!body) {
      return;
    }

    activePointer = event.pointerId;
    domElement.setPointerCapture(event.pointerId);
    plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 0, 1), hit.point);
    if (body) drag.grab(body, hit.point);
    domElement.style.cursor = 'grabbing';
    event.preventDefault();
  }

  function onPointerMove(event) {
    updateNdc(event);
    if (activePointer === null) {
      raycaster.setFromCamera(ndc, camera);
      domElement.style.cursor = raycaster.intersectObjects(pickables, true).length ? 'grab' : 'default';
    }
  }

  function onPointerUp(event) {
    if (event.pointerId !== activePointer) return;
    if (domElement.hasPointerCapture(event.pointerId)) domElement.releasePointerCapture(event.pointerId);
    activePointer = null;
    if (customDrag) {
      customDrag.release();
      customDrag = null;
    } else {
      drag.release();
    }
    domElement.style.cursor = 'default';
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('lostpointercapture', onPointerUp);

  /** Called once per frame before physics stepping. */
  function update() {
    if (activePointer === null) return;
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(plane, point)) {
      (customDrag ?? drag).setTarget(point.x, point.y, point.z);
    }
  }

  return { update };
}
