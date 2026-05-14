const HEADER_HEIGHT = 44;
const RADIUS = 18;
const ATTACK_RANGE = RADIUS * 2.5;
const SPEED = 300;
const ENEMY_SPEED = 120;
const SPAWN_LEASH = 700;  // how far player can be from enemy spawn before enemy gives up

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

const VERSION = '2026-05-14 11:00';

const ENEMY_SPAWN_MIN_DIST = 200;
const REGEN_COMBAT_DELAY   = 3.0;
const REGEN_INTERVAL       = 0.3;

const TREE_SIZE     = 48;
const TREE_COUNT    = 70;
const TREE_MIN_DIST = 200;

const MINIMAP_SIZE   = 130;
const MINIMAP_MARGIN = 10;

const BOW_RANGE   = 900;
const BOW_CD      = 2.0;
const ARROW_SPEED = 500;

const WEAPON_SIZE   = 52;
const WEAPON_MARGIN = 12;
const ATTACK_BTN_H  = 28;

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let player, target, enemies, arrows, trees, nextId, gameOver, lastTime;
let touchStartPos = null, touchDragged = false;

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
    weapon: 'sword', bowCd: 0,
    selectedEnemyId: null,
    attackTarget: null,   // id of enemy player is actively chasing to melee
  };
  target   = { x: player.x, y: player.y };
  enemies  = [];
  arrows   = [];
  nextId   = 0;
  gameOver = false;
  lastTime = null;
  initTrees();
  initEnemies();
}

function initTrees() {
  trees = [];
  let attempts = 0;
  while (trees.length < TREE_COUNT && attempts < 3000) {
    attempts++;
    const x = TREE_SIZE * 1.5 + Math.random() * (MAP_W - TREE_SIZE * 3);
    const y = TREE_SIZE * 1.5 + Math.random() * (MAP_H - TREE_SIZE * 3);
    if (Math.hypot(x - MAP_W / 2, y - MAP_H / 2) < TREE_MIN_DIST) continue;
    trees.push({ x, y });
  }
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
           name: 'Wild Boar',
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

// Circle-AABB: returns push vector to move circle out of rect, or null
function resolveCircleRect(cx, cy, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(rx + rw, cx));
  const nearY = Math.max(ry, Math.min(ry + rh, cy));
  const dx = cx - nearX;
  const dy = cy - nearY;
  const dist = Math.hypot(dx, dy);
  if (dist >= RADIUS) return null;
  if (dist === 0) {
    const dLeft  = cx - rx;
    const dRight = rx + rw - cx;
    const dTop   = cy - ry;
    const dBot   = ry + rh - cy;
    const minD   = Math.min(dLeft, dRight, dTop, dBot);
    if (minD === dLeft)  return { px: -(RADIUS + dLeft),  py: 0 };
    if (minD === dRight) return { px:  (RADIUS + dRight), py: 0 };
    if (minD === dTop)   return { px: 0, py: -(RADIUS + dTop) };
    return                       { px: 0, py:  (RADIUS + dBot) };
  }
  const overlap = RADIUS - dist;
  return { px: (dx / dist) * overlap, py: (dy / dist) * overlap };
}

function applyTreeCollisions(entity) {
  for (const t of trees) {
    const push = resolveCircleRect(
      entity.x, entity.y,
      t.x - TREE_SIZE / 2, t.y - TREE_SIZE / 2, TREE_SIZE, TREE_SIZE
    );
    if (push) { entity.x += push.px; entity.y += push.py; }
  }
}

function getEventPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function screenToWorld(sx, sy) {
  return { x: sx + player.x - canvas.width / 2, y: sy + player.y - canvas.height / 2 };
}

function inRect(pos, r) {
  return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
}

function potionRect() {
  return { x: Math.floor(canvas.width / 2 - POTION_SIZE / 2), y: canvas.height - POTION_SIZE - 12, w: POTION_SIZE, h: POTION_SIZE };
}

function weaponRects() {
  const rx = canvas.width - WEAPON_SIZE - WEAPON_MARGIN;
  const midY = Math.floor(canvas.height / 2);
  return {
    sword: { x: rx, y: midY - WEAPON_SIZE - 4, w: WEAPON_SIZE, h: WEAPON_SIZE },
    bow:   { x: rx, y: midY + 4,               w: WEAPON_SIZE, h: WEAPON_SIZE },
  };
}

function attackBtnRect() {
  const wr = weaponRects();
  return { x: wr.bow.x, y: wr.bow.y + WEAPON_SIZE + 8, w: WEAPON_SIZE, h: ATTACK_BTN_H };
}

function minimapRect() {
  return { x: canvas.width - MINIMAP_SIZE - MINIMAP_MARGIN, y: MINIMAP_MARGIN };
}

function usePotion() {
  if (player.potionCd > 0) return;
  player.hp = Math.min(PLAYER_MAX_HP, player.hp + POTION_HEAL);
  player.potionCd = POTION_CD;
}

function shootArrow(enemy) {
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist > BOW_RANGE || player.bowCd > 0) return;
  player.bowCd = BOW_CD;
  enemy.state = 'chasing';
  arrows.push({
    x: player.x, y: player.y,
    vx: (dx / dist) * ARROW_SPEED,
    vy: (dy / dist) * ARROW_SPEED,
    lifetime: BOW_RANGE / ARROW_SPEED + 0.2,
  });
}

function executeAttack() {
  const enemy = enemies.find(e => e.id === player.selectedEnemyId);
  if (!enemy) return;
  if (player.weapon === 'bow') {
    shootArrow(enemy);
  } else {
    player.attackTarget = enemy.id;
  }
}

function handleTap(screenPos) {
  // Minimap — ignore
  const mm = minimapRect();
  if (screenPos.x >= mm.x && screenPos.y <= MINIMAP_SIZE + MINIMAP_MARGIN * 2) return;

  // Potion
  if (inRect(screenPos, potionRect())) { usePotion(); return; }

  // Weapon tiles
  const wr = weaponRects();
  if (inRect(screenPos, wr.sword)) { player.weapon = 'sword'; return; }
  if (inRect(screenPos, wr.bow))   { player.weapon = 'bow';   return; }

  // Attack button
  if (inRect(screenPos, attackBtnRect())) { executeAttack(); return; }

  // Enemy selection
  const worldPos = screenToWorld(screenPos.x, screenPos.y);
  for (const enemy of enemies) {
    if (Math.hypot(worldPos.x - enemy.x, worldPos.y - enemy.y) <= RADIUS * 1.5) {
      player.selectedEnemyId = enemy.id;
      player.attackTarget = null;
      return;
    }
  }

  // Tap on empty space — deselect
  player.selectedEnemyId = null;
  player.attackTarget = null;
}

// Mouse: drag to move, click (no drag) to tap
let mouseDown = false, mouseStartPos = null, mouseDragged = false;
canvas.addEventListener('mousedown', (e) => {
  if (!gameOver) { mouseDown = true; mouseStartPos = getEventPos(e); mouseDragged = false; }
});
canvas.addEventListener('mousemove', (e) => {
  if (!gameOver && mouseDown && mouseStartPos) {
    const p = getEventPos(e);
    if (!mouseDragged && Math.hypot(p.x - mouseStartPos.x, p.y - mouseStartPos.y) > 4) mouseDragged = true;
    if (mouseDragged) target = screenToWorld(p.x, p.y);
  }
});
canvas.addEventListener('mouseup', (e) => {
  if (!gameOver && mouseStartPos && !mouseDragged) handleTap(mouseStartPos);
  mouseDown = false; mouseStartPos = null; mouseDragged = false;
});
canvas.addEventListener('mouseleave', () => { mouseDown = false; mouseStartPos = null; mouseDragged = false; });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!gameOver) { touchStartPos = getEventPos(e); touchDragged = false; }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  if (!gameOver && touchStartPos) {
    const p = getEventPos(e);
    if (!touchDragged && Math.hypot(p.x - touchStartPos.x, p.y - touchStartPos.y) > 12) touchDragged = true;
    if (touchDragged) target = screenToWorld(p.x, p.y);
  }
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  if (!gameOver && !touchDragged && touchStartPos) handleTap(touchStartPos);
  touchStartPos = null; touchDragged = false;
}, { passive: false });
document.getElementById('add-enemy').addEventListener('click', spawnEnemy);
window.addEventListener('resize', resize);

init();

function update(dt) {
  if (gameOver) return;

  // Steer toward melee attack target
  if (player.attackTarget !== null) {
    const tgt = enemies.find(e => e.id === player.attackTarget);
    if (!tgt) {
      player.attackTarget = null;
    } else {
      const tdx = player.x - tgt.x;
      const tdy = player.y - tgt.y;
      const td = Math.hypot(tdx, tdy);
      const stopAt = ATTACK_RANGE + RADIUS * 0.5;
      if (td > stopAt) {
        target = { x: tgt.x + (tdx / td) * stopAt, y: tgt.y + (tdy / td) * stopAt };
      } else {
        target = { x: player.x, y: player.y }; // in range — stop moving
      }
    }
  }

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
  applyTreeCollisions(player);
  player.x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x));
  player.y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y));

  // Move enemies — de-aggro when player strays too far from enemy's home
  for (const enemy of enemies) {
    if (enemy.state === 'chasing') {
      const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      const playerFromSpawn = Math.hypot(player.x - enemy.spawnX, player.y - enemy.spawnY);
      if (playerFromSpawn > SPAWN_LEASH) {
        enemy.state = 'returning';
      } else if (d > ATTACK_RANGE + RADIUS) {
        const step = Math.min(ENEMY_SPEED * dt, d - (ATTACK_RANGE + RADIUS));
        enemy.x += (player.x - enemy.x) / d * step;
        enemy.y += (player.y - enemy.y) / d * step;
        applyTreeCollisions(enemy);
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
        applyTreeCollisions(enemy);
      }
    }
  }

  // Tick cooldowns
  player.attackCd = Math.max(0, player.attackCd - dt);
  player.potionCd = Math.max(0, player.potionCd - dt);
  player.bowCd    = Math.max(0, player.bowCd - dt);
  for (const e of enemies) e.attackCd = Math.max(0, e.attackCd - dt);

  // Update arrows
  arrows = arrows.filter(a => {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.lifetime -= dt;
    if (a.lifetime <= 0) return false;
    for (const enemy of enemies) {
      if (enemy.hp <= 0) continue;
      if (Math.hypot(a.x - enemy.x, a.y - enemy.y) <= RADIUS) {
        enemy.hp = Math.max(0, enemy.hp - player.damage);
        if (enemy.hp === 0) {
          player.xp += 20;
          while (player.xp >= 100) { player.xp -= 100; player.level++; player.damage++; }
        }
        return false;
      }
    }
    return true;
  });
  enemies = enemies.filter(e => e.hp > 0);

  // Combat (enemies always attack in melee; player auto-attacks with sword when in range)
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

  if (player.weapon === 'sword' && player.attackCd <= 0 && anyInRange) {
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

  // Clean up stale selection / attack target
  if (player.selectedEnemyId !== null && !enemies.some(e => e.id === player.selectedEnemyId)) {
    player.selectedEnemyId = null;
  }
  if (player.attackTarget !== null && !enemies.some(e => e.id === player.attackTarget)) {
    player.attackTarget = null;
  }

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

function drawTree(t) {
  const x = t.x - TREE_SIZE / 2;
  const y = t.y - TREE_SIZE / 2;
  ctx.fillStyle = '#1c5c1c';
  ctx.fillRect(x, y, TREE_SIZE, TREE_SIZE);
  ctx.strokeStyle = '#0d3a0d';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, TREE_SIZE, TREE_SIZE);
  const tw = 10, th = 14;
  ctx.fillStyle = '#4a2d0a';
  ctx.fillRect(x + (TREE_SIZE - tw) / 2, y + TREE_SIZE - th, tw, th);
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

function drawSwordIcon(cx, cy, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(cx, cy - 14); ctx.lineTo(cx, cy + 6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 8, cy + 4); ctx.lineTo(cx + 8, cy + 4); ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cx, cy + 6); ctx.lineTo(cx, cy + 14); ctx.stroke();
}

function drawBowIcon(cx, cy, color) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx + 5, cy, 13, Math.PI * 0.58, Math.PI * 1.42, false);
  ctx.stroke();
  const sx = cx + 5 + 13 * Math.cos(Math.PI * 0.58);
  const sy1 = cy + 13 * Math.sin(Math.PI * 0.58);
  const sy2 = cy + 13 * Math.sin(Math.PI * 1.42);
  ctx.beginPath(); ctx.moveTo(sx, sy1); ctx.lineTo(sx, sy2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(cx - 11, cy); ctx.lineTo(cx + 7, cy); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 7, cy); ctx.lineTo(cx + 3, cy - 3);
  ctx.moveTo(cx + 7, cy); ctx.lineTo(cx + 3, cy + 3);
  ctx.stroke();
}

function drawWeaponTile(x, y, type, cd, maxCd, selected) {
  const w = WEAPON_SIZE, h = WEAPON_SIZE;
  ctx.fillStyle = selected ? 'rgba(40,80,180,0.88)' : 'rgba(28,28,28,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? '#88aaff' : '#444';
  ctx.lineWidth = selected ? 2 : 1.5;
  ctx.strokeRect(x, y, w, h);

  const iconColor = cd > 0 ? '#555' : (selected ? '#ddf' : '#aaa');
  if (type === 'sword') drawSwordIcon(x + w / 2, y + h / 2, iconColor);
  else                  drawBowIcon(x + w / 2, y + h / 2, iconColor);

  if (cd > 0) {
    const frac = Math.min(cd / maxCd, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y + h * (1 - frac), w, h * frac);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#888';
    ctx.fillText(Math.ceil(cd) + 's', x + w / 2, y + h - 3);
  }
}

function drawAttackButton() {
  const r = attackBtnRect();
  const hasSel = player.selectedEnemyId !== null && enemies.some(e => e.id === player.selectedEnemyId);
  const onCd   = hasSel && player.weapon === 'bow' && player.bowCd > 0;
  const active = hasSel && !onCd;

  ctx.fillStyle = active ? 'rgba(180,40,40,0.90)' : 'rgba(28,28,28,0.82)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = active ? '#f88' : '#444';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(r.x, r.y, r.w, r.h);

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = active ? '#fff' : (hasSel ? '#a66' : '#444');
  ctx.fillText('ATTACK', r.x + r.w / 2, r.y + r.h / 2);
}

function drawWeapons() {
  const wr = weaponRects();
  drawWeaponTile(wr.sword.x, wr.sword.y, 'sword', player.attackCd, PLAYER_ATTACK_CD, player.weapon === 'sword');
  drawWeaponTile(wr.bow.x,   wr.bow.y,   'bow',   player.bowCd,    BOW_CD,           player.weapon === 'bow');
  drawAttackButton();
}

function drawSelectedInfo() {
  const enemy = enemies.find(e => e.id === player.selectedEnemyId);
  if (!enemy) return;

  const barW = 180, barH = 14;
  const cx = Math.floor(canvas.width / 2);
  const y  = 8;

  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#eee';
  ctx.fillText(enemy.name, cx, y);

  const barX = cx - barW / 2;
  const barY = y + 20;
  ctx.fillStyle = '#222';
  ctx.fillRect(barX, barY, barW, barH);
  const hpFrac = enemy.hp / enemy.maxHp;
  ctx.fillStyle = `hsl(${Math.round(hpFrac * 110)}, 65%, 42%)`;
  ctx.fillRect(barX, barY, barW * hpFrac, barH);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, barH);
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ddd';
  ctx.fillText(`${enemy.hp} / ${enemy.maxHp}`, cx, barY + barH / 2);
}

function drawMinimap() {
  const mm = minimapRect();
  const scale = MINIMAP_SIZE / Math.max(MAP_W, MAP_H);

  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(mm.x, mm.y, MINIMAP_SIZE, MINIMAP_SIZE);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(mm.x, mm.y, MINIMAP_SIZE, MINIMAP_SIZE);

  ctx.fillStyle = '#1a4a1a';
  for (const t of trees) {
    const ts = TREE_SIZE * scale;
    ctx.fillRect(mm.x + t.x * scale - ts / 2, mm.y + t.y * scale - ts / 2, ts, ts);
  }

  ctx.fillStyle = '#e44';
  for (const e of enemies) {
    ctx.fillRect(mm.x + e.x * scale - 2, mm.y + e.y * scale - 2, 4, 4);
  }

  ctx.fillStyle = '#4af';
  ctx.fillRect(mm.x + player.x * scale - 2.5, mm.y + player.y * scale - 2.5, 5, 5);
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

  // Trees
  for (const t of trees) drawTree(t);

  // Target indicator (shown while dragging)
  circle(target.x, target.y, 5, 'rgba(255,255,255,0.11)', null);

  // Attack range rings
  for (const e of enemies) circle(e.x, e.y, ATTACK_RANGE, 'rgba(255,80,80,0.10)', 'rgba(255,100,100,0.35)', 1);
  circle(player.x, player.y, ATTACK_RANGE, 'rgba(68,170,255,0.10)', 'rgba(68,170,255,0.35)', 1);

  // Selection ring
  const selEnemy = enemies.find(e => e.id === player.selectedEnemyId);
  if (selEnemy) {
    ctx.beginPath();
    ctx.arc(selEnemy.x, selEnemy.y, RADIUS + 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Arrows
  ctx.strokeStyle = '#ffcc44';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const a of arrows) {
    const mag = Math.hypot(a.vx, a.vy);
    const len = 14;
    ctx.beginPath();
    ctx.moveTo(a.x - (a.vx / mag) * len, a.y - (a.vy / mag) * len);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
  }

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

  drawSelectedInfo();
  drawMinimap();
  drawWeapons();
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
