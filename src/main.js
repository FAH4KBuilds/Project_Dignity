import { buildItems } from './layout.js';
import { createPhysics, FIXED_DT, MAX_SUBSTEPS } from './physics.js';
import { createDragController } from './drag.js';
import { createScene, addStaticMeshes, createItemMesh } from './scene.js';
import { createInteraction } from './interaction.js';
import { createBubbleTransition } from './bubbles.js';
import { createHoverLabel } from './hoverLabel.js';
import { createBagSystem } from './bags.js';
import { createSoftRag } from './softRag.js';
import { showTitle } from './title.js';
import { createTagSystem } from './tags.js';

const labelNameMap = {
  shampoo: 'Shampoo',
  bodyWash: 'Body Wash',
  conditioner: 'Hair Conditioner',
  wipes: 'Hand Wipes',
  soap: 'Soap',
  toothbrush: 'Toothbrush',
  washrag: 'Washrag',
  deodorant: 'Deodorant',
  lipBalm: 'Lip Balm',
};

const container = document.getElementById('app');
const { renderer, scene, camera } = createScene(container);
const { world, staticParts, createItemBody } = createPhysics();

addStaticMeshes(scene, staticParts);

const pairs = [];
const rags = [];
const trackedItems = [];
for (const item of buildItems()) {
  const label = labelNameMap[item.kind];
  if (item.kind === 'washrag') {
    const rag = createSoftRag({ world, scene, item });
    rag.mesh.userData.label = label;
    rags.push(rag);
    trackedItems.push({ body: rag.body, label, isHeld: () => rag.held });
    continue;
  }
  const body = createItemBody(item);
  const mesh = createItemMesh(item);
  mesh.userData.body = body;
  mesh.userData.label = label;
  scene.add(mesh);
  pairs.push({ body, mesh });
  trackedItems.push({ body, label });
}

const drag = createDragController(world);
const pickables = [...pairs.map((p) => p.mesh), ...rags.map((r) => r.mesh)];
const interaction = createInteraction({
  camera,
  domElement: renderer.domElement,
  drag,
  pickables,
});

const hoverLabel = createHoverLabel(camera, renderer.domElement, pickables);

const bags = createBagSystem({
  world,
  scene,
  camera,
  domElement: renderer.domElement,
  drag,
  pickables,
  items: trackedItems,
});

const tags = createTagSystem({
  world,
  scene,
  camera,
  domElement: renderer.domElement,
  drag,
  pickables,
  bags,
});

// Fixed-timestep physics driven by the render loop: accumulate real elapsed time
// and run whole FIXED_DT steps; leftover time carries into the next frame.
let accumulator = 0;
let last = performance.now();
let bubbleTransitionComplete = false;

async function startGame() {
  // Play bubble transition before allowing interaction
  await createBubbleTransition(scene, camera);
  bubbleTransitionComplete = true;
  showTitle('Toiletries 4 Dignity');
}

function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.1); // avoid a spiral after tab switches
  last = now;

  interaction.update();
  hoverLabel.update();

  accumulator += elapsed;
  let steps = 0;
  while (accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
    world.step(FIXED_DT);
    accumulator -= FIXED_DT;
    steps++;
  }
  if (steps === MAX_SUBSTEPS) accumulator = 0;

  for (const { body, mesh } of pairs) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }
  for (const rag of rags) rag.update();
  bags.update(elapsed);
  tags.update(elapsed);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Start the bubble transition, then begin the main game loop
startGame();
requestAnimationFrame(frame);
