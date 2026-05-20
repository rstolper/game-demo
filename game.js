import {
  VERSION,
  RADIUS, ATTACK_RANGE, SPEED, MAP_W, MAP_H,
  PLAYER_MAX_HP, PLAYER_ATTACK, PLAYER_ATTACK_CD,
  BOW_RANGE, BOW_CD, ARROW_SPEED,
  ENEMY_MAX_HP, ENEMY_REGEN_INTERVAL, ENEMY_SPAWN_MIN_DIST,
  REGEN_INTERVAL, ATTACK_MODE_GRACE, TAP_MAX_MS,
  BOW_SHOOT_DURATION,
  WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX,
  TRUNK_TILE_IDS, TREE_TILE_SIZE,
  SPRITE_W, SPRITE_H, LPC_HURT_FRAMES,
  POTION_HEAL, POTION_CD, POTION_SIZE,
  WEAPON_SIZE, WEAPON_MARGIN, ATTACK_BTN_H, TALK_BTN_H,
  MINIMAP_SIZE, MINIMAP_MARGIN,
  TALK_RADIUS, TALK_DURATION,
  DEPTH_LAND, DEPTH_TRUNKS, DEPTH_CANOPY,
  DEPTH_WORLD_GFX, DEPTH_WORLD_TEXT, DEPTH_FLOAT_TEXT, DEPTH_HUD, DEPTH_GAME_OVER,
} from './constants.js';
import { createAnimations }              from './animations.js';
import { updateEnemyAI }                 from './ai.js';
import { updateCombat }                  from './combat.js';
import { renderWorldGfx, updateSprites, renderUI } from './render.js';
import { resolveDialogue } from './quests.js';

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  // ── Phaser lifecycle ────────────────────────────────────────────────────

  preload() {
    this.load.tilemapTiledJSON('map', 'map1.json');
    this.load.image('terrain_atlas', 'assets/Tiles/terrain_atlas.png');
    // Player per-animation sheets
    this.load.spritesheet('player-unarmed-walk',  'assets/Player/unarmed/walk.png',   { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-unarmed-hurt',  'assets/Player/unarmed/hurt.png',   { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-dagger-walk',   'assets/Player/dagger/walk.png',    { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-dagger-slash',  'assets/Player/dagger/slash.png',   { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-bow-walk',      'assets/Player/bow/walk_128.png',   { frameWidth: 128, frameHeight: 128 });
    this.load.spritesheet('player-bow-shoot',     'assets/Player/bow/shoot.png',      { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('weirdo-walk',   'assets/Enemies/little-weirdo/walk.png',   { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('weirdo-thrust', 'assets/Enemies/little-weirdo/thrust.png', { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('weirdo-hurt',   'assets/Enemies/little-weirdo/hurt.png',   { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('jimmy-walk', 'assets/NPCs/jimmy/walk.png', { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
  }

  create() {
    this.nextId   = 0;
    this.gameOver = false;
    this.trees    = [];
    this.enemies  = [];
    this.npcs     = [];
    this.arrows   = [];
    this.floatingNums = [];

    // Pointer state
    this.pDownPos  = null;
    this.pDownTime = 0;
    this.pMoved    = false;
    this.pOnEntity = false;

    this.player = {
      // Position & facing
      x: MAP_W / 2, y: MAP_H / 2, facing: 'down',
      // Stats
      hp: PLAYER_MAX_HP, level: 1, xp: 0, damage: PLAYER_ATTACK,
      // Equipment
      weapon: 'sword',
      // Combat state — selectedEnemyId: visual ring; attackTarget: who we walk/swing at
      selectedEnemyId: null, selectedNpcId: null,
      attackTarget: null, attackMode: false, attackModeTimer: 0,
      // Cooldowns & animation timers
      attackCd: 0, potionCd: 0, bowCd: 0,
      swingTimer: 0, swingDamageTimer: 0, bowShootTimer: 0, bowArrowPending: false,
      // Regeneration
      combatDelay: 0, regenTick: REGEN_INTERVAL,
      // Progression
      enemiesKilled: 0,
    };
    this.questState = { jimmy: {} };
    this.target = { x: this.player.x, y: this.player.y };

    createAnimations(this);
    this._createMap();
    this._createGraphicsLayers();
    this._createPlayerSprites();
    this._createHUD();
    this._setupInput();

    this.initEnemies();
    this.initNpcs();
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.1);
    if (!this.gameOver) this.updatePointerMovement();
    if (!this.gameOver) {
      this.updatePlayerMovement(dt);
      updateEnemyAI(this, dt);
      updateCombat(this, dt);
      this.updateFloatingNums(dt);
    }
    this.syncCamera();
    renderWorldGfx(this);
    updateSprites(this);
    renderUI(this);
  }

  // ── Map setup ────────────────────────────────────────────────────────────

  _createMap() {
    const map     = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage('terrain_atlas', 'terrain_atlas');
    map.createLayer('Land', tileset, 0, 0).setDepth(DEPTH_LAND);

    const treesHigh = map.createLayer('Trees', tileset, 0, 0).setDepth(DEPTH_CANOPY);
    treesHigh.forEachTile(t => { if (t.index !== -1 && TRUNK_TILE_IDS.has(t.index)) t.alpha = 0; });

    const treesLow = map.createBlankLayer('TrunksLow', tileset, 0, 0, map.width, map.height).setDepth(DEPTH_TRUNKS);
    map.getLayer('Trees').data.forEach((row, r) =>
      row.forEach((tile, c) => {
        if (tile && tile.index !== -1 && TRUNK_TILE_IDS.has(tile.index)) treesLow.putTileAt(tile.index, c, r);
      })
    );

    // Build collision rect list from trunk tiles
    map.getLayer('Trees').data.forEach((row, r) =>
      row.forEach((tile, c) => {
        if (tile && TRUNK_TILE_IDS.has(tile.index))
          this.trees.push({ x: c * TREE_TILE_SIZE + TREE_TILE_SIZE / 2, y: r * TREE_TILE_SIZE + TREE_TILE_SIZE / 2 });
      })
    );
  }

  _createGraphicsLayers() {
    this.worldGfx = this.add.graphics().setDepth(DEPTH_WORLD_GFX);
    this.uiGfx    = this.add.graphics().setScrollFactor(0).setDepth(DEPTH_HUD);
  }

  _createPlayerSprites() {
    const { x, y } = this.player;
    this.playerBaseSprite     = this.add.sprite(x, y, 'player-unarmed-walk').setOrigin(0.5, 1).setDepth(y).setVisible(false);
    this.playerDaggerSprite   = this.add.sprite(x, y, 'player-dagger-walk').setOrigin(0.5, 1).setDepth(y).setVisible(false);
    this.playerBowWalkSprite  = this.add.sprite(x, y, 'player-bow-walk').setOrigin(0.5, 1).setDepth(y).setVisible(false);
    this.playerBowShootSprite = this.add.sprite(x, y, 'player-bow-shoot').setOrigin(0.5, 1).setDepth(y).setVisible(false);
    this.playerDaggerSprite.setVisible(true);
    this.playerDaggerSprite.play('dagger-idle-down');
  }

  _createHUD() {
    const mono = (sz, col, bold) => ({ fontFamily: 'monospace', fontSize: sz, color: col, fontStyle: bold ? 'bold' : 'normal' });
    const ui   = obj => obj.setScrollFactor(0).setDepth(DEPTH_HUD);
    const { W, H } = this;

    this.levelText      = ui(this.add.text(16, 15, '',  mono('14px', '#ffffff', true)));
    this.hpText         = ui(this.add.text(0,  0,  '',  { ...mono('10px', '#ffffff'), stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5);
    this.xpText         = ui(this.add.text(0,  0,  '',  { ...mono('10px', '#ffffff'), stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5);
    this.damageText     = ui(this.add.text(16, 73, '',  mono('11px', '#888888')));
    this.selNameText    = ui(this.add.text(W / 2, 8, '', mono('13px', '#eeeeee', true))).setOrigin(0.5, 0).setVisible(false);
    this.selHpText      = ui(this.add.text(W / 2, 35, '', { ...mono('10px', '#ffffff'), stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5).setVisible(false);
    this.versionText    = ui(this.add.text(8, H - 8, VERSION, mono('11px', '#ffffff'))).setAlpha(0.25).setOrigin(0, 1);
    this.attackBtnText  = ui(this.add.text(0, 0, 'ATTACK', mono('11px', '#ffffff', true))).setOrigin(0.5, 0.5);
    this.talkBtnText    = ui(this.add.text(0, 0, 'TALK',   mono('11px', '#ffffff', true))).setOrigin(0.5, 0.5).setVisible(false);
    this.swordCdText    = ui(this.add.text(0, 0, '',  mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);
    this.bowCdText      = ui(this.add.text(0, 0, '',  mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);
    this.potionCdText   = ui(this.add.text(0, 0, '',  mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);

    this.gameOverText    = ui(this.add.text(W / 2, H / 2 - 24, 'Game Over', { fontFamily: 'sans-serif', fontSize: '56px', color: '#ff5555', fontStyle: 'bold' })).setOrigin(0.5, 0.5).setDepth(DEPTH_GAME_OVER).setVisible(false);
    this.gameOverSubText = ui(this.add.text(W / 2, H / 2 + 28, 'Reload the page to play again', { fontFamily: 'sans-serif', fontSize: '18px', color: '#999999' })).setOrigin(0.5, 0.5).setDepth(DEPTH_GAME_OVER).setVisible(false);

    this.enemyTextMap = new Map();
    this.npcTextMap   = new Map();
  }

  _setupInput() {
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);
    document.getElementById('add-enemy').addEventListener('click', () => this.spawnEnemy());

    this.scale.on('resize', gs => {
      const { width: nW, height: nH } = gs;
      this.selNameText.setX(nW / 2);
      this.selHpText.setX(nW / 2);
      this.versionText.setY(nH - 8);
      this.gameOverText.setPosition(nW / 2, nH / 2 - 24);
      this.gameOverSubText.setPosition(nW / 2, nH / 2 + 28);
    });
  }

  // ── Dimensions ───────────────────────────────────────────────────────────

  get W() { return this.scale.width; }
  get H() { return this.scale.height; }

  // ── Animation helpers ─────────────────────────────────────────────────────

  playSpriteAnim(sprite, key) {
    if (!sprite.anims.isPlaying || !sprite.anims.currentAnim || sprite.anims.currentAnim.key !== key) sprite.play(key);
  }

  updateEntityAnim(sprite, sheet, facing, moving) {
    this.playSpriteAnim(sprite, moving ? `${sheet}-walk-${facing}` : `${sheet}-idle-${facing}`);
    sprite.setFlipX(false);
  }

  // ── Direction helpers ─────────────────────────────────────────────────────

  getFacing(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  // Returns true when (dx, dy) falls within the entity's 180° forward arc.
  isFacingTarget(facing, dx, dy) {
    switch (facing) {
      case 'right': return dx > 0;
      case 'left':  return dx < 0;
      case 'down':  return dy > 0;
      case 'up':    return dy < 0;
    }
    return false;
  }

  // ── Collision ─────────────────────────────────────────────────────────────

  applyTreeCollisions(entity) {
    for (const t of this.trees) {
      const push = this._resolveCircleRect(
        entity.x, entity.y,
        t.x - TREE_TILE_SIZE / 2, t.y - TREE_TILE_SIZE / 2, TREE_TILE_SIZE, TREE_TILE_SIZE,
      );
      if (push) { entity.x += push.px; entity.y += push.py; }
    }
  }

  _resolveCircleRect(cx, cy, rx, ry, rw, rh) {
    const nearX = Math.max(rx, Math.min(rx + rw, cx));
    const nearY = Math.max(ry, Math.min(ry + rh, cy));
    const dx = cx - nearX, dy = cy - nearY;
    const dist = Math.hypot(dx, dy);
    if (dist >= RADIUS) return null;
    if (dist === 0) {
      const dL = cx - rx, dR = rx + rw - cx, dT = cy - ry, dB = ry + rh - cy;
      const m  = Math.min(dL, dR, dT, dB);
      if (m === dL) return { px: -(RADIUS + dL), py: 0 };
      if (m === dR) return { px:  (RADIUS + dR), py: 0 };
      if (m === dT) return { px: 0, py: -(RADIUS + dT) };
      return              { px: 0, py:  (RADIUS + dB) };
    }
    const overlap = RADIUS - dist;
    return { px: (dx / dist) * overlap, py: (dy / dist) * overlap };
  }

  // ── Entity init ───────────────────────────────────────────────────────────

  initEnemies() {
    for (let i = 0; i < 15; i++) {
      let x, y;
      do {
        x = RADIUS + Math.random() * (MAP_W - RADIUS * 2);
        y = RADIUS + Math.random() * (MAP_H - RADIUS * 2);
      } while (Math.hypot(x - this.player.x, y - this.player.y) < 300);
      this.addEnemy(x, y);
    }
  }

  initNpcs() {
    this.addNpc(MAP_W / 2 + 350, MAP_H / 2, 'Jimmy');
  }

  addEnemy(x, y) {
    const enemy = {
      id: this.nextId++, x, y, spawnX: x, spawnY: y,
      name: 'Little Weirdo', facing: 'down', state: 'idle',
      // Stats
      hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
      // Combat
      aggressive: false, inCombat: false,
      attackCd: 0, thrustTimer: 0,
      // State
      dying: false, deathTimer: 0,
      combatDelay: 0, regenTick: ENEMY_REGEN_INTERVAL,
      // Wander
      wanderTimer: WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN),
      wanderTarget: null, wanderTimeLeft: 0,
    };
    this.enemies.push(enemy);
    const sprite = this.add.sprite(x, y, 'weirdo-walk').setOrigin(0.5, 1).setDepth(y);
    sprite.play('weirdo-idle-down');
    this.enemyTextMap.set(enemy.id, { sprite });
    return enemy;
  }

  addNpc(x, y, name) {
    const npc = { id: this.nextId++, x, y, name, talkTimer: 0 };
    this.npcs.push(npc);
    const sprite = this.add.sprite(x, y, 'jimmy-walk').setOrigin(0.5, 1).setDepth(y);
    sprite.play('jimmy-idle-down');
    this.npcTextMap.set(npc.id, {
      sprite,
      name:     this.add.text(x, y - RADIUS - 4,  name, { fontFamily: 'monospace', fontSize: '11px', color: '#ffe090' }).setOrigin(0.5, 1).setDepth(DEPTH_WORLD_TEXT),
      dialogue: this.add.text(x, y - RADIUS - 20, '',   { fontFamily: 'monospace', fontSize: '12px', color: '#222222', backgroundColor: '#f0eed7', padding: { x: 8, y: 4 }, wordWrap: { width: 260 } }).setOrigin(0.5, 1).setDepth(DEPTH_WORLD_TEXT).setVisible(false),
    });
    return npc;
  }

  startEnemyDeath(enemy) {
    enemy.dying      = true;
    enemy.deathTimer = LPC_HURT_FRAMES.length / 10;
    enemy.state      = 'idle';
  }

  removeEnemy(enemy) {
    const t = this.enemyTextMap.get(enemy.id);
    if (t) { t.sprite.destroy(); this.enemyTextMap.delete(enemy.id); }
  }

  spawnEnemy() {
    if (this.gameOver) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = ENEMY_SPAWN_MIN_DIST + Math.random() * 200;
    this.addEnemy(
      Math.max(RADIUS, Math.min(MAP_W - RADIUS, this.player.x + Math.cos(angle) * dist)),
      Math.max(RADIUS, Math.min(MAP_H - RADIUS, this.player.y + Math.sin(angle) * dist)),
    );
  }

  // ── Player movement ───────────────────────────────────────────────────────

  updatePlayerMovement(dt) {
    const { player } = this;
    if (player.attackTarget !== null && player.weapon !== 'bow') {
      const tgt = this.enemies.find(e => e.id === player.attackTarget);
      if (!tgt) {
        player.attackTarget = null;
      } else {
        const tdx = player.x - tgt.x, tdy = player.y - tgt.y;
        const td = Math.hypot(tdx, tdy);
        const stopAt = ATTACK_RANGE + RADIUS * 0.5;
        this.target = td > stopAt
          ? { x: tgt.x + (tdx / td) * stopAt, y: tgt.y + (tdy / td) * stopAt }
          : { x: player.x, y: player.y };
      }
    }

    const dx = this.target.x - player.x, dy = this.target.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      const step = Math.min(SPEED * dt, dist);
      player.x += (dx / dist) * step;
      player.y += (dy / dist) * step;
      player.facing = this.getFacing(dx, dy);
    }
    player.x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x));
    player.y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y));
    this.applyTreeCollisions(player);
    player.x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x));
    player.y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y));
  }

  // ── Floating damage numbers ───────────────────────────────────────────────

  spawnDamageNumber(wx, wy, amount, color) {
    const t = this.add.text(wx, wy - SPRITE_H / 2, `-${amount}`, {
      fontFamily: 'monospace', fontSize: '13px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(DEPTH_FLOAT_TEXT);
    this.floatingNums.push({ obj: t, vy: -60, timer: 0.9 });
  }

  updateFloatingNums(dt) {
    this.floatingNums = this.floatingNums.filter(f => {
      f.timer -= dt;
      if (f.timer <= 0) { f.obj.destroy(); return false; }
      f.obj.y += f.vy * dt;
      f.obj.setAlpha(Math.min(1, f.timer / 0.3));
      return true;
    });
  }

  // ── XP / game over ────────────────────────────────────────────────────────

  awardXp() {
    this.player.enemiesKilled++;
    this.player.xp += 20;
    while (this.player.xp >= 100) { this.player.xp -= 100; this.player.level++; this.player.damage++; }
  }

  onGameOver() {
    this.gameOver = true;
    for (const s of [this.playerBaseSprite, this.playerDaggerSprite, this.playerBowWalkSprite, this.playerBowShootSprite]) s.setVisible(false);
    this.playerBaseSprite.setPosition(this.player.x, this.player.y).setVisible(true);
    this.playerBaseSprite.play('player-hurt');
    this.playerBaseSprite.once('animationcomplete', () => {
      this.gameOverText.setVisible(true);
      this.gameOverSubText.setVisible(true);
    });
  }

  // ── Camera ────────────────────────────────────────────────────────────────

  syncCamera() {
    const { W, H } = this;
    const camY = this.player.y - SPRITE_H / 2;
    this.cameras.main.setScroll(
      Math.max(0, Math.min(MAP_W - W, this.player.x - W / 2)),
      Math.max(0, Math.min(MAP_H - H, camY - H / 2)),
    );
  }

  // ── Input ─────────────────────────────────────────────────────────────────

  onPointerDown(pointer) {
    if (this.gameOver) return;
    this.pDownPos  = { x: pointer.x, y: pointer.y };
    this.pDownTime = this.time.now;
    this.pMoved    = false;
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.pOnEntity = this.enemies.some(e => Math.hypot(wp.x - e.x, wp.y - e.y) <= RADIUS * 3)
                  || this.npcs.some(n  => Math.hypot(wp.x - n.x,  wp.y - n.y)  <= RADIUS * 3);
  }

  onPointerMove(pointer) {
    if (!this.pDownPos || !pointer.isDown) return;
    if (!this.pMoved && Math.hypot(pointer.x - this.pDownPos.x, pointer.y - this.pDownPos.y) > (pointer.wasTouch ? 12 : 4)) {
      this.pMoved = true;
    }
  }

  onPointerUp(pointer) {
    if (this.gameOver) return;
    if (!this.pMoved && this.pDownPos && (this.time.now - this.pDownTime) < TAP_MAX_MS) this.handleTap(this.pDownPos.x, this.pDownPos.y);
    this.target    = { x: this.player.x, y: this.player.y };
    this.pDownPos  = null;
    this.pMoved    = false;
    this.pOnEntity = false;
  }

  updatePointerMovement() {
    const pointer = this.input.activePointer;
    if (!pointer.isDown || !this.pDownPos || this.pOnEntity) return;
    if (this.isPointerOverUI(pointer.x, pointer.y)) return;
    if (!this.pMoved && Math.hypot(pointer.x - this.pDownPos.x, pointer.y - this.pDownPos.y) > (pointer.wasTouch ? 12 : 4)) {
      this.pMoved = true;
    }
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.target = { x: wp.x, y: wp.y };
    // Bow in attack mode: player repositions freely without losing the shoot target
    if (!(this.player.weapon === 'bow' && this.player.attackMode)) this.player.attackTarget = null;
  }

  isPointerOverUI(px, py) {
    const mm = this.minimapRect();
    if (px >= mm.x && py <= MINIMAP_SIZE + MINIMAP_MARGIN * 2) return true;
    if (this.inRect(px, py, this.potionRect())) return true;
    const wr = this.weaponRects();
    if (this.inRect(px, py, wr.sword) || this.inRect(px, py, wr.bow)) return true;
    if (this.inRect(px, py, this.attackBtnRect())) return true;
    if (this.isNearNpc() && this.inRect(px, py, this.talkBtnRect())) return true;
    return false;
  }

  handleTap(sx, sy) {
    const mm = this.minimapRect();
    if (sx >= mm.x && sy <= MINIMAP_SIZE + MINIMAP_MARGIN * 2) return;
    if (this.inRect(sx, sy, this.potionRect())) { this.usePotion(); return; }

    const wr = this.weaponRects();
    if (this.inRect(sx, sy, wr.sword)) { this.player.weapon = 'sword'; return; }
    if (this.inRect(sx, sy, wr.bow))   { this.player.weapon = 'bow';   return; }

    if (this.inRect(sx, sy, this.attackBtnRect())) {
      const hasSel = this.player.selectedEnemyId !== null && this.enemies.some(e => e.id === this.player.selectedEnemyId);
      if (hasSel || this.nearestEnemyInAttackRange()) { this.executeAttack(); }
      return;
    }
    if (this.isNearNpc() && this.inRect(sx, sy, this.talkBtnRect())) { this.executeTalk(); return; }

    const wp = this.cameras.main.getWorldPoint(sx, sy);

    for (const enemy of this.enemies) {
      if (Math.hypot(wp.x - enemy.x, wp.y - enemy.y) > RADIUS * 3) continue;
      this.player.selectedEnemyId = enemy.id;
      this.player.selectedNpcId   = null;
      if (this.player.attackMode) {
        this.player.attackTarget    = enemy.id;
        this.player.attackModeTimer = 0;
        this.player.facing = this.getFacing(enemy.x - this.player.x, enemy.y - this.player.y);
      } else {
        this.player.attackTarget = null;
      }
      return;
    }
    for (const npc of this.npcs) {
      if (Math.hypot(wp.x - npc.x, wp.y - npc.y) > RADIUS * 3) continue;
      this.player.selectedNpcId   = npc.id;
      this.player.selectedEnemyId = null;
      this.player.attackTarget    = null;
      if (this.player.attackMode) this.player.attackModeTimer = ATTACK_MODE_GRACE;
      return;
    }

    this.player.selectedNpcId   = null;
    this.player.selectedEnemyId = null;
    this.player.attackTarget    = null;
    if (this.player.attackMode) this.player.attackModeTimer = ATTACK_MODE_GRACE;
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  usePotion() {
    if (this.player.potionCd > 0) return;
    this.player.hp       = Math.min(PLAYER_MAX_HP, this.player.hp + POTION_HEAL);
    this.player.potionCd = POTION_CD;
  }

  // Begin the bow shoot animation. Arrow fires later via _tickBowShoot in combat.js.
  startBowShoot(enemy) {
    if (this.player.bowCd > 0 || this.player.bowShootTimer > 0) return;
    const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y;
    if (Math.hypot(dx, dy) > BOW_RANGE) return;
    this.player.facing          = this.getFacing(dx, dy);
    this.player.bowShootTimer   = BOW_SHOOT_DURATION;
    this.player.bowArrowPending = true;
  }

  // Spawn the actual arrow projectile (called by combat.js at the release frame).
  spawnArrow(enemy) {
    const originY = this.player.y - SPRITE_H / 2;
    const dx = enemy.x - this.player.x, dy = (enemy.y - SPRITE_H / 2) - originY;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    this.arrows.push({
      x: this.player.x, y: originY,
      vx: (dx / dist) * ARROW_SPEED, vy: (dy / dist) * ARROW_SPEED,
      lifetime: BOW_RANGE / ARROW_SPEED + 0.2,
    });
  }

  executeAttack() {
    let enemy = this.enemies.find(e => e.id === this.player.selectedEnemyId);
    if (!enemy) enemy = this.nearestEnemyInAttackRange();
    if (!enemy) return;
    this.player.selectedEnemyId = enemy.id;
    this.player.attackTarget    = enemy.id;
    this.player.attackMode      = true;
    this.player.attackModeTimer = 0;
    this.player.facing = this.getFacing(enemy.x - this.player.x, enemy.y - this.player.y);
    if (this.player.weapon === 'bow') this.startBowShoot(enemy);
  }

  executeTalk() {
    let npc = this.npcs.find(n => n.id === this.player.selectedNpcId
      && Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS);
    if (!npc) {
      npc = this.npcs
        .filter(n => Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS)
        .sort((a, b) => Math.hypot(this.player.x - a.x, this.player.y - a.y)
                      - Math.hypot(this.player.x - b.x, this.player.y - b.y))[0];
    }
    if (!npc || npc.talkTimer > 0) return;

    const npcKey = npc.name.toLowerCase();
    const allDead = this.enemies.filter(e => !e.dying).length === 0 && this.player.enemiesKilled > 0;
    const line = resolveDialogue(npcKey, this.questState, this.player.enemiesKilled, allDead);

    if (line) {
      // Update the speech bubble text
      const t = this.npcTextMap.get(npc.id);
      if (t) t.dialogue.setText(line.text);
      // Award XP if this line grants it
      if (line.xp) {
        this.player.xp += line.xp;
        while (this.player.xp >= 100) { this.player.xp -= 100; this.player.level++; this.player.damage++; }
        this.spawnDamageNumber(this.player.x, this.player.y - 20, line.xp, '#44aaff');
      }
      // Persist any flag this line sets
      if (line.setFlag) {
        if (!this.questState[npcKey]) this.questState[npcKey] = {};
        this.questState[npcKey][line.setFlag] = true;
      }
    }

    npc.talkTimer = TALK_DURATION;
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  isNearNpc() {
    return this.npcs.some(n => Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS);
  }

  nearestEnemyInAttackRange() {
    let best = null, bestDist = Infinity;
    for (const e of this.enemies) {
      if (e.dying) continue;
      const d = Math.hypot(this.player.x - e.x, this.player.y - e.y);
      if (d < ATTACK_RANGE * 2 && d < bestDist) { best = e; bestDist = d; }
    }
    return best;
  }

  // ── UI layout helpers ─────────────────────────────────────────────────────

  inRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

  potionRect() {
    return { x: Math.floor(this.W / 2 - POTION_SIZE / 2), y: this.H - POTION_SIZE - 12, w: POTION_SIZE, h: POTION_SIZE };
  }

  weaponRects() {
    const rx   = this.W - WEAPON_SIZE - WEAPON_MARGIN;
    const midY = Math.floor(this.H / 2);
    return {
      sword: { x: rx, y: midY - WEAPON_SIZE - 4, w: WEAPON_SIZE, h: WEAPON_SIZE },
      bow:   { x: rx, y: midY + 4,               w: WEAPON_SIZE, h: WEAPON_SIZE },
    };
  }

  attackBtnRect() {
    const wr = this.weaponRects();
    return { x: wr.bow.x, y: wr.bow.y + WEAPON_SIZE + 8, w: WEAPON_SIZE, h: ATTACK_BTN_H };
  }

  talkBtnRect() {
    const ab = this.attackBtnRect();
    return { x: ab.x, y: ab.y + ATTACK_BTN_H + 6, w: WEAPON_SIZE, h: TALK_BTN_H };
  }

  minimapRect() {
    return { x: this.W - MINIMAP_SIZE - MINIMAP_MARGIN, y: MINIMAP_MARGIN };
  }

  // ── UI drawing ────────────────────────────────────────────────────────────

  drawWeaponTile(g, r, type, cd, maxCd, selected) {
    g.fillStyle(selected ? 0x284880 : 0x1c1c1c, selected ? 0.88 : 0.82);
    g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(selected ? 2 : 1.5, selected ? 0x88aaff : 0x444444, 1);
    g.strokeRect(r.x, r.y, r.w, r.h);
    const ic = cd > 0 ? 0x555555 : (selected ? 0xdddeff : 0xaaaaaa);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (type === 'sword') this._drawSwordIcon(g, cx, cy, ic);
    else                  this._drawBowIcon(g, cx, cy, ic);
    if (cd > 0) {
      g.fillStyle(0x000000, 0.55);
      g.fillRect(r.x, r.y + r.h * (1 - Math.min(cd / maxCd, 1)), r.w, r.h * Math.min(cd / maxCd, 1));
    }
  }

  _drawSwordIcon(g, cx, cy, color) {
    g.lineStyle(2.5, color, 1);
    g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 6);        g.strokePath();
    g.beginPath(); g.moveTo(cx - 8, cy + 4); g.lineTo(cx + 8, cy + 4); g.strokePath();
    g.lineStyle(2, color, 1);
    g.beginPath(); g.moveTo(cx, cy + 6); g.lineTo(cx, cy + 14);        g.strokePath();
  }

  _drawBowIcon(g, cx, cy, color) {
    g.lineStyle(2, color, 1);
    g.beginPath(); g.arc(cx + 5, cy, 13, Math.PI * 0.58, Math.PI * 1.42, false); g.strokePath();
    const sx = cx + 5 + 13 * Math.cos(Math.PI * 0.58);
    const sy1 = cy + 13 * Math.sin(Math.PI * 0.58), sy2 = cy + 13 * Math.sin(Math.PI * 1.42);
    g.beginPath(); g.moveTo(sx, sy1); g.lineTo(sx, sy2); g.strokePath();
    g.lineStyle(1.5, color, 1);
    g.beginPath(); g.moveTo(cx - 11, cy); g.lineTo(cx + 7, cy); g.strokePath();
    g.beginPath(); g.moveTo(cx + 7, cy); g.lineTo(cx + 3, cy - 3); g.moveTo(cx + 7, cy); g.lineTo(cx + 3, cy + 3); g.strokePath();
  }

  drawAttackButton(g) {
    const r       = this.attackBtnRect();
    const hasSel  = this.player.selectedEnemyId !== null && this.enemies.some(e => e.id === this.player.selectedEnemyId);
    const hasNear = !hasSel && this.nearestEnemyInAttackRange() !== null;
    const enabled = hasSel || hasNear;
    const inMode  = this.player.attackMode;
    const bowOnCd = this.player.weapon === 'bow' && this.player.bowCd > 0;

    let fillColor, fillAlpha, borderColor, borderWidth, textColor;
    if (inMode && !bowOnCd) {
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.time.now / 280));
      fillColor   = 0x6e1818; fillAlpha = 0.95;
      const c = Phaser.Display.Color.Interpolate.ColorWithColor({ r: 180, g: 60, b: 60 }, { r: 255, g: 160, b: 160 }, 100, Math.round(pulse * 100));
      borderColor = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
      borderWidth = 2.5; textColor = '#ffffff';
    } else if (enabled && !bowOnCd) {
      fillColor = 0xb42828; fillAlpha = 0.90; borderColor = 0xff8888; borderWidth = 1.5; textColor = '#ffffff';
    } else {
      fillColor = 0x1c1c1c; fillAlpha = 0.82; borderColor = 0x444444; borderWidth = 1.5; textColor = '#444444';
    }

    g.fillStyle(fillColor, fillAlpha);  g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(borderWidth, borderColor, 1); g.strokeRect(r.x, r.y, r.w, r.h);
    this.attackBtnText.setPosition(r.x + r.w / 2, r.y + r.h / 2).setColor(textColor);
  }

  drawTalkButton(g) {
    const nearNpc = this.npcs.find(n => Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS);
    if (!nearNpc) { this.talkBtnText.setVisible(false); return; }
    const r      = this.talkBtnRect();
    const active = nearNpc.talkTimer <= 0;
    g.fillStyle(active ? 0x28a050 : 0x1c1c1c, active ? 0.90 : 0.82); g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1.5, active ? 0x88ff88 : 0x444444, 1); g.strokeRect(r.x, r.y, r.w, r.h);
    this.talkBtnText.setPosition(r.x + r.w / 2, r.y + r.h / 2).setColor(active ? '#ffffff' : '#668866');
    this.talkBtnText.setVisible(true);
  }

  drawPotion(g) {
    const { x, y, w, h } = this.potionRect();
    const cx = x + w / 2, ready = this.player.potionCd <= 0;
    g.fillStyle(ready ? 0x3c0a50 : 0x1c1c1c, ready ? 0.88 : 0.82); g.fillRect(x, y, w, h);
    g.lineStyle(1.5, ready ? 0xb05cff : 0x444444, 1); g.strokeRect(x, y, w, h);
    const bodyY = y + h * 0.64, neckX = cx - 3.5, neckY = bodyY - 13;
    g.fillStyle(ready ? 0xcc44ff : 0x555555, 1); g.fillCircle(cx, bodyY, 11);
    g.fillStyle(ready ? 0x8822bb : 0x3a3a3a, 1); g.fillRect(neckX, neckY, 7, 11);
    g.fillStyle(ready ? 0xbb8844 : 0x444444, 1); g.fillRect(neckX + 0.5, neckY - 5, 6, 6);
    if (ready) { g.fillStyle(0xffffff, 0.32); g.fillCircle(cx - 4, bodyY - 4, 3); }
    if (!ready) this.potionCdText.setPosition(cx, y + h - 3).setText(Math.ceil(this.player.potionCd) + 's').setVisible(true);
    else        this.potionCdText.setVisible(false);
  }

  drawMinimap(g) {
    const mm = this.minimapRect(), scale = MINIMAP_SIZE / Math.max(MAP_W, MAP_H);
    g.fillStyle(0x000000, 0.65); g.fillRect(mm.x, mm.y, MINIMAP_SIZE, MINIMAP_SIZE);
    g.lineStyle(1, 0x555555, 1); g.strokeRect(mm.x, mm.y, MINIMAP_SIZE, MINIMAP_SIZE);
    g.fillStyle(0x2a6a2a, 1);
    for (const t of this.trees) g.fillRect(mm.x + t.x * scale - 1, mm.y + t.y * scale - 1, 2, 2);
    g.fillStyle(0xeeeeee, 1);
    for (const e of this.enemies) g.fillRect(mm.x + e.x * scale - 2, mm.y + e.y * scale - 2, 4, 4);
    g.fillStyle(0xffe060, 1);
    for (const n of this.npcs) g.fillRect(mm.x + n.x * scale - 2, mm.y + n.y * scale - 2, 4, 4);
    g.fillStyle(0x44aaff, 1);
    g.fillRect(mm.x + this.player.x * scale - 2.5, mm.y + this.player.y * scale - 2.5, 5, 5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#111111',
  pixelArt: true,
  scene: GameScene,
  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.NO_CENTER },
});
