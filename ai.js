import {
  RADIUS, MAP_W, MAP_H, ENEMY_SPEED, SPAWN_LEASH, AGGRO_RADIUS, ATTACK_RANGE,
  WANDER_RADIUS, WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX, WANDER_SPEED_MULT, WANDER_TIMEOUT,
} from './constants.js';

export function updateEnemyAI(scene, dt) {
  const { player } = scene;

  for (const enemy of scene.enemies) {
    if (enemy.dying) continue;
    const prevX = enemy.x, prevY = enemy.y;

    // Aggressive enemies re-engage when player enters AGGRO_RADIUS,
    // but only while the player is still within leash range of the spawn.
    if (enemy.aggressive && enemy.state !== 'chasing') {
      const dPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      const dSpawn  = Math.hypot(player.x - enemy.spawnX, player.y - enemy.spawnY);
      if (dPlayer <= AGGRO_RADIUS && dSpawn <= SPAWN_LEASH) {
        enemy.state = 'chasing';
        enemy.wanderTarget = null;
      }
    }

    if (enemy.state === 'chasing') {
      const d = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      const playerFromSpawn = Math.hypot(player.x - enemy.spawnX, player.y - enemy.spawnY);
      if (playerFromSpawn > SPAWN_LEASH) {
        enemy.state = 'returning';
      } else if (d > ATTACK_RANGE) {
        const step = Math.min(ENEMY_SPEED * dt, d - ATTACK_RANGE);
        enemy.x += (player.x - enemy.x) / d * step;
        enemy.y += (player.y - enemy.y) / d * step;
        scene.applyTreeCollisions(enemy);
      } else {
        enemy.facing = scene.getFacing(player.x - enemy.x, player.y - enemy.y);
      }
    } else if (enemy.state === 'returning') {
      const rdx = enemy.spawnX - enemy.x, rdy = enemy.spawnY - enemy.y;
      const d = Math.hypot(rdx, rdy);
      if (d < 2) {
        enemy.x = enemy.spawnX; enemy.y = enemy.spawnY;
        enemy.state = 'idle';
        enemy.wanderTimer = _randWanderInterval();
      } else {
        const step = Math.min(ENEMY_SPEED * dt, d);
        enemy.x += rdx / d * step;
        enemy.y += rdy / d * step;
        scene.applyTreeCollisions(enemy);
      }
    } else if (enemy.state === 'idle') {
      enemy.wanderTimer -= dt;
      if (enemy.wanderTimer <= 0) {
        const angle = Math.random() * Math.PI * 2;
        const dist  = Math.random() * WANDER_RADIUS;
        enemy.wanderTarget = {
          x: Math.max(RADIUS, Math.min(MAP_W - RADIUS, enemy.spawnX + Math.cos(angle) * dist)),
          y: Math.max(RADIUS, Math.min(MAP_H - RADIUS, enemy.spawnY + Math.sin(angle) * dist)),
        };
        enemy.wanderTimeLeft = WANDER_TIMEOUT;
        enemy.state = 'wandering';
      }
    } else if (enemy.state === 'wandering') {
      enemy.wanderTimeLeft -= dt;
      const wdx = enemy.wanderTarget.x - enemy.x, wdy = enemy.wanderTarget.y - enemy.y;
      const wd = Math.hypot(wdx, wdy);
      if (wd < 4 || enemy.wanderTimeLeft <= 0) {
        enemy.state = 'idle';
        enemy.wanderTimer = _randWanderInterval();
        enemy.wanderTarget = null;
      } else {
        const step = Math.min(ENEMY_SPEED * WANDER_SPEED_MULT * dt, wd);
        enemy.x += (wdx / wd) * step;
        enemy.y += (wdy / wd) * step;
        scene.applyTreeCollisions(enemy);
      }
    }

    const movedX = enemy.x - prevX, movedY = enemy.y - prevY;
    if (Math.hypot(movedX, movedY) > 0.1) enemy.facing = scene.getFacing(movedX, movedY);
  }
}

function _randWanderInterval() {
  return WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
}
