const HEADER_HEIGHT = 44;
const RADIUS = 18;
const ATTACK_RANGE = RADIUS * 2.5;
const SPEED = 300;
const ENEMY_SPEED = 120;
const SPAWN_LEASH  = 400;
const NEAR_DEAGGRO = 150;
const FAR_DEAGGRO  = 50;

const MAP_W = 3000;
const MAP_H = 3000;

const PLAYER_MAX_HP    = 100;
const PLAYER_ATTACK    = 5;
const PLAYER_ATTACK_CD = 1.0;

const POTION_HEAL = 50;
const POTION_CD   = 20;
const POTION_SIZE = 52;

const ENEMY_MAX_HP         = 20;
const ENEMY_ATTACK         = 5;
const ENEMY_ATTACK_CD      = 1.0;
const ENEMY_REGEN_INTERVAL = 0.5;

const VERSION = '2026-05-12 19:00';

const ENEMY_SPAWN_MIN_DIST = 200;
const REGEN_COMBAT_DELAY   = 3.0;
const REGEN_INTERVAL       = 0.3;

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
    x: MAP_W / 2, y: MAP_H / 2,
    hp: PLAYER_MAX_HP,
    attackCd: 0, combatDelay: 0, regenTick: REGEN_INTERVAL,
    level: 1, xp: 0, damage: PLAYER_ATTACK,
    potionCd: 0,
  };
  target  = { x: player.x, y: player.y };
  enemies = [];
  nextId  = 0;
  gameOver = false;
  lastTime = null;
  initEnemies();
}

function initEnemies() {
  for (let i = 0; i < 15; i++) {
    let x, y;
    do {
      x = RADIUS + Math.random() * (MAP_W - RADIUS * 2);
      y = RADIUS + Math.random() * (MAP_H - RADIUS * 2);
    } while (Math.hypot(x - player.x, y - player.y) < 300);
    enemies.push(makeEnemy(x, y));
  }
}

function makeEnemy(x, y) {
  return { id: nextId++, x, y, spawnX: x, spawnY: y, state: 'idle',
           hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
           attackCd: 0, regenTick: ENEMY_REGEN_INTERVAL, combatDelay: 0 };
}

function spawnEnemy() {
  if (gameOver) return;
  const angle = Math.random() * Math.PI * 2;
  const dist  = ENEMY_SPAWN_MIN_DIST + Math.random() * 200;
  const x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x + Math.cos(angle) * dist));
  const y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y + Math.sin(angle) * dist));
  enemies.push(makeEnemy(x, y));
}

function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function screenToWorld(sx, sy) {
  return { x: sx + player.x - canvas.width / 2, y: sy + player.y - canvas.height / 2 };
}

function potionRect() {
  return { x: Math.floor(canvas.width / 2 - POTION_SIZE / 2), y: canvas.height - POTION_SIZE - 12, w: POTION_SIZE, h: POTION_SIZE };
}

function usePotion() {
  if (player.potionCd > 0) return;
  player.hp = Math.min(PLAYER_MAX_HP, player.hp + POTION_HEAL);
  player.potionCd = POTION_CD;
}

function handleTap(screenPos) {
  const r = potionRect();
  if (screenPos.x >= r.x && screenPos.x <= r.x + r.w && screenPos.y >= r.y && screenPos.y <= r.y + r.h) {
    usePotion();
  } else {
    target = screenToWorld(screenPos.x, screenPos.y);
  }
}

canvas.addEventListener('click', (e) => { if (!gameOver) handleTap(getEventPos(e)); });
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!gameOver) handleTap(getEventPos(e));
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!gameOver) { const p = getEventPos(e); target = screenToWorld(p.x, p.y); }
}, { passive: false });
document.getElementById('add-enemy').addEventListener('click', spawnEnemy);
window.addEventListener('resize', resize);

init();

function update(dt) {
  if (gameOver) return;

  // Move player
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const distToTarget = Math.hypot(dx, dy);
  const isMoving = distToTarget > 2;
  if (isMoving) {
    const step = Math.min(SPEED * dt, distToTarget);
    player.x += (dx / distToTarget) * step;
    player.y += (dy / distToTarget) * step;
  }
  player.x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x));
  player.y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y));

  // Move enemies
  for (const enemy of enemies) {
    if (enemy.state === 'chasing') {
      const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      const fromSpawn = Math.hypot(enemy.x - enemy.spawnX, enemy.y - enemy.spawnY);
      const deaggroAt = fromSpawn > SPAWN_LEASH ? FAR_DEAGGRO : NEAR_DEAGGRO;
      if (d > deaggroAt) {
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
        enemy.x = enemy.spawnX; enemy.y = enemy.spawnY; enemy.state = 'idle';
      } else {
        const step = Math.min(ENEMY_SPEED * dt, d);
        enemy.x += rdx / d * step;
        enemy.y += rdy / d * step;
      }
    }
  }

  // Tick cooldowns
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.potionCd = Math.max(0, player.potionCd - dt);
  for (const e of enemies) e.attackCd = Math.max(0, e.attackCd - dt);

  // Combat
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

  if (player.attackCd <= 0 && anyInRange) {
    player.attackCd = PLAYER_ATTACK_CD;
    for (const enemy of enemies) {
      if (Math.hypot(player.x - enemy.x, player.y - enemy.y) <= ATTACK_RANGE + RADIUS) {
        enemy.hp = Math.max(0, enemy.hp - player.damage);
        if (enemy.hp === 0) {
          player.xp += 20;
          while (player.xp >= 100) { player.xp -= 100; player.level++; player.damage++; }
        } else {
          enemy.state = 'chasing';
        }
      }
    }
  }

  enemies = enemies.filter(e => e.hp > 0);

  // Enemy regen
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

  // Player regen
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

function drawPotion() {
  const { x, y, w, h } = potionRect();
  const cx = x + w / 2;
  const ready = player.potionCd <= 0;

  ctx.fillStyle = ready ? 'rgba(60,10,80,0.88)' : 'rgba(28,28,28,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = ready ? '#b05cff' : '#444';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  const bodyY = y + h * 0.64;
  const neckX = cx - 3.5, neckY = bodyY - 13;
  circle(cx, bodyY, 11, ready ? '#cc44ff' : '#555', null);
  ctx.fillStyle = ready ? '#8822bb' : '#3a3a3a';
  ctx.fillRect(neckX, neckY, 7, 11);
  ctx.fillStyle = ready ? '#bb8844' : '#444';
  ctx.fillRect(neckX + 0.5, neckY - 5, 6, 6);
  if (ready) circle(cx - 4, bodyY - 4, 3, 'rgba(255,255,255,0.32)', null);

  if (!ready) {
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#888';
    ctx.fillText(Math.ceil(player.potionCd) + 's', cx, y + h - 3);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── World space (camera locked to player) ──────────────────────────────
  ctx.save();
  ctx.translate(Math.round(canvas.width / 2 - player.x), Math.round(canvas.height / 2 - player.y));

  // Map background + border
  ctx.fillStyle = '#181818';
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, MAP_W, MAP_H);

  // Target indicator
  circle(target.x, target.y, 5, 'rgba(255,255,255,0.11)', null);

  // Attack range rings (bottom layer)
  for (const e of enemies) circle(e.x, e.y, ATTACK_RANGE, 'rgba(255,80,80,0.10)', 'rgba(255,100,100,0.35)', 1);
  circle(player.x, player.y, ATTACK_RANGE, 'rgba(68,170,255,0.10)', 'rgba(68,170,255,0.35)', 1);

  // Character models
  for (const e of enemies) circle(e.x, e.y, RADIUS, '#c44', '#f88', 2);
  circle(player.x, player.y, RADIUS, '#4af', '#8cf', 2);

  // HP labels
  for (const e of enemies) hpText(e.x, e.y, e.hp, e.maxHp);
  hpText(player.x, player.y, player.hp, PLAYER_MAX_HP);

  ctx.restore();
  // ── Screen space UI ────────────────────────────────────────────────────

  ctx.font = '13px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Level ${player.level}   Damage ${player.damage}`, 10, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`XP  ${player.xp} / 100`, 10, 30);

  drawPotion();

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
