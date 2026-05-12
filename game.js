const HEADER_HEIGHT = 44;
const RADIUS = 18;
const ATTACK_RANGE = RADIUS * 2.5;
const SPEED = 300;
const ENEMY_SPEED = 120;    // px/s — player (300) can clearly outrun
const DEAGGRO_RANGE = 300;  // px — enemy stops chasing beyond this

const PLAYER_MAX_HP   = 100;
const PLAYER_ATTACK   = 5;
const PLAYER_ATTACK_CD = 1.0; // seconds

const ENEMY_MAX_HP    = 20;
const ENEMY_ATTACK    = 5;
const ENEMY_ATTACK_CD  = 1.0; // seconds
const ENEMY_REGEN_INTERVAL = 0.5; // seconds between enemy regen ticks

const VERSION = '2026-05-12 17:05';

const ENEMY_SPAWN_MIN_DIST = 200;
const REGEN_COMBAT_DELAY   = 3.0;  // seconds out of combat before regen starts
const REGEN_INTERVAL       = 0.3;  // seconds between regen ticks

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let player, target, enemies, nextId, gameOver, lastTime;

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - HEADER_HEIGHT;
}

function init() {
  resize();
  player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    hp: PLAYER_MAX_HP,
    attackCd:    0,
    combatDelay: 0,         // counts down to 0; regen allowed only when <= 0
    regenTick:   REGEN_INTERVAL,
  };
  target  = { x: player.x, y: player.y };
  enemies = [];
  nextId  = 0;
  gameOver = false;
  lastTime = null;
}

function spawnEnemy() {
  if (gameOver) return;
  const angle = Math.random() * Math.PI * 2;
  const dist  = ENEMY_SPAWN_MIN_DIST + Math.random() * 200;
  let x = player.x + Math.cos(angle) * dist;
  let y = player.y + Math.sin(angle) * dist;
  x = Math.max(ATTACK_RANGE + 4, Math.min(canvas.width  - ATTACK_RANGE - 4, x));
  y = Math.max(ATTACK_RANGE + 4, Math.min(canvas.height - ATTACK_RANGE - 4, y));
  enemies.push({ id: nextId++, x, y, spawnX: x, spawnY: y, state: 'idle', hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP, attackCd: 0, regenTick: ENEMY_REGEN_INTERVAL, combatDelay: 0 });
}

function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

canvas.addEventListener('click', (e) => { if (!gameOver) target = getEventPos(e); });
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!gameOver) target = getEventPos(e);
}, { passive: false });
document.getElementById('add-enemy').addEventListener('click', spawnEnemy);
window.addEventListener('resize', resize);

init();

function update(dt) {
  if (gameOver) return;

  // Move player toward target
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distToTarget = Math.hypot(dx, dy);
  const isMoving = distToTarget > 2;
  if (isMoving) {
    const step = Math.min(SPEED * dt, distToTarget);
    player.x += (dx / distToTarget) * step;
    player.y += (dy / distToTarget) * step;
  }

  // Move enemies
  for (const enemy of enemies) {
    if (enemy.state === 'chasing') {
      const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (d > DEAGGRO_RANGE) {
        enemy.state = 'returning';
      } else if (d > ATTACK_RANGE + RADIUS) {
        const step = Math.min(ENEMY_SPEED * dt, d - (ATTACK_RANGE + RADIUS));
        enemy.x += (player.x - enemy.x) / d * step;
        enemy.y += (player.y - enemy.y) / d * step;
      }
    } else if (enemy.state === 'returning') {
      const rdx = enemy.spawnX - enemy.x;
      const rdy = enemy.spawnY - enemy.y;
      const d = Math.hypot(rdx, rdy);
      if (d < 2) {
        enemy.x = enemy.spawnX;
        enemy.y = enemy.spawnY;
        enemy.state = 'idle';
      } else {
        const step = Math.min(ENEMY_SPEED * dt, d);
        enemy.x += rdx / d * step;
        enemy.y += rdy / d * step;
      }
    }
  }

  // Tick all attack cooldowns
  player.attackCd = Math.max(0, player.attackCd - dt);
  for (const e of enemies) e.attackCd = Math.max(0, e.attackCd - dt);

  // Combat: check each enemy's range against player
  let anyInRange = false;
  for (const e of enemies) e.inCombat = false;

  for (const enemy of enemies) {
    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > ATTACK_RANGE + RADIUS) continue;
    anyInRange = true;
    enemy.inCombat = true;

    if (enemy.attackCd <= 0) {
      enemy.attackCd = ENEMY_ATTACK_CD;
      player.hp = Math.max(0, player.hp - ENEMY_ATTACK);
      if (player.hp === 0) { gameOver = true; return; }
    }
  }

  // Player fires at all in-range enemies on a single shared cooldown
  if (player.attackCd <= 0 && anyInRange) {
    player.attackCd = PLAYER_ATTACK_CD;
    for (const enemy of enemies) {
      if (Math.hypot(player.x - enemy.x, player.y - enemy.y) <= ATTACK_RANGE + RADIUS) {
        enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK);
        if (enemy.hp > 0) enemy.state = 'chasing';
      }
    }
  }

  enemies = enemies.filter(e => e.hp > 0);

  // Enemy HP regen: same rules as player (out of combat, 3s delay)
  for (const enemy of enemies) {
    if (enemy.inCombat || enemy.state !== 'idle') {
      enemy.combatDelay = REGEN_COMBAT_DELAY;
      enemy.regenTick   = ENEMY_REGEN_INTERVAL;
    } else {
      enemy.combatDelay = Math.max(0, enemy.combatDelay - dt);
      if (enemy.combatDelay <= 0 && enemy.hp < enemy.maxHp) {
        enemy.regenTick -= dt;
        if (enemy.regenTick <= 0) {
          enemy.regenTick = ENEMY_REGEN_INTERVAL;
          enemy.hp = Math.min(enemy.maxHp, enemy.hp + 1);
        }
      }
    }
  }

  // HP regen: blocked while in combat or moving; 3s delay required after leaving combat
  if (anyInRange) {
    player.combatDelay = REGEN_COMBAT_DELAY;
    player.regenTick   = REGEN_INTERVAL;
  } else {
    player.combatDelay = Math.max(0, player.combatDelay - dt);
    if (player.combatDelay <= 0 && !isMoving && player.hp < PLAYER_MAX_HP) {
      player.regenTick -= dt;
      if (player.regenTick <= 0) {
        player.regenTick = REGEN_INTERVAL;
        player.hp = Math.min(PLAYER_MAX_HP, player.hp + 1);
      }
    }
  }
}

function circle(x, y, r, fill, stroke, lw = 1.5) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function hpText(x, y, hp, maxHp) {
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = '#ddd';
  ctx.fillText(`${hp}/${maxHp}`, x, y - RADIUS - 4);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Target indicator
  circle(target.x, target.y, 5, 'rgba(255,255,255,0.11)', null);

  // Attack range rings — drawn first so models appear on top
  for (const e of enemies) {
    circle(e.x, e.y, ATTACK_RANGE, 'rgba(255,80,80,0.10)', 'rgba(255,100,100,0.35)', 1);
  }
  circle(player.x, player.y, ATTACK_RANGE, 'rgba(68,170,255,0.10)', 'rgba(68,170,255,0.35)', 1);

  // Character models
  for (const e of enemies) circle(e.x, e.y, RADIUS, '#c44', '#f88', 2);
  circle(player.x, player.y, RADIUS, '#4af', '#8cf', 2);

  // HP labels
  for (const e of enemies) hpText(e.x, e.y, e.hp, e.maxHp);
  hpText(player.x, player.y, player.hp, PLAYER_MAX_HP);

  // Version label
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillText(VERSION, 8, canvas.height - 8);

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.72)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillStyle = '#f55';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 24);
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#999';
    ctx.fillText('Reload the page to play again', canvas.width / 2, canvas.height / 2 + 28);
  }
}

function loop(timestamp) {
  const dt = lastTime === null ? 0 : Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
