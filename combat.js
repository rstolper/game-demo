import {
  RADIUS, ATTACK_RANGE,
  PLAYER_MAX_HP, PLAYER_ATTACK_CD, ENEMY_ATTACK, ENEMY_ATTACK_CD,
  REGEN_INTERVAL, REGEN_COMBAT_DELAY, ENEMY_REGEN_INTERVAL,
  LPC_SLASH_FRAMES, LPC_THRUST_FRAMES,
  PLAYER_SWING_HIT_THRESHOLD, ENEMY_HIT_THRESHOLD,
} from './constants.js';

export function updateCombat(scene, dt) {
  const { player } = scene;

  _tickPlayerCooldowns(player, dt);
  _resolvePlayerSwing(scene, dt);
  _tickEnemyTimers(scene, dt);
  _updateArrows(scene, dt);

  const anyInRange = _triggerEnemyAttacks(scene);
  _triggerPlayerSwing(scene);
  _cleanupDeadEnemies(scene);
  _regenEnemies(scene.enemies, dt);
  _regenPlayer(player, scene, anyInRange, dt);
  _tickNpcs(scene.npcs, dt);
}

// ── Player cooldowns ───────────────────────────────────────────────────────

function _tickPlayerCooldowns(player, dt) {
  player.attackCd      = Math.max(0, player.attackCd      - dt);
  player.potionCd      = Math.max(0, player.potionCd      - dt);
  player.bowCd         = Math.max(0, player.bowCd         - dt);
  player.swingTimer    = Math.max(0, player.swingTimer    - dt);
  player.bowShootTimer = Math.max(0, player.bowShootTimer - dt);

  if (player.attackModeTimer > 0) {
    player.attackModeTimer = Math.max(0, player.attackModeTimer - dt);
    if (player.attackModeTimer === 0) player.attackMode = false;
  }
}

// ── Player sword swing — damage fires as swingDamageTimer crosses 0 ───────

function _resolvePlayerSwing(scene, dt) {
  const { player } = scene;
  const prev = player.swingDamageTimer;
  player.swingDamageTimer = Math.max(0, player.swingDamageTimer - dt);
  if (!(prev > 0 && player.swingDamageTimer <= 0)) return;

  const tgt = scene.enemies.find(e => e.id === player.attackTarget);
  if (!tgt || tgt.dying) return;
  const edx = tgt.x - player.x, edy = tgt.y - player.y;
  if (Math.hypot(edx, edy) > ATTACK_RANGE + RADIUS) return;
  if (!scene.isFacingTarget(player.facing, edx, edy)) return;

  tgt.aggressive = true;
  tgt.facing = scene.getFacing(-edx, -edy);
  tgt.hp = Math.max(0, tgt.hp - player.damage);
  scene.spawnDamageNumber(tgt.x, tgt.y, player.damage, '#ffdd44');

  if (tgt.hp === 0) {
    scene.awardXp();
    scene.startEnemyDeath(tgt);
    player.attackMode   = false;
    player.attackTarget = null;
  } else {
    tgt.state = 'chasing';
  }
}

// ── Enemy timers + thrust damage — fires as thrustTimer crosses threshold ──

function _tickEnemyTimers(scene, dt) {
  const { player } = scene;
  for (const e of scene.enemies) {
    e.attackCd = Math.max(0, e.attackCd - dt);
    if (e.dying) { e.deathTimer = Math.max(0, e.deathTimer - dt); continue; }

    const prevThrust = e.thrustTimer;
    e.thrustTimer = Math.max(0, e.thrustTimer - dt);

    // Damage fires once as thrustTimer crosses ENEMY_HIT_THRESHOLD from above
    if (prevThrust > ENEMY_HIT_THRESHOLD && e.thrustTimer <= ENEMY_HIT_THRESHOLD) {
      const d = Math.hypot(player.x - e.x, player.y - e.y);
      if (d <= ATTACK_RANGE + RADIUS && scene.isFacingTarget(e.facing, player.x - e.x, player.y - e.y)) {
        player.hp = Math.max(0, player.hp - ENEMY_ATTACK);
        scene.spawnDamageNumber(player.x, player.y, ENEMY_ATTACK, '#ff5555');
        if (player.hp === 0) { scene.onGameOver(); return; }
        if (player.selectedEnemyId === null) player.selectedEnemyId = e.id;
        player.attackTarget    = player.selectedEnemyId;
        player.attackMode      = true;
        player.attackModeTimer = 0;
      }
    }
  }
}

// ── Arrow flight and hit detection ────────────────────────────────────────

function _updateArrows(scene, dt) {
  const { player } = scene;
  scene.arrows = scene.arrows.filter(a => {
    a.x += a.vx * dt; a.y += a.vy * dt; a.lifetime -= dt;
    if (a.lifetime <= 0) return false;
    for (const enemy of scene.enemies) {
      if (enemy.dying) continue;
      if (Math.hypot(a.x - enemy.x, a.y - enemy.y) <= RADIUS) {
        enemy.aggressive = true;
        enemy.hp = Math.max(0, enemy.hp - player.damage);
        scene.spawnDamageNumber(enemy.x, enemy.y, player.damage, '#ffdd44');
        if (enemy.hp === 0) { scene.awardXp(); scene.startEnemyDeath(enemy); }
        return false;
      }
    }
    return true;
  });
}

// ── Enemy attacks player — returns true if any enemy was in range ─────────

function _triggerEnemyAttacks(scene) {
  const { player } = scene;
  let anyInRange = false;
  for (const e of scene.enemies) e.inCombat = false;

  for (const enemy of scene.enemies) {
    if (enemy.dying) continue;
    if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > ATTACK_RANGE + RADIUS) continue;
    anyInRange     = true;
    enemy.inCombat = true;
    if (!enemy.aggressive) continue;
    if (!scene.isFacingTarget(enemy.facing, player.x - enemy.x, player.y - enemy.y)) continue;
    if (enemy.attackCd <= 0) {
      enemy.attackCd    = ENEMY_ATTACK_CD;
      enemy.thrustTimer = LPC_THRUST_FRAMES.length / 10;
    }
  }
  return anyInRange;
}

// ── Player sword swing trigger ─────────────────────────────────────────────

function _triggerPlayerSwing(scene) {
  const { player } = scene;
  if (player.weapon !== 'sword' || !player.attackMode || player.attackCd > 0) return;
  const tgt = scene.enemies.find(e => e.id === player.attackTarget);
  if (!tgt || tgt.dying) return;
  const edx = tgt.x - player.x, edy = tgt.y - player.y;
  if (Math.hypot(edx, edy) > ATTACK_RANGE + RADIUS) return;
  if (!scene.isFacingTarget(player.facing, edx, edy)) return;

  player.attackCd         = PLAYER_ATTACK_CD;
  player.swingTimer       = LPC_SLASH_FRAMES.length / 10;
  player.swingDamageTimer = PLAYER_SWING_HIT_THRESHOLD;
}

// ── Dead enemy cleanup ─────────────────────────────────────────────────────

function _cleanupDeadEnemies(scene) {
  const { player } = scene;
  const toRemove = scene.enemies.filter(e => e.dying && e.deathTimer <= 0);
  for (const e of toRemove) scene.removeEnemy(e);
  scene.enemies = scene.enemies.filter(e => !(e.dying && e.deathTimer <= 0));

  if (player.selectedEnemyId !== null && !scene.enemies.some(e => e.id === player.selectedEnemyId)) player.selectedEnemyId = null;
  if (player.attackTarget    !== null && !scene.enemies.some(e => e.id === player.attackTarget))    player.attackTarget    = null;
}

// ── Regeneration ──────────────────────────────────────────────────────────

function _regenEnemies(enemies, dt) {
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
}

function _regenPlayer(player, scene, anyInRange, dt) {
  const isMoving = Math.hypot(scene.target.x - player.x, scene.target.y - player.y) > 2;
  if (anyInRange) {
    player.combatDelay = REGEN_COMBAT_DELAY;
    player.regenTick   = REGEN_INTERVAL;
    return;
  }
  player.combatDelay = Math.max(0, player.combatDelay - dt);
  if (player.combatDelay <= 0 && !isMoving && player.hp < PLAYER_MAX_HP) {
    player.regenTick -= dt;
    if (player.regenTick <= 0) {
      player.regenTick = REGEN_INTERVAL;
      player.hp = Math.min(PLAYER_MAX_HP, player.hp + 1);
    }
  }
}

function _tickNpcs(npcs, dt) {
  for (const npc of npcs) {
    if (npc.talkTimer > 0) npc.talkTimer = Math.max(0, npc.talkTimer - dt);
  }
}
