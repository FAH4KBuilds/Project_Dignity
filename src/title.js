const STYLE = `
@font-face {
  font-family: 'Chewy';
  src: url('/fonts/Chewy-Regular.ttf') format('truetype');
  font-display: swap;
}
.game-title {
  position: fixed;
  top: 18px;
  left: 50%;
  margin: 0;
  font-family: 'Chewy', 'Comic Sans MS', cursive;
  font-size: clamp(32px, 6vw, 84px);
  font-weight: normal;
  color: #00e3ff;
  -webkit-text-stroke: 8px #af1ef9;
  paint-order: stroke fill;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
  z-index: 50;
  opacity: 0;
  transform: translate(-50%, -30px);
  transition: opacity 0.8s ease-out, transform 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.game-title.visible {
  opacity: 1;
  transform: translate(-50%, 0);
}
`;

export function showTitle(text) {
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);

  const title = document.createElement('h1');
  title.className = 'game-title';
  title.textContent = text;
  document.body.appendChild(title);
  requestAnimationFrame(() => requestAnimationFrame(() => title.classList.add('visible')));
}
