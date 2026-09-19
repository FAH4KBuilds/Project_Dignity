import * as THREE from 'three';

const LABEL_CSS = `
  position: fixed;
  background: rgba(0, 0, 0, 0.9);
  color: #fff;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  font-family: system-ui, -apple-system, sans-serif;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  display: none;
  z-index: 10000;
  border: 1px solid rgba(255, 255, 255, 0.3);
`;

/** A label pinned above a world-space point; update(worldPos, visible) each frame. */
export function createWorldLabel(camera, domElement, text, css = '') {
  const el = document.createElement('div');
  el.style.cssText = LABEL_CSS + 'display: block; visibility: hidden; transform: translate(-50%, -100%);' + css;
  el.textContent = text;
  document.body.appendChild(el);
  const projected = new THREE.Vector3();

  function update(worldPos, visible) {
    if (!visible) {
      el.style.visibility = 'hidden';
      return;
    }
    projected.copy(worldPos).project(camera);
    const rect = domElement.getBoundingClientRect();
    el.style.left = ((projected.x + 1) / 2) * rect.width + rect.left + 'px';
    el.style.top = ((1 - projected.y) / 2) * rect.height + rect.top + 'px';
    el.style.visibility = 'visible';
  }

  return { update };
}

/**
 * Hover labels: show item names when the pointer hovers over them.
 * Uses raycasting to detect hover; labels are positioned via screen projection.
 */
export function createHoverLabel(camera, domElement, pickables) {
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const labelDiv = document.createElement('div');
  labelDiv.style.cssText = LABEL_CSS;
  document.body.appendChild(labelDiv);

  let isDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let isPointerOverCanvas = false;

  function findLabel(object) {
    for (let o = object; o; o = o.parent) {
      if (o.userData.label) return o.userData.label;
    }
    return null;
  }

  function onPointerDown() {
    isDragging = true;
    labelDiv.style.display = 'none';
  }

  function onPointerUp() {
    isDragging = false;
  }

  function onPointerMove(event) {
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
    isPointerOverCanvas = true;
  }

  function onPointerLeave() {
    isPointerOverCanvas = false;
    labelDiv.style.display = 'none';
  }

  domElement.addEventListener('pointerdown', onPointerDown);
  domElement.addEventListener('pointerup', onPointerUp);
  domElement.addEventListener('pointercancel', onPointerUp);
  domElement.addEventListener('lostpointercapture', onPointerUp);
  domElement.addEventListener('pointermove', onPointerMove);
  domElement.addEventListener('pointerleave', onPointerLeave);

  /**
   * Call this every frame to update hover detection and label position.
   */
  function update() {
    if (isDragging || !isPointerOverCanvas) {
      labelDiv.style.display = 'none';
      return;
    }

    // Calculate NDC from mouse position
    const rect = domElement.getBoundingClientRect();
    ndc.x = ((lastMouseX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((lastMouseY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(pickables, true);

    if (hits.length === 0) {
      labelDiv.style.display = 'none';
      return;
    }

    const hit = hits[0];
    const label = findLabel(hit.object);

    if (!label) {
      labelDiv.style.display = 'none';
      return;
    }

    // Show label with text
    labelDiv.textContent = label;
    labelDiv.style.display = 'block';

    // Position label slightly offset from mouse cursor
    labelDiv.style.left = (lastMouseX + 15) + 'px';
    labelDiv.style.top = (lastMouseY - 25) + 'px';
  }

  return { update };
}
