const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const RADIUS = 18;
const SPEED = 300; // pixels per second

let player = { x: 0, y: 0 };
let target = null;
let lastTime = null;

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (player.x === 0 && player.y === 0) {
    player.x = canvas.width / 2;
    player.y = canvas.height / 2;
    target = { x: player.x, y: player.y };
  }
}

function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('click', (e) => { target = getEventPos(e); });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); target = getEventPos(e); }, { passive: false });

window.addEventListener('resize', resize);
resize();

function update(dt) {
  if (!target) return;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) {
    player.x = target.x;
    player.y = target.y;
    return;
  }
  const step = Math.min(SPEED * dt, dist);
  player.x += (dx / dist) * step;
  player.y += (dy / dist) * step;
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // target indicator
  if (target) {
    ctx.beginPath();
    ctx.arc(target.x, target.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
  }

  // player
  ctx.beginPath();
  ctx.arc(player.x, player.y, RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = '#4af';
  ctx.fill();
  ctx.strokeStyle = '#8cf';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function loop(timestamp) {
  const dt = lastTime === null ? 0 : (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
