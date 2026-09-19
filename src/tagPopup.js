const COLORS = ['#ffffff', '#000000', '#ff4d4d', '#ff9f1c', '#ffe066', '#51cf66', '#339af0', '#845ef7', '#f06595', '#8d6e63'];
const SIZES = [3, 6, 10, 16];
const CANVAS_W = 200;
const CANVAS_H = 280;

const STYLE = `
.tagpop-backdrop {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55);
  display: none; align-items: center; justify-content: center;
  z-index: 20000;
}
.tagpop-panel {
  background: #fffaf0; border-radius: 14px; padding: 18px;
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
  font-family: system-ui, -apple-system, sans-serif;
}
.tagpop-title { font-size: 15px; font-weight: 700; color: #5a4632; margin: 0; }
.tagpop-body { display: flex; gap: 12px; align-items: flex-start; }
.tagpop-colors { display: flex; flex-direction: column; gap: 6px; }
.tagpop-swatch {
  width: 22px; height: 22px; border-radius: 50%; cursor: pointer;
  border: 2px solid rgba(0, 0, 0, 0.15); padding: 0;
}
.tagpop-swatch.active { border-color: #222; box-shadow: 0 0 0 2px #fff, 0 0 0 4px #222; }
.tagpop-canvas { border-radius: 18px; border: 3px solid #c8a165; cursor: crosshair; touch-action: none; }
.tagpop-sizes { display: flex; gap: 8px; align-items: center; justify-content: center; }
.tagpop-size-btn {
  width: 30px; height: 30px; border-radius: 50%; border: 2px solid rgba(0, 0, 0, 0.15);
  background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
}
.tagpop-size-btn.active { border-color: #222; }
.tagpop-size-dot { border-radius: 50%; background: #333; display: block; }
.tagpop-actions { display: flex; gap: 10px; align-self: flex-end; }
.tagpop-btn { width: 36px; height: 36px; border-radius: 50%; border: none; cursor: pointer; font-size: 18px; font-weight: 700; color: #fff; }
.tagpop-done { background: #22a447; }
.tagpop-cancel { background: #c94f4f; }
`;

/** Tag-shaped drawing popup: colors on the left, brush sizes along the bottom, ✓ to finish. */
export function createTagPopup({ onComplete }) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  let color = COLORS[2];
  let size = SIZES[1];
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  const canvas = document.createElement('canvas');
  canvas.className = 'tagpop-canvas';
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');

  function resetCanvas() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = '#f5e9c8';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = '#c8a165';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, CANVAS_W - 4, CANVAS_H - 4);
    ctx.fillStyle = '#fffaf0';
    ctx.beginPath();
    ctx.arc(CANVAS_W / 2, 22, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a88448';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * CANVAS_W, ((e.clientY - r.top) / r.height) * CANVAS_H];
  }

  canvas.addEventListener('pointerdown', (e) => {
    drawing = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore: some input sources (or synthetic events) have no capturable pointer session.
    }
    [lastX, lastY] = canvasPoint(e);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lastX, lastY, size / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const [x, y] = canvasPoint(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(x, y);
    ctx.stroke();
    [lastX, lastY] = [x, y];
  });
  const endStroke = () => {
    drawing = false;
  };
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointercancel', endStroke);

  const colorsCol = document.createElement('div');
  colorsCol.className = 'tagpop-colors';
  const swatches = COLORS.map((c) => {
    const b = document.createElement('button');
    b.className = 'tagpop-swatch' + (c === color ? ' active' : '');
    b.style.background = c;
    b.addEventListener('click', () => {
      color = c;
      swatches.forEach((s) => s.classList.toggle('active', s === b));
    });
    colorsCol.appendChild(b);
    return b;
  });

  const sizesRow = document.createElement('div');
  sizesRow.className = 'tagpop-sizes';
  const sizeBtns = SIZES.map((s) => {
    const b = document.createElement('button');
    b.className = 'tagpop-size-btn' + (s === size ? ' active' : '');
    const dot = document.createElement('span');
    dot.className = 'tagpop-size-dot';
    dot.style.width = Math.max(4, s * 0.9) + 'px';
    dot.style.height = Math.max(4, s * 0.9) + 'px';
    b.appendChild(dot);
    b.addEventListener('click', () => {
      size = s;
      sizeBtns.forEach((btn) => btn.classList.toggle('active', btn === b));
    });
    sizesRow.appendChild(b);
    return b;
  });

  const body = document.createElement('div');
  body.className = 'tagpop-body';
  body.append(colorsCol, canvas);

  const title = document.createElement('h2');
  title.className = 'tagpop-title';
  title.textContent = 'Design Your Tag';

  const doneBtn = document.createElement('button');
  doneBtn.className = 'tagpop-btn tagpop-done';
  doneBtn.textContent = '✓';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tagpop-btn tagpop-cancel';
  cancelBtn.textContent = '✕';
  const actions = document.createElement('div');
  actions.className = 'tagpop-actions';
  actions.append(cancelBtn, doneBtn);

  const panel = document.createElement('div');
  panel.className = 'tagpop-panel';
  panel.append(title, body, sizesRow, actions);

  const backdrop = document.createElement('div');
  backdrop.className = 'tagpop-backdrop';
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  doneBtn.addEventListener('click', () => {
    backdrop.style.display = 'none';
    onComplete(canvas);
  });
  cancelBtn.addEventListener('click', () => {
    backdrop.style.display = 'none';
  });

  function open() {
    color = COLORS[2];
    size = SIZES[1];
    swatches.forEach((s, i) => s.classList.toggle('active', i === 2));
    sizeBtns.forEach((b, i) => b.classList.toggle('active', i === 1));
    resetCanvas();
    backdrop.style.display = 'flex';
  }

  return { open };
}
