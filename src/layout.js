// Pure data describing the room, furniture and toiletry items.
// Units are meters / kilograms. Shared by physics (cannon-es) and rendering (three).
// This module has no dependencies so it can be used headlessly.

export const ROOM = {
  minX: -2.1,
  maxX: 2.1,
  backZ: -0.25, // back wall
  frontZ: 0.45, // invisible front wall: keeps play in a shallow depth slab
  height: 2.6,
};

export const SHELF = {
  centerX: -0.95,
  centerZ: 0,
  width: 1.2,
  depth: 0.34,
  height: 1.9,
  sideT: 0.03,
  boardT: 0.03,
  backT: 0.02,
  // Top-surface Y of each board. Index 0 = shelf 1 (topmost) ... index 4 = shelf 5 (bottom).
  levels: [1.64, 1.26, 0.88, 0.5, 0.12],
};

export const TABLE = {
  centerX: 0.95,
  centerZ: 0.02,
  width: 1.2,
  depth: 0.5,
  topY: 0.75,
  topT: 0.05,
  legW: 0.05,
  apronH: 0.08,
  apronT: 0.02,
};

const WHITE = 0xf4f4f2;
const PURPLE_TOP = 0x7b3fbf;

/** Static furniture parts as boxes: { size:[x,y,z], pos:[x,y,z], color } */
export function buildStaticParts() {
  const parts = [];
  const s = SHELF;
  const innerW = s.width - 2 * s.sideT;

  // Shelving unit: four slim corner posts (open sides so items can be slid out
  // sideways within the shallow play depth), a back panel, 5 boards.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        name: 'shelf-post',
        size: [s.sideT, s.height, s.sideT],
        pos: [s.centerX + sx * (s.width / 2 - s.sideT / 2), s.height / 2, s.centerZ + sz * (s.depth / 2 - s.sideT / 2)],
        color: WHITE,
      });
    }
  }
  parts.push({
    name: 'shelf-back',
    size: [s.width, s.height, s.backT],
    pos: [s.centerX, s.height / 2, s.centerZ - s.depth / 2 - s.backT / 2],
    color: WHITE,
  });
  s.levels.forEach((y, i) => {
    parts.push({
      name: `shelf-${i + 1}`,
      size: [innerW, s.boardT, s.depth],
      pos: [s.centerX, y - s.boardT / 2, s.centerZ],
      color: WHITE,
    });
  });

  // Table: purple top, white legs and apron frame.
  const t = TABLE;
  const legH = t.topY - t.topT;
  // The collider is thicker than the visible top (it extends down into the space
  // enclosed by the apron) so fast-falling items can't tunnel through it.
  const colliderT = t.topT + t.apronH;
  parts.push({
    name: 'table-top',
    size: [t.width, t.topT, t.depth],
    pos: [t.centerX, t.topY - t.topT / 2, t.centerZ],
    collider: { size: [t.width, colliderT, t.depth], pos: [t.centerX, t.topY - colliderT / 2, t.centerZ] },
    color: PURPLE_TOP,
  });
  const lx = t.width / 2 - t.legW / 2 - 0.03;
  const lz = t.depth / 2 - t.legW / 2 - 0.03;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push({
        name: 'table-leg',
        size: [t.legW, legH, t.legW],
        pos: [t.centerX + sx * lx, legH / 2, t.centerZ + sz * lz],
        color: WHITE,
      });
    }
  }
  const apronY = legH - t.apronH / 2;
  for (const sz of [-1, 1]) {
    parts.push({
      name: 'table-apron',
      size: [2 * lx, t.apronH, t.apronT],
      pos: [t.centerX, apronY, t.centerZ + sz * lz],
      color: WHITE,
    });
  }
  for (const sx of [-1, 1]) {
    parts.push({
      name: 'table-apron',
      size: [t.apronT, t.apronH, 2 * lz],
      pos: [t.centerX + sx * lx, apronY, t.centerZ],
      color: WHITE,
    });
  }
  return parts;
}

// ---------------------------------------------------------------------------
// Toiletry item templates. Physics shape is either an upright cylinder
// (axis = Y) or a box. `dims` = {radius, height} or {size:[x,y,z]}.
// Masses are rough real-world values.
// ---------------------------------------------------------------------------
const T = {
  shampoo: (color) => ({ kind: 'shampoo', shape: 'cylinder', radius: 0.033, height: 0.2, mass: 0.35, color }),
  bodyWash: (color) => ({ kind: 'bodyWash', shape: 'cylinder', radius: 0.035, height: 0.21, mass: 0.4, color }),
  conditioner: (color) => ({ kind: 'conditioner', shape: 'cylinder', radius: 0.032, height: 0.19, mass: 0.33, color }),
  soap: (color) => ({ kind: 'soap', shape: 'box', size: [0.09, 0.035, 0.06], mass: 0.12, color }),
  wipes: (color) => ({ kind: 'wipes', shape: 'cylinder', radius: 0.055, height: 0.075, mass: 0.25, color }),
  toothbrush: (color) => ({ kind: 'toothbrush', shape: 'box', size: [0.018, 0.028, 0.19], mass: 0.02, color }),
  washrag: (color) => ({ kind: 'washrag', shape: 'box', size: [0.15, 0.03, 0.15], mass: 0.06, color }),
  deodorant: (color) => ({ kind: 'deodorant', shape: 'box', size: [0.05, 0.12, 0.03], mass: 0.08, color }),
  lipBalm: (color) => ({ kind: 'lipBalm', shape: 'cylinder', radius: 0.01, height: 0.065, mass: 0.015, color }),
};

const SHELF_CONTENTS = [
  // Shelf 1 (top)
  [
    T.shampoo(0xff8fc8), T.shampoo(0xff8fc8), T.shampoo(0xff8fc8),
    T.bodyWash(0x2f7de1), T.bodyWash(0x2f7de1), T.bodyWash(0x2f7de1),
    T.conditioner(0x8e4fd6), T.conditioner(0x8e4fd6), T.conditioner(0x8e4fd6),
  ],
  // Shelf 2
  [
    T.soap(0xfafaf5), T.soap(0xd9c29a), T.soap(0xfafaf5),
    T.wipes(0x8fd3c4), T.wipes(0x8fd3c4),
  ],
  // Shelf 3
  [
    T.toothbrush(0xe53935), T.toothbrush(0x43a047), T.toothbrush(0xfb8c00), T.toothbrush(0x00acc1),
    T.washrag(0xf28b82), T.washrag(0xfdd663),
  ],
  // Shelf 4
  [
    T.deodorant(0x5f6b7a), T.deodorant(0x2b4c7e), T.deodorant(0x9aa5b1),
    T.lipBalm(0xe85d75), T.lipBalm(0xf2a65a), T.lipBalm(0x6cc3a0),
  ],
  // Shelf 5 (bottom): empty
  [],
];

export function itemWidthX(item) {
  return item.shape === 'cylinder' ? item.radius * 2 : item.size[0];
}

export function itemHeight(item) {
  return item.shape === 'cylinder' ? item.height : item.size[1];
}

/** All items with initial positions, laid out in a row on their shelf with equal gaps. */
export function buildItems() {
  const s = SHELF;
  const innerMin = s.centerX - s.width / 2 + s.sideT;
  const innerW = s.width - 2 * s.sideT;
  const items = [];

  SHELF_CONTENTS.forEach((row, shelfIndex) => {
    if (row.length === 0) return;
    const widths = row.map(itemWidthX);
    const gap = (innerW - widths.reduce((a, b) => a + b, 0)) / (row.length + 1);
    if (gap <= 0) throw new Error(`Shelf ${shelfIndex + 1} is overfull`);
    let x = innerMin + gap;
    row.forEach((item, i) => {
      const y = s.levels[shelfIndex] + itemHeight(item) / 2 + 0.001;
      items.push({ ...item, shelf: shelfIndex + 1, pos: [x + widths[i] / 2, y, s.centerZ] });
      x += widths[i] + gap;
    });
  });
  return items;
}
