import {
  MAP_W, MAP_H, RADIUS, ATTACK_RANGE, SPRITE_H, SPRITE_W,
  PLAYER_MAX_HP, ATTACK_BTN_H, BOW_CD, PLAYER_ATTACK_CD,
  MINIMAP_SIZE, MINIMAP_MARGIN,
  ENTITY_HP_BAR_W, ENTITY_HP_BAR_H, ENTITY_HP_BAR_OFFSET,
  DEPTH_HUD,
} from './constants.js';

// ── World-space graphics (attack rings, selection, arrows, HP bars) ────────

export function renderWorldGfx(scene) {
  const g = scene.worldGfx;
  g.clear();

  g.lineStyle(6, 0x666666, 1);
  g.strokeRect(0, 0, MAP_W, MAP_H);

  g.fillStyle(0xffffff, 0.15);
  g.fillCircle(scene.target.x, scene.target.y, 6);

  _drawAttackRings(g, scene);
  _drawSelectionRings(g, scene);
  _drawArrows(g, scene);
  _drawEntityHpBars(g, scene);
}

function _drawAttackRings(g, scene) {
  const cy = e => e.y - SPRITE_H / 2;
  for (const e of scene.enemies) {
    const fill   = e.aggressive ? 0xff5050 : 0xddcc22;
    const stroke = e.aggressive ? 0xff6464 : 0xeedd44;
    g.fillStyle(fill, 0.06);   g.fillCircle(e.x, cy(e), ATTACK_RANGE);
    g.lineStyle(1, stroke, 0.25); g.strokeCircle(e.x, cy(e), ATTACK_RANGE);
  }
  const px = scene.player.x, py = scene.player.y - SPRITE_H / 2;
  g.fillStyle(0x44aaff, 0.07);     g.fillCircle(px, py, ATTACK_RANGE);
  g.lineStyle(1, 0x44aaff, 0.25);  g.strokeCircle(px, py, ATTACK_RANGE);
}

function _drawSelectionRings(g, scene) {
  const cy = e => e.y - SPRITE_H / 2;
  const selEnemy = scene.enemies.find(e => e.id === scene.player.selectedEnemyId);
  if (selEnemy) {
    g.fillStyle(0xffffff, 0.05);  g.fillCircle(selEnemy.x, cy(selEnemy), RADIUS + 16);
    g.lineStyle(3, 0xffffff, 0.18); g.strokeCircle(selEnemy.x, cy(selEnemy), RADIUS + 16);
    g.lineStyle(2, 0xffffff, 0.80); g.strokeCircle(selEnemy.x, cy(selEnemy), RADIUS + 11);
  }
  const selNpc = scene.npcs.find(n => n.id === scene.player.selectedNpcId);
  if (selNpc) {
    g.fillStyle(0xffdc50, 0.05);  g.fillCircle(selNpc.x, cy(selNpc), RADIUS + 16);
    g.lineStyle(3, 0xffdc50, 0.18); g.strokeCircle(selNpc.x, cy(selNpc), RADIUS + 16);
    g.lineStyle(2, 0xffdc50, 0.80); g.strokeCircle(selNpc.x, cy(selNpc), RADIUS + 11);
  }
}

function _drawArrows(g, scene) {
  for (const a of scene.arrows) {
    const mag = Math.hypot(a.vx, a.vy), len = 14;
    g.lineStyle(2, 0xffcc44, 1);
    g.beginPath();
    g.moveTo(a.x - (a.vx / mag) * len, a.y - (a.vy / mag) * len);
    g.lineTo(a.x, a.y);
    g.strokePath();
  }
}

function _drawEntityHpBars(g, scene) {
  // Player
  const p = scene.player;
  const pFrac = p.hp / PLAYER_MAX_HP;
  _drawHpBar(g, p.x, p.y, pFrac);

  // Enemies (only when aggressive)
  for (const e of scene.enemies) {
    if (!e.aggressive || e.dying) continue;
    _drawHpBar(g, e.x, e.y, e.hp / e.maxHp);
  }
}

function _drawHpBar(g, x, y, frac) {
  const bx = x - ENTITY_HP_BAR_W / 2, by = y - ENTITY_HP_BAR_OFFSET;
  const col = frac > 0.5 ? 0x44cc44 : frac > 0.25 ? 0xddaa00 : 0xcc2222;
  g.fillStyle(0x111111, 0.8);  g.fillRect(bx, by, ENTITY_HP_BAR_W, ENTITY_HP_BAR_H);
  if (frac > 0) { g.fillStyle(col, 1); g.fillRect(bx, by, ENTITY_HP_BAR_W * frac, ENTITY_HP_BAR_H); }
  g.lineStyle(1, 0x000000, 0.6); g.strokeRect(bx, by, ENTITY_HP_BAR_W, ENTITY_HP_BAR_H);
}

// ── Sprite position + animation updates ───────────────────────────────────

export function updateSprites(scene) {
  const { player } = scene;
  const depth = player.y;
  const isMoving  = Math.hypot(scene.target.x - player.x, scene.target.y - player.y) > 2;
  const swinging  = player.swingTimer    > 0 && player.weapon === 'sword';
  const shooting  = player.bowShootTimer > 0 && player.weapon === 'bow';

  const activeSprite =
    player.weapon === 'bow'   ? scene.playerBowSprite    :
    player.weapon === 'sword' ? scene.playerDaggerSprite : scene.playerBaseSprite;
  const activeSheet =
    player.weapon === 'bow'   ? 'player-bow'    :
    player.weapon === 'sword' ? 'player-dagger' : 'player-base';

  for (const s of [scene.playerBaseSprite, scene.playerDaggerSprite, scene.playerBowSprite]) {
    s.setPosition(player.x, player.y).setDepth(depth).setVisible(false);
  }
  activeSprite.setVisible(true);

  if (swinging)      scene.playSpriteAnim(activeSprite, `player-dagger-slash-${player.facing}`);
  else if (shooting) scene.playSpriteAnim(activeSprite, `player-bow-shoot-${player.facing}`);
  else               scene.updateEntityAnim(activeSprite, activeSheet, player.facing, isMoving);

  for (const enemy of scene.enemies) {
    const t = scene.enemyTextMap.get(enemy.id);
    if (!t) continue;
    t.sprite.setPosition(enemy.x, enemy.y).setDepth(enemy.y);
    if (enemy.dying) {
      scene.playSpriteAnim(t.sprite, 'weirdo-hurt');
    } else if (enemy.thrustTimer > 0) {
      scene.playSpriteAnim(t.sprite, `weirdo-thrust-${enemy.facing}`);
    } else {
      const moving = enemy.state === 'chasing' || enemy.state === 'returning' || enemy.state === 'wandering';
      scene.updateEntityAnim(t.sprite, 'weirdo', enemy.facing, moving);
    }
  }

  for (const npc of scene.npcs) {
    const t = scene.npcTextMap.get(npc.id);
    if (!t) continue;
    t.name.setPosition(npc.x, npc.y - SPRITE_H - 4);
    t.dialogue.setPosition(npc.x, npc.y - SPRITE_H - 22).setVisible(npc.talkTimer > 0);
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────

export function renderUI(scene) {
  const g = scene.uiGfx;
  const { W, H, player } = scene;
  g.clear();

  _drawStatsPanel(g, scene);
  _drawSelectedTarget(g, scene);

  const wr = scene.weaponRects();
  scene.drawWeaponTile(g, wr.sword, 'sword', player.attackCd,  PLAYER_ATTACK_CD, player.weapon === 'sword');
  scene.drawWeaponTile(g, wr.bow,   'bow',   player.bowCd,     BOW_CD,           player.weapon === 'bow');

  _drawWeaponCdText(scene, wr);
  scene.drawAttackButton(g);
  scene.drawTalkButton(g);
  scene.drawPotion(g);
  scene.drawMinimap(g);
  scene.versionText.setY(H - 8);

  if (scene.gameOver) { g.fillStyle(0x000000, 0.72); g.fillRect(0, 0, W, H); }
}

function _drawStatsPanel(g, scene) {
  const { player, W } = scene;
  const panelW = 160, panelH = 94;
  g.fillStyle(0x000000, 0.50); g.fillRoundedRect(8, 8, panelW, panelH, 6);
  g.lineStyle(1, 0x444444, 0.7); g.strokeRoundedRect(8, 8, panelW, panelH, 6);

  scene.levelText.setText(`Level ${player.level}`);
  scene.damageText.setText(`DMG  ${player.damage}`);

  const hpFrac  = player.hp / PLAYER_MAX_HP;
  const hpColor = Phaser.Display.Color.HSLToColor(hpFrac * 110 / 360, 0.75, 0.42).color;
  g.fillStyle(0x222222, 1);  g.fillRoundedRect(16, 34, 136, 12, 4);
  if (hpFrac > 0) { g.fillStyle(hpColor, 1); g.fillRoundedRect(16, 34, 136 * hpFrac, 12, 4); }
  g.lineStyle(1, 0x553333, 0.6); g.strokeRoundedRect(16, 34, 136, 12, 4);
  scene.hpText.setText(`HP  ${player.hp} / ${PLAYER_MAX_HP}`).setPosition(16 + 68, 34 + 6);

  const xpFrac = player.xp / 100;
  g.fillStyle(0x222222, 1);  g.fillRoundedRect(16, 53, 136, 12, 4);
  if (xpFrac > 0) { g.fillStyle(0x3388ff, 1); g.fillRoundedRect(16, 53, 136 * xpFrac, 12, 4); }
  g.lineStyle(1, 0x445566, 0.6); g.strokeRoundedRect(16, 53, 136, 12, 4);
  scene.xpText.setText(`XP  ${player.xp} / 100`).setPosition(16 + 68, 53 + 6);
}

function _drawSelectedTarget(g, scene) {
  const { player, W } = scene;
  const selEnemy = scene.enemies.find(e => e.id === player.selectedEnemyId);
  if (selEnemy) {
    scene.selNameText.setX(W / 2).setText(selEnemy.name).setColor('#eeeeee').setVisible(true);
    const bx = W / 2 - 90, by = 28;
    g.fillStyle(0x222222, 1); g.fillRect(bx, by, 180, 14);
    const hpFrac  = selEnemy.hp / selEnemy.maxHp;
    const hpColor = Phaser.Display.Color.HSLToColor(hpFrac * 110 / 360, 0.65, 0.42).color;
    g.fillStyle(hpColor, 1); g.fillRect(bx, by, 180 * hpFrac, 14);
    g.lineStyle(1, 0x555555, 1); g.strokeRect(bx, by, 180, 14);
    scene.selHpText.setPosition(W / 2, by + 7).setText(`${selEnemy.hp} / ${selEnemy.maxHp}`).setVisible(true);
    return;
  }
  const selNpc = scene.npcs.find(n => n.id === player.selectedNpcId);
  if (selNpc) scene.selNameText.setX(W / 2).setText(selNpc.name).setColor('#ffe090').setVisible(true);
  else        scene.selNameText.setVisible(false);
  scene.selHpText.setVisible(false);
}

function _drawWeaponCdText(scene, wr) {
  const { player } = scene;
  if (player.attackCd > 0) scene.swordCdText.setPosition(wr.sword.x + wr.sword.w / 2, wr.sword.y + wr.sword.h - 3).setText(Math.ceil(player.attackCd) + 's').setVisible(true);
  else scene.swordCdText.setVisible(false);
  if (player.bowCd > 0) scene.bowCdText.setPosition(wr.bow.x + wr.bow.w / 2, wr.bow.y + wr.bow.h - 3).setText(Math.ceil(player.bowCd) + 's').setVisible(true);
  else scene.bowCdText.setVisible(false);
}
