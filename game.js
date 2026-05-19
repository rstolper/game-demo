const VERSION = '2026-05-19 11:30';

const RADIUS           = 18;
const ATTACK_RANGE     = RADIUS * 4;
const SPEED            = 300;
const ENEMY_SPEED      = 120;
const SPAWN_LEASH      = 700;
const AGGRO_RADIUS     = ATTACK_RANGE * 5; // range at which aggressive enemies re-engage
const MAP_W            = 3008;
const MAP_H            = 3008;
const PLAYER_MAX_HP    = 100;
const PLAYER_ATTACK    = 5;
const PLAYER_ATTACK_CD = 1.0;
const POTION_HEAL      = 50;
const POTION_CD        = 20;
const POTION_SIZE      = 52;
const ENEMY_MAX_HP         = 20;
const ENEMY_ATTACK         = 5;
const ENEMY_ATTACK_CD      = 1.0;
const ENEMY_REGEN_INTERVAL = 0.5;
const ENEMY_SPAWN_MIN_DIST = 200;
const REGEN_COMBAT_DELAY   = 3.0;
const ATTACK_MODE_GRACE    = 3.0; // seconds to re-select before attack mode turns off
const REGEN_INTERVAL       = 0.3;
const TREE_TILE_SIZE = 32; // collision rect size for trunk tiles
const TRUNK_TILE_IDS = new Set([441, 442, 443, 473, 474, 475, 569, 570, 571, 1023]);
const MINIMAP_SIZE   = 130;
const MINIMAP_MARGIN = 10;
const BOW_RANGE   = 900;
const BOW_CD      = 2.0;
const ARROW_SPEED = 500;
const WEAPON_SIZE   = 52;
const WEAPON_MARGIN = 12;
const ATTACK_BTN_H  = 28;
const TALK_BTN_H    = 28;
const TALK_RADIUS   = 150;
const TALK_DURATION = 10.0;
const WANDER_RADIUS       = 180;
const WANDER_INTERVAL_MIN = 3;
const WANDER_INTERVAL_MAX = 8;
const WANDER_SPEED_MULT   = 0.45; // fraction of ENEMY_SPEED used while wandering
const WANDER_TIMEOUT      = 5.0;  // give up wander if target not reached in this many seconds

// LPC character sheets — 64×64 per frame
// Standard sheets (13 cols): PlayerLPC, PlayerDaggerLPC, LittleWeirdoLPC, JimmyLPC
// Bow sheet (18 cols): PlayerBowLPC
const SPRITE_W = 64;
const SPRITE_H = 64;
const LPC_COLS_STD = 13;
const LPC_COLS_BOW = 18;

// Tweak these if animations look wrong.
// Row = 0-indexed row in the spritesheet for each facing direction.
// Frames = frame indices within that row (from the generator's preview, e.g. [0,1,2,3,4,5]).
const LPC_WALK_ROWS   = { up: 8,  left: 9,  down: 10, right: 11 };
const LPC_THRUST_ROWS = { up: 4,  left: 5,  down: 6,  right: 7  };
const LPC_SLASH_ROWS  = { up: 12, left: 13, down: 14, right: 15 };
const LPC_SHOOT_ROWS  = { up: 16, left: 17, down: 18, right: 19 };
const LPC_WALK_FRAMES   = [0, 1, 2, 3, 4, 5, 6, 7, 8];
const LPC_THRUST_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];
const LPC_SLASH_FRAMES  = [0, 1, 2, 3, 4, 5];
const LPC_SHOOT_FRAMES  = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const LPC_HURT_ROW      = 20;
const LPC_HURT_FRAMES   = [0, 1, 2, 3, 4, 5];

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    this.load.tilemapTiledJSON('map', 'map1.json');
    this.load.image('terrain_atlas', 'assets/Tiles/terrain_atlas.png');
    this.load.spritesheet('player-base',   'assets/Player/PlayerLPC.png',         { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-dagger', 'assets/Player/PlayerDaggerLPC.png',   { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-bow',    'assets/Player/PlayerBowLPC.png',      { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('weirdo',        'assets/Enemies/LittleWeirdoLPC.png',  { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('jimmy',         'assets/NPCs/JimmyLPC.png',            { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
  }

  create() {
    this.nextId    = 0;
    this.gameOver  = false;
    this.pDownPos  = null;   // screen pos of pointer-down
    this.pDownTime = 0;
    this.pMoved    = false;  // true once pointer drifts past tap threshold
    this.pOnEntity = false;  // true when the click landed on an enemy or NPC

    this.player = {
      x: MAP_W / 2, y: MAP_H / 2,
      hp: PLAYER_MAX_HP,
      attackCd: 0, combatDelay: 0, regenTick: REGEN_INTERVAL,
      level: 1, xp: 0, damage: PLAYER_ATTACK,
      potionCd: 0, weapon: 'sword', bowCd: 0,
      selectedEnemyId: null, selectedNpcId: null, attackTarget: null,
      facing: 'down', swingTimer: 0, swingDamageTimer: 0, bowShootTimer: 0,
      attackMode: false, attackModeTimer: 0,
    };
    this.target  = { x: this.player.x, y: this.player.y };
    this.enemies = [];
    this.arrows  = [];
    this.npcs    = [];
    this.trees   = [];

    this.createAnimations();

    // Tiled map — Land layer at depth 0, Trees layer above all sprites (depth > MAP_H)
    const map     = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage('terrain_atlas', 'terrain_atlas');
    map.createLayer('Land',  tileset, 0, 0).setDepth(0);
    // Canopy layer — full Trees data, trunk tiles hidden so they don't double-render
    const treesHigh = map.createLayer('Trees', tileset, 0, 0).setDepth(3100);
    treesHigh.forEachTile(t => { if (t.index !== -1 && TRUNK_TILE_IDS.has(t.index)) t.alpha = 0; });
    // Trunk layer — blank layer at low depth, populated only with trunk tiles so sprites render on top
    const treesLow = map.createBlankLayer('TrunksLow', tileset, 0, 0, map.width, map.height).setDepth(1);
    map.getLayer('Trees').data.forEach((row, r) =>
      row.forEach((tile, c) => {
        if (tile && tile.index !== -1 && TRUNK_TILE_IDS.has(tile.index)) treesLow.putTileAt(tile.index, c, r);
      })
    );

    // Derive tree collision rects from trunk tile IDs in the Trees layer
    this.initTreesFromMap(map);

    // worldGfx: overlays (rings, arrows, border) — above tree canopy so selection rings stay visible
    this.worldGfx = this.add.graphics().setDepth(3150);
    // uiGfx: screen-space HUD — above everything
    this.uiGfx = this.add.graphics().setScrollFactor(0).setDepth(5000);

    this.floatingNums = []; // active floating damage numbers

    this.enemyTextMap = new Map(); // id -> { hp: Text, sprite: Sprite }
    this.npcTextMap   = new Map(); // id -> { name: Text, dialogue: Text, sprite: Sprite }

    this.initEnemies();
    this.initNpcs();

    // Player — one sprite per weapon sheet; renderWorld shows only the active one
    const px = this.player.x, py = this.player.y;
    this.playerBaseSprite   = this.add.sprite(px, py, 'player-base').setOrigin(0.5, 1).setDepth(py).setVisible(false);
    this.playerDaggerSprite = this.add.sprite(px, py, 'player-dagger').setOrigin(0.5, 1).setDepth(py);
    this.playerBowSprite    = this.add.sprite(px, py, 'player-bow').setOrigin(0.5, 1).setDepth(py).setVisible(false);
    this.playerDaggerSprite.play('player-dagger-idle-down');

    // Screen-space UI text
    const mono = (sz, col, bold) => ({ fontFamily: 'monospace', fontSize: sz, color: col, fontStyle: bold ? 'bold' : 'normal' });
    const ui   = (obj) => obj.setScrollFactor(0).setDepth(5000);
    const W = this.W, H = this.H;

    this.levelText  = ui(this.add.text(16, 15, '', mono('14px', '#ffffff', true)));
    this.hpText     = ui(this.add.text(0,  0,  '', { ...mono('10px', '#ffffff'), stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5);
    this.xpText     = ui(this.add.text(0,  0,  '', { ...mono('10px', '#ffffff'), stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5);
    this.damageText = ui(this.add.text(16, 73, '', mono('11px', '#888888')));
    this.selNameText    = ui(this.add.text(W / 2, 8, '', mono('13px', '#eeeeee', true))).setOrigin(0.5, 0).setVisible(false);
    this.selHpText      = ui(this.add.text(W / 2, 35, '', { ...mono('10px', '#ffffff'), stroke: '#000000', strokeThickness: 3 })).setOrigin(0.5, 0.5).setVisible(false);
    this.versionText    = ui(this.add.text(8, H - 8, VERSION, mono('11px', '#ffffff'))).setAlpha(0.25).setOrigin(0, 1);
    this.attackBtnText  = ui(this.add.text(0, 0, 'ATTACK', mono('11px', '#ffffff', true))).setOrigin(0.5, 0.5);
    this.talkBtnText    = ui(this.add.text(0, 0, 'TALK',   mono('11px', '#ffffff', true))).setOrigin(0.5, 0.5).setVisible(false);
    this.swordCdText    = ui(this.add.text(0, 0, '', mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);
    this.bowCdText      = ui(this.add.text(0, 0, '', mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);
    this.potionCdText   = ui(this.add.text(0, 0, '', mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);

    this.gameOverText = ui(this.add.text(W / 2, H / 2 - 24, 'Game Over', {
      fontFamily: 'sans-serif', fontSize: '56px', color: '#ff5555', fontStyle: 'bold',
    })).setOrigin(0.5, 0.5).setDepth(6000).setVisible(false);
    this.gameOverSubText = ui(this.add.text(W / 2, H / 2 + 28, 'Reload the page to play again', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#999999',
    })).setOrigin(0.5, 0.5).setDepth(6000).setVisible(false);

    // Input
    this.input.on('pointerdown', this.onPointerDown, this);
    this.input.on('pointermove', this.onPointerMove, this);
    this.input.on('pointerup',   this.onPointerUp,   this);

    document.getElementById('add-enemy').addEventListener('click', () => this.spawnEnemy());

    this.scale.on('resize', (gs) => {
      const nW = gs.width, nH = gs.height;
      this.selNameText.setX(nW / 2);
      this.selHpText.setX(nW / 2);
      this.versionText.setY(nH - 8);
      this.gameOverText.setPosition(nW / 2, nH / 2 - 24);
      this.gameOverSubText.setPosition(nW / 2, nH / 2 + 28);
    });
  }

  createAnimations() {
    const DIRS = ['up', 'left', 'down', 'right'];

    const toFrames = (sheet, rowStart, indices) =>
      indices.map(i => ({ key: sheet, frame: rowStart + i }));

    // Standard 13-col sheets: walk + idle in all 4 directions
    for (const sheet of ['player-base', 'player-dagger', 'weirdo', 'jimmy']) {
      for (const dir of DIRS) {
        const rowStart = LPC_WALK_ROWS[dir] * LPC_COLS_STD;
        this.anims.create({
          key: `${sheet}-walk-${dir}`,
          frames: toFrames(sheet, rowStart, LPC_WALK_FRAMES),
          frameRate: 8, repeat: -1,
        });
        this.anims.create({
          key: `${sheet}-idle-${dir}`,
          frames: [{ key: sheet, frame: rowStart }],
          frameRate: 1,
        });
      }
    }

    // Weirdo hurt/death (single row, no direction)
    this.anims.create({
      key: 'weirdo-hurt',
      frames: toFrames('weirdo', LPC_HURT_ROW * LPC_COLS_STD, LPC_HURT_FRAMES),
      frameRate: 10, repeat: 0,
    });

    // Weirdo thrust attack
    for (const dir of DIRS) {
      const rowStart = LPC_THRUST_ROWS[dir] * LPC_COLS_STD;
      this.anims.create({
        key: `weirdo-thrust-${dir}`,
        frames: toFrames('weirdo', rowStart, LPC_THRUST_FRAMES),
        frameRate: 10, repeat: 0,
      });
    }

    // Dagger slash
    for (const dir of DIRS) {
      const rowStart = LPC_SLASH_ROWS[dir] * LPC_COLS_STD;
      this.anims.create({
        key: `player-dagger-slash-${dir}`,
        frames: toFrames('player-dagger', rowStart, LPC_SLASH_FRAMES),
        frameRate: 10, repeat: 0,
      });
    }

    // Bow sheet (18 cols): walk + idle + shoot
    for (const dir of DIRS) {
      const walkRowStart  = LPC_WALK_ROWS[dir]  * LPC_COLS_BOW;
      const shootRowStart = LPC_SHOOT_ROWS[dir] * LPC_COLS_BOW;
      this.anims.create({
        key: `player-bow-walk-${dir}`,
        frames: toFrames('player-bow', walkRowStart, LPC_WALK_FRAMES),
        frameRate: 8, repeat: -1,
      });
      this.anims.create({
        key: `player-bow-idle-${dir}`,
        frames: [{ key: 'player-bow', frame: walkRowStart }],
        frameRate: 1,
      });
      this.anims.create({
        key: `player-bow-shoot-${dir}`,
        frames: toFrames('player-bow', shootRowStart, LPC_SHOOT_FRAMES),
        frameRate: 10, repeat: 0,
      });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  get W() { return this.scale.width; }
  get H() { return this.scale.height; }

  getFacing(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
  }

  // Returns true if a target at (dx, dy) relative to the attacker is within their 180° forward arc.
  isFacingTarget(facing, dx, dy) {
    switch (facing) {
      case 'right': return dx > 0;
      case 'left':  return dx < 0;
      case 'down':  return dy > 0;
      case 'up':    return dy < 0;
    }
    return false;
  }

  playSpriteAnim(sprite, key) {
    if (!sprite.anims.currentAnim || sprite.anims.currentAnim.key !== key) sprite.play(key);
  }

  updateEntityAnim(sprite, sheet, facing, moving) {
    const key = moving ? `${sheet}-walk-${facing}` : `${sheet}-idle-${facing}`;
    this.playSpriteAnim(sprite, key);
    sprite.setFlipX(false);
  }

  // ── Init ───────────────────────────────────────────────────────────────

  initTreesFromMap(map) {
    const layer = map.getLayer('Trees').data;
    for (let row = 0; row < layer.length; row++) {
      for (let col = 0; col < layer[row].length; col++) {
        const tile = layer[row][col];
        if (tile && TRUNK_TILE_IDS.has(tile.index)) {
          this.trees.push({ x: col * 32 + 16, y: row * 32 + 16 });
        }
      }
    }
  }

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
    this.addNpc(MAP_W / 2 + 350, MAP_H / 2, 'Jimmy', 'Hello!');
  }

  addEnemy(x, y) {
    const enemy = {
      id: this.nextId++, x, y, spawnX: x, spawnY: y, state: 'idle',
      name: 'Little Weirdo', facing: 'down',
      hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
      attackCd: 0, thrustTimer: 0, regenTick: ENEMY_REGEN_INTERVAL, combatDelay: 0,
      dying: false, deathTimer: 0, aggressive: false,
      wanderTimer: WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN),
      wanderTarget: null, wanderTimeLeft: 0,
    };
    this.enemies.push(enemy);

    const sprite = this.add.sprite(x, y, 'weirdo').setOrigin(0.5, 1).setDepth(y);
    sprite.play('weirdo-idle-down');

    this.enemyTextMap.set(enemy.id, { sprite });
    return enemy;
  }

  addNpc(x, y, name, dialogue) {
    const npc = { id: this.nextId++, x, y, name, dialogue, talkTimer: 0 };
    this.npcs.push(npc);

    const sprite = this.add.sprite(x, y, 'jimmy').setOrigin(0.5, 1).setDepth(y);
    sprite.play('jimmy-idle-down');

    this.npcTextMap.set(npc.id, {
      sprite,
      name: this.add.text(x, y - RADIUS - 4, name, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffe090',
      }).setOrigin(0.5, 1).setDepth(3200),
      dialogue: this.add.text(x, y - RADIUS - 20, dialogue, {
        fontFamily: 'monospace', fontSize: '12px', color: '#222222',
        backgroundColor: '#f0eed7', padding: { x: 8, y: 4 },
      }).setOrigin(0.5, 1).setDepth(3200).setVisible(false),
    });
    return npc;
  }

  startEnemyDeath(enemy) {
    enemy.dying     = true;
    enemy.deathTimer = LPC_HURT_FRAMES.length / 10;
    enemy.state     = 'idle';
  }

  removeEnemy(enemy) {
    const t = this.enemyTextMap.get(enemy.id);
    if (t) {
      t.sprite.destroy();
      this.enemyTextMap.delete(enemy.id);
    }
  }

  spawnEnemy() {
    if (this.gameOver) return;
    const angle = Math.random() * Math.PI * 2;
    const dist  = ENEMY_SPAWN_MIN_DIST + Math.random() * 200;
    const x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, this.player.x + Math.cos(angle) * dist));
    const y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, this.player.y + Math.sin(angle) * dist));
    this.addEnemy(x, y);
  }

  // ── Collision ──────────────────────────────────────────────────────────

  resolveCircleRect(cx, cy, rx, ry, rw, rh) {
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
      return                { px: 0, py:  (RADIUS + dB) };
    }
    const overlap = RADIUS - dist;
    return { px: (dx / dist) * overlap, py: (dy / dist) * overlap };
  }

  applyTreeCollisions(entity) {
    for (const t of this.trees) {
      const push = this.resolveCircleRect(
        entity.x, entity.y,
        t.x - TREE_TILE_SIZE / 2, t.y - TREE_TILE_SIZE / 2, TREE_TILE_SIZE, TREE_TILE_SIZE,
      );
      if (push) { entity.x += push.px; entity.y += push.py; }
    }
  }

  // ── Input ──────────────────────────────────────────────────────────────

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
    if (!this.pMoved && this.pDownPos) this.handleTap(this.pDownPos.x, this.pDownPos.y);
    // Stop moving when pointer is released
    this.target    = { x: this.player.x, y: this.player.y };
    this.pDownPos  = null;
    this.pMoved    = false;
    this.pOnEntity = false;
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

  updatePointerMovement() {
    const pointer = this.input.activePointer;
    if (!pointer.isDown || !this.pDownPos) return;
    if (this.pOnEntity) return;
    if (this.isPointerOverUI(pointer.x, pointer.y)) return;
    if (!this.pMoved && Math.hypot(pointer.x - this.pDownPos.x, pointer.y - this.pDownPos.y) > (pointer.wasTouch ? 12 : 4)) {
      this.pMoved = true;
    }
    const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.target = { x: wp.x, y: wp.y };
    this.player.attackTarget = null;
  }

  // ── UI layout ──────────────────────────────────────────────────────────

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

  inRect(px, py, r) {
    return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
  }

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

  spawnDamageNumber(wx, wy, amount, color) {
    const t = this.add.text(wx, wy - SPRITE_H / 2, `-${amount}`, {
      fontFamily: 'monospace', fontSize: '13px', color,
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(3300);
    this.floatingNums.push({ obj: t, vy: -60, timer: 0.9 });
  }

  // ── Actions ────────────────────────────────────────────────────────────

  usePotion() {
    if (this.player.potionCd > 0) return;
    this.player.hp       = Math.min(PLAYER_MAX_HP, this.player.hp + POTION_HEAL);
    this.player.potionCd = POTION_CD;
  }

  shootArrow(enemy) {
    const dx = enemy.x - this.player.x, dy = enemy.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist > BOW_RANGE || this.player.bowCd > 0) return;
    this.player.bowCd         = BOW_CD;
    this.player.bowShootTimer = 0.6;
    enemy.aggressive = true;
    enemy.state = 'chasing';
    this.arrows.push({
      x: this.player.x, y: this.player.y,
      vx: (dx / dist) * ARROW_SPEED, vy: (dy / dist) * ARROW_SPEED,
      lifetime: BOW_RANGE / ARROW_SPEED + 0.2,
    });
  }

  executeAttack() {
    let enemy = this.enemies.find(e => e.id === this.player.selectedEnemyId);
    if (!enemy) enemy = this.nearestEnemyInAttackRange();
    if (!enemy) return;
    this.player.selectedEnemyId = enemy.id;
    if (this.player.weapon === 'bow') {
      this.shootArrow(enemy);
    } else {
      this.player.attackMode      = true;
      this.player.attackModeTimer = 0;
      this.player.attackTarget    = enemy.id;
      // Immediately face the enemy so a nearby player can swing without walking
      this.player.facing = this.getFacing(enemy.x - this.player.x, enemy.y - this.player.y);
    }
  }

  executeTalk() {
    // Use selected NPC if in range, otherwise auto-pick the nearest one
    let npc = this.npcs.find(n => n.id === this.player.selectedNpcId
      && Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS);
    if (!npc) {
      npc = this.npcs
        .filter(n => Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS)
        .sort((a, b) => Math.hypot(this.player.x - a.x, this.player.y - a.y)
                      - Math.hypot(this.player.x - b.x, this.player.y - b.y))[0];
    }
    if (!npc || npc.talkTimer > 0) return;
    npc.talkTimer = TALK_DURATION;
  }

  handleTap(sx, sy) {
    const mm = this.minimapRect();
    if (sx >= mm.x && sy <= MINIMAP_SIZE + MINIMAP_MARGIN * 2) return;
    if (this.inRect(sx, sy, this.potionRect()))  { this.usePotion(); return; }

    const wr = this.weaponRects();
    if (this.inRect(sx, sy, wr.sword)) { this.player.weapon = 'sword'; return; }
    if (this.inRect(sx, sy, wr.bow))   { this.player.weapon = 'bow';   return; }

    if (this.inRect(sx, sy, this.attackBtnRect())) {
      const hasSel  = this.player.selectedEnemyId !== null && this.enemies.some(e => e.id === this.player.selectedEnemyId);
      if (hasSel || this.nearestEnemyInAttackRange()) { this.executeAttack(); return; }
      return;
    }
    if (this.isNearNpc() && this.inRect(sx, sy, this.talkBtnRect())) { this.executeTalk(); return; }

    const wp = this.cameras.main.getWorldPoint(sx, sy);

    for (const enemy of this.enemies) {
      if (Math.hypot(wp.x - enemy.x, wp.y - enemy.y) <= RADIUS * 3) {
        this.player.selectedEnemyId = enemy.id;
        this.player.selectedNpcId   = null;
        if (this.player.attackMode) {
          // Re-selecting an enemy while in attack mode (or grace period) — retarget immediately
          this.player.attackTarget    = enemy.id;
          this.player.attackModeTimer = 0;
          this.player.facing = this.getFacing(enemy.x - this.player.x, enemy.y - this.player.y);
        } else {
          this.player.attackTarget = null;
        }
        return;
      }
    }
    for (const npc of this.npcs) {
      if (Math.hypot(wp.x - npc.x, wp.y - npc.y) <= RADIUS * 3) {
        this.player.selectedNpcId   = npc.id;
        this.player.selectedEnemyId = null;
        this.player.attackTarget    = null;
        if (this.player.attackMode) this.player.attackModeTimer = ATTACK_MODE_GRACE;
        return;
      }
    }

    this.player.selectedEnemyId = null;
    this.player.selectedNpcId   = null;
    this.player.attackTarget    = null;
    if (this.player.attackMode) this.player.attackModeTimer = ATTACK_MODE_GRACE;
  }

  // ── Game update ────────────────────────────────────────────────────────

  updateGame(dt) {
    const player = this.player;

    if (player.attackTarget !== null) {
      const tgt = this.enemies.find(e => e.id === player.attackTarget);
      if (!tgt) {
        player.attackTarget = null;
      } else {
        const tdx = player.x - tgt.x, tdy = player.y - tgt.y;
        const td   = Math.hypot(tdx, tdy);
        const stopAt = ATTACK_RANGE + RADIUS * 0.5;
        if (td > stopAt) this.target = { x: tgt.x + (tdx / td) * stopAt, y: tgt.y + (tdy / td) * stopAt };
        else             this.target = { x: player.x, y: player.y };
      }
    }

    const dx = this.target.x - player.x, dy = this.target.y - player.y;
    const distToTarget = Math.hypot(dx, dy);
    const isMoving = distToTarget > 2;
    if (isMoving) {
      const step = Math.min(SPEED * dt, distToTarget);
      player.x += (dx / distToTarget) * step;
      player.y += (dy / distToTarget) * step;
      player.facing = this.getFacing(dx, dy);
    }
    player.x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x));
    player.y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y));
    this.applyTreeCollisions(player);
    player.x = Math.max(RADIUS, Math.min(MAP_W - RADIUS, player.x));
    player.y = Math.max(RADIUS, Math.min(MAP_H - RADIUS, player.y));

    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      const prevX = enemy.x, prevY = enemy.y;

      // Aggressive enemies re-engage when the player comes within AGGRO_RADIUS,
      // but only if the player is still within the leash range of the enemy's spawn
      if (enemy.aggressive && enemy.state !== 'chasing') {
        const distToPlayer = Math.hypot(player.x - enemy.x, player.y - enemy.y);
        const playerFromSpawn = Math.hypot(player.x - enemy.spawnX, player.y - enemy.spawnY);
        if (distToPlayer <= AGGRO_RADIUS && playerFromSpawn <= SPAWN_LEASH) {
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
          this.applyTreeCollisions(enemy);
        } else {
          // In attack range — always face the player
          enemy.facing = this.getFacing(player.x - enemy.x, player.y - enemy.y);
        }
      } else if (enemy.state === 'returning') {
        const rdx = enemy.spawnX - enemy.x, rdy = enemy.spawnY - enemy.y;
        const d = Math.hypot(rdx, rdy);
        if (d < 2) {
          enemy.x = enemy.spawnX; enemy.y = enemy.spawnY; enemy.state = 'idle';
          enemy.wanderTimer = WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
        } else {
          const step = Math.min(ENEMY_SPEED * dt, d);
          enemy.x += rdx / d * step;
          enemy.y += rdy / d * step;
          this.applyTreeCollisions(enemy);
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
        const wd  = Math.hypot(wdx, wdy);
        if (wd < 4 || enemy.wanderTimeLeft <= 0) {
          enemy.state = 'idle';
          enemy.wanderTimer = WANDER_INTERVAL_MIN + Math.random() * (WANDER_INTERVAL_MAX - WANDER_INTERVAL_MIN);
          enemy.wanderTarget = null;
        } else {
          const step = Math.min(ENEMY_SPEED * WANDER_SPEED_MULT * dt, wd);
          enemy.x += (wdx / wd) * step;
          enemy.y += (wdy / wd) * step;
          this.applyTreeCollisions(enemy);
        }
      }
      const movedX = enemy.x - prevX, movedY = enemy.y - prevY;
      if (Math.hypot(movedX, movedY) > 0.1) enemy.facing = this.getFacing(movedX, movedY);
    }

    this.floatingNums = this.floatingNums.filter(f => {
      f.timer -= dt;
      if (f.timer <= 0) { f.obj.destroy(); return false; }
      f.obj.y += f.vy * dt;
      f.obj.setAlpha(Math.min(1, f.timer / 0.3));
      return true;
    });

    player.attackCd      = Math.max(0, player.attackCd      - dt);
    player.potionCd      = Math.max(0, player.potionCd      - dt);
    player.bowCd         = Math.max(0, player.bowCd         - dt);
    player.swingTimer      = Math.max(0, player.swingTimer      - dt);
    player.bowShootTimer   = Math.max(0, player.bowShootTimer   - dt);
    if (player.attackModeTimer > 0) {
      player.attackModeTimer = Math.max(0, player.attackModeTimer - dt);
      if (player.attackModeTimer === 0) player.attackMode = false;
    }
    const prevDmgTimer     = player.swingDamageTimer;
    player.swingDamageTimer = Math.max(0, player.swingDamageTimer - dt);
    if (prevDmgTimer > 0 && player.swingDamageTimer === 0) {
      const tgt = this.enemies.find(e => e.id === player.attackTarget);
      if (tgt && !tgt.dying) {
        const edx = tgt.x - player.x, edy = tgt.y - player.y;
        if (Math.hypot(edx, edy) <= ATTACK_RANGE + RADIUS && this.isFacingTarget(player.facing, edx, edy)) {
          tgt.aggressive = true;
          tgt.facing = this.getFacing(-edx, -edy); // enemy turns to face player
          tgt.hp = Math.max(0, tgt.hp - player.damage);
          this.spawnDamageNumber(tgt.x, tgt.y, player.damage, '#ffdd44');
          if (tgt.hp === 0) {
            this.awardXp();
            this.startEnemyDeath(tgt);
            player.attackMode   = false;
            player.attackTarget = null;
          } else {
            tgt.state = 'chasing';
          }
        }
      }
    }
    for (const e of this.enemies) {
      e.attackCd    = Math.max(0, e.attackCd    - dt);
      e.thrustTimer = Math.max(0, e.thrustTimer - dt);
      if (e.dying) e.deathTimer = Math.max(0, e.deathTimer - dt);
    }

    this.arrows = this.arrows.filter(a => {
      a.x += a.vx * dt; a.y += a.vy * dt; a.lifetime -= dt;
      if (a.lifetime <= 0) return false;
      for (const enemy of this.enemies) {
        if (enemy.dying) continue;
        if (Math.hypot(a.x - enemy.x, a.y - enemy.y) <= RADIUS) {
          enemy.aggressive = true;
          enemy.hp = Math.max(0, enemy.hp - player.damage);
          this.spawnDamageNumber(enemy.x, enemy.y, player.damage, '#ffdd44');
          if (enemy.hp === 0) { this.awardXp(); this.startEnemyDeath(enemy); }
          return false;
        }
      }
      return true;
    });

    let anyInRange = false;
    for (const e of this.enemies) e.inCombat = false;

    for (const enemy of this.enemies) {
      if (enemy.dying) continue;
      if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > ATTACK_RANGE + RADIUS) continue;
      anyInRange     = true;
      enemy.inCombat = true;
      if (!enemy.aggressive) continue; // passive — never attack first
      // Enemy only attacks when player is within their 180° forward arc
      if (!this.isFacingTarget(enemy.facing, player.x - enemy.x, player.y - enemy.y)) continue;
      if (enemy.attackCd <= 0) {
        enemy.attackCd    = ENEMY_ATTACK_CD;
        enemy.thrustTimer = LPC_THRUST_FRAMES.length / 10;
        player.hp = Math.max(0, player.hp - ENEMY_ATTACK);
        this.spawnDamageNumber(player.x, player.y, ENEMY_ATTACK, '#ff5555');
        if (player.hp === 0) { this.onGameOver(); return; }
        // Hitting the player engages attack mode; only steal selection if none exists
        if (player.selectedEnemyId === null) {
          player.selectedEnemyId = enemy.id;
        }
        player.attackTarget    = player.selectedEnemyId;
        player.attackMode      = true;
        player.attackModeTimer = 0;
      }
    }

    if (player.weapon === 'sword' && player.attackMode && player.attackCd <= 0) {
      const tgt = this.enemies.find(e => e.id === player.attackTarget);
      if (tgt && !tgt.dying) {
        const edx = tgt.x - player.x, edy = tgt.y - player.y;
        if (Math.hypot(edx, edy) <= ATTACK_RANGE + RADIUS && this.isFacingTarget(player.facing, edx, edy)) {
          player.attackCd         = PLAYER_ATTACK_CD;
          player.swingTimer       = LPC_SLASH_FRAMES.length / 10;
          player.swingDamageTimer = 4 / 10;
        }
      }
    }

    // Remove enemies whose death animation has finished
    const toRemove = this.enemies.filter(e => e.dying && e.deathTimer <= 0);
    for (const enemy of toRemove) this.removeEnemy(enemy);
    this.enemies = this.enemies.filter(e => !(e.dying && e.deathTimer <= 0));

    if (player.selectedEnemyId !== null && !this.enemies.some(e => e.id === player.selectedEnemyId)) player.selectedEnemyId = null;
    if (player.attackTarget    !== null && !this.enemies.some(e => e.id === player.attackTarget))    player.attackTarget    = null;

    for (const enemy of this.enemies) {
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

    for (const npc of this.npcs) {
      if (npc.talkTimer > 0) npc.talkTimer = Math.max(0, npc.talkTimer - dt);
    }

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

  awardXp() {
    this.player.xp += 20;
    while (this.player.xp >= 100) { this.player.xp -= 100; this.player.level++; this.player.damage++; }
  }

  onGameOver() {
    this.gameOver = true;
    this.gameOverText.setVisible(true);
    this.gameOverSubText.setVisible(true);
  }

  // ── Camera ─────────────────────────────────────────────────────────────

  syncCamera() {
    const W = this.W, H = this.H;
    const camY = this.player.y - SPRITE_H / 2; // center on mid-body, not feet
    this.cameras.main.setScroll(
      Math.max(0, Math.min(MAP_W - W, this.player.x - W / 2)),
      Math.max(0, Math.min(MAP_H - H, camY - H / 2)),
    );
  }

  // ── Rendering ──────────────────────────────────────────────────────────

  renderWorld() {
    const g = this.worldGfx;
    g.clear();

    // Map border
    g.lineStyle(6, 0x666666, 1);
    g.strokeRect(0, 0, MAP_W, MAP_H);

    // Target indicator
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(this.target.x, this.target.y, 6);

    // Attack range rings — yellow for passive, red for aggressive
    // Circles are centered at mid-body (feet pos minus half sprite height)
    const cy = (e) => e.y - SPRITE_H / 2;

    for (const e of this.enemies) {
      const ringFill   = e.aggressive ? 0xff5050 : 0xddcc22;
      const ringStroke = e.aggressive ? 0xff6464 : 0xeedd44;
      g.fillStyle(ringFill, 0.06);
      g.fillCircle(e.x, cy(e), ATTACK_RANGE);
      g.lineStyle(1, ringStroke, 0.25);
      g.strokeCircle(e.x, cy(e), ATTACK_RANGE);
    }
    g.fillStyle(0x44aaff, 0.07);
    g.fillCircle(this.player.x, cy(this.player), ATTACK_RANGE);
    g.lineStyle(1, 0x44aaff, 0.25);
    g.strokeCircle(this.player.x, cy(this.player), ATTACK_RANGE);

    // Selection rings
    const selEnemy = this.enemies.find(e => e.id === this.player.selectedEnemyId);
    if (selEnemy) {
      g.fillStyle(0xffffff, 0.05);
      g.fillCircle(selEnemy.x, cy(selEnemy), RADIUS + 16);
      g.lineStyle(3, 0xffffff, 0.18);
      g.strokeCircle(selEnemy.x, cy(selEnemy), RADIUS + 16);
      g.lineStyle(2, 0xffffff, 0.80);
      g.strokeCircle(selEnemy.x, cy(selEnemy), RADIUS + 11);
    }
    const selNpc = this.npcs.find(n => n.id === this.player.selectedNpcId);
    if (selNpc) {
      g.fillStyle(0xffdc50, 0.05);
      g.fillCircle(selNpc.x, cy(selNpc), RADIUS + 16);
      g.lineStyle(3, 0xffdc50, 0.18);
      g.strokeCircle(selNpc.x, cy(selNpc), RADIUS + 16);
      g.lineStyle(2, 0xffdc50, 0.80);
      g.strokeCircle(selNpc.x, cy(selNpc), RADIUS + 11);
    }

    // Arrows
    for (const a of this.arrows) {
      const mag = Math.hypot(a.vx, a.vy), len = 14;
      g.lineStyle(2, 0xffcc44, 1);
      g.beginPath();
      g.moveTo(a.x - (a.vx / mag) * len, a.y - (a.vy / mag) * len);
      g.lineTo(a.x, a.y);
      g.strokePath();
    }

    // ── Update sprites ─────────────────────────────────────────────────

    // Player — show sprite for current weapon, play attack anim when swinging/shooting
    const depth    = this.player.y;
    const isMoving = Math.hypot(this.target.x - this.player.x, this.target.y - this.player.y) > 2;
    const swinging = this.player.swingTimer > 0    && this.player.weapon === 'sword';
    const shooting = this.player.bowShootTimer > 0 && this.player.weapon === 'bow';

    const activePlayerSprite =
      this.player.weapon === 'bow'   ? this.playerBowSprite    :
      this.player.weapon === 'sword' ? this.playerDaggerSprite : this.playerBaseSprite;
    const activeSheet =
      this.player.weapon === 'bow'   ? 'player-bow'    :
      this.player.weapon === 'sword' ? 'player-dagger' : 'player-base';

    for (const s of [this.playerBaseSprite, this.playerDaggerSprite, this.playerBowSprite]) {
      s.setPosition(this.player.x, this.player.y).setDepth(depth).setVisible(false);
    }
    activePlayerSprite.setVisible(true);

    if (swinging) {
      this.playSpriteAnim(activePlayerSprite, `player-dagger-slash-${this.player.facing}`);
    } else if (shooting) {
      this.playSpriteAnim(activePlayerSprite, `player-bow-shoot-${this.player.facing}`);
    } else {
      this.updateEntityAnim(activePlayerSprite, activeSheet, this.player.facing, isMoving);
    }

    // Mini HP bar above player head (world space)
    const barW = 32, barH = 4;
    const barX = this.player.x - barW / 2, barY = this.player.y - SPRITE_H - 6;
    const hpFracP = this.player.hp / PLAYER_MAX_HP;
    const hpColorP = hpFracP > 0.5 ? 0x44cc44 : hpFracP > 0.25 ? 0xddaa00 : 0xcc2222;
    g.fillStyle(0x111111, 0.8); g.fillRect(barX, barY, barW, barH);
    if (hpFracP > 0) { g.fillStyle(hpColorP, 1); g.fillRect(barX, barY, barW * hpFracP, barH); }
    g.lineStyle(1, 0x000000, 0.6); g.strokeRect(barX, barY, barW, barH);

    // Enemies
    for (const enemy of this.enemies) {
      const t = this.enemyTextMap.get(enemy.id);
      if (!t) continue;
      t.sprite.setPosition(enemy.x, enemy.y).setDepth(enemy.y);
      if (enemy.dying) {
        this.playSpriteAnim(t.sprite, 'weirdo-hurt');
      } else if (enemy.thrustTimer > 0) {
        this.playSpriteAnim(t.sprite, `weirdo-thrust-${enemy.facing}`);
      } else {
        const enemyMoving = enemy.state === 'chasing' || enemy.state === 'returning' || enemy.state === 'wandering';
        this.updateEntityAnim(t.sprite, 'weirdo', enemy.facing, enemyMoving);
      }
    }

    // NPCs
    for (const npc of this.npcs) {
      const t = this.npcTextMap.get(npc.id);
      if (!t) continue;
      t.name.setPosition(npc.x, npc.y - SPRITE_H - 4);
      if (npc.talkTimer > 0) {
        t.dialogue.setPosition(npc.x, npc.y - SPRITE_H - 22).setVisible(true);
      } else {
        t.dialogue.setVisible(false);
      }
    }
  }

  renderUI() {
    const g = this.uiGfx;
    const W = this.W, H = this.H;
    g.clear();

    // Stats panel
    const panelW = 160, panelH = 94;
    g.fillStyle(0x000000, 0.50); g.fillRoundedRect(8, 8, panelW, panelH, 6);
    g.lineStyle(1, 0x444444, 0.7); g.strokeRoundedRect(8, 8, panelW, panelH, 6);

    this.levelText.setText(`Level ${this.player.level}`);
    this.damageText.setText(`DMG  ${this.player.damage}`);

    // HP bar
    const hp = this.player.hp, hpBarX = 16, hpBarY = 34, hpBarW = 136, hpBarH = 12;
    const hpFrac  = hp / PLAYER_MAX_HP;
    const hpColor = Phaser.Display.Color.HSLToColor(hpFrac * 110 / 360, 0.75, 0.42).color;
    g.fillStyle(0x222222, 1); g.fillRoundedRect(hpBarX, hpBarY, hpBarW, hpBarH, 4);
    if (hpFrac > 0) { g.fillStyle(hpColor, 1); g.fillRoundedRect(hpBarX, hpBarY, hpBarW * hpFrac, hpBarH, 4); }
    g.lineStyle(1, 0x553333, 0.6); g.strokeRoundedRect(hpBarX, hpBarY, hpBarW, hpBarH, 4);
    this.hpText.setText(`HP  ${hp} / ${PLAYER_MAX_HP}`).setPosition(hpBarX + hpBarW / 2, hpBarY + hpBarH / 2);

    // XP bar
    const xp = this.player.xp, xpMax = 100;
    const barX = 16, barY = 53, barW = 136, barH = 12;
    g.fillStyle(0x222222, 1); g.fillRoundedRect(barX, barY, barW, barH, 4);
    if (xp > 0) { g.fillStyle(0x3388ff, 1); g.fillRoundedRect(barX, barY, barW * (xp / xpMax), barH, 4); }
    g.lineStyle(1, 0x445566, 0.6); g.strokeRoundedRect(barX, barY, barW, barH, 4);
    this.xpText.setText(`XP  ${xp} / ${xpMax}`).setPosition(barX + barW / 2, barY + barH / 2);
    this.versionText.setY(H - 8);

    const selEnemy = this.enemies.find(e => e.id === this.player.selectedEnemyId);
    if (selEnemy) {
      this.selNameText.setX(W / 2).setText(selEnemy.name).setColor('#eeeeee').setVisible(true);
      const barW = 180, barH = 14, barX = W / 2 - barW / 2, barY = 28;
      g.fillStyle(0x222222, 1); g.fillRect(barX, barY, barW, barH);
      const hpFrac  = selEnemy.hp / selEnemy.maxHp;
      const hpColor = Phaser.Display.Color.HSLToColor(hpFrac * 110 / 360, 0.65, 0.42).color;
      g.fillStyle(hpColor, 1); g.fillRect(barX, barY, barW * hpFrac, barH);
      g.lineStyle(1, 0x555555, 1); g.strokeRect(barX, barY, barW, barH);
      this.selHpText.setPosition(W / 2, barY + barH / 2).setText(`${selEnemy.hp} / ${selEnemy.maxHp}`).setVisible(true);
    } else {
      const selNpc = this.npcs.find(n => n.id === this.player.selectedNpcId);
      if (selNpc) { this.selNameText.setX(W / 2).setText(selNpc.name).setColor('#ffe090').setVisible(true); }
      else         { this.selNameText.setVisible(false); }
      this.selHpText.setVisible(false);
    }

    const wr = this.weaponRects();
    this.drawWeaponTile(g, wr.sword, 'sword', this.player.attackCd, PLAYER_ATTACK_CD, this.player.weapon === 'sword');
    this.drawWeaponTile(g, wr.bow,   'bow',   this.player.bowCd,    BOW_CD,           this.player.weapon === 'bow');

    if (this.player.attackCd > 0) this.swordCdText.setPosition(wr.sword.x + WEAPON_SIZE / 2, wr.sword.y + WEAPON_SIZE - 3).setText(Math.ceil(this.player.attackCd) + 's').setVisible(true);
    else this.swordCdText.setVisible(false);
    if (this.player.bowCd > 0) this.bowCdText.setPosition(wr.bow.x + WEAPON_SIZE / 2, wr.bow.y + WEAPON_SIZE - 3).setText(Math.ceil(this.player.bowCd) + 's').setVisible(true);
    else this.bowCdText.setVisible(false);

    this.drawAttackButton(g);
    this.drawTalkButton(g);
    this.drawPotion(g);
    this.drawMinimap(g);

    if (this.gameOver) {
      g.fillStyle(0x000000, 0.72);
      g.fillRect(0, 0, W, H);
    }
  }

  drawWeaponTile(g, r, type, cd, maxCd, selected) {
    g.fillStyle(selected ? 0x284880 : 0x1c1c1c, selected ? 0.88 : 0.82);
    g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(selected ? 2 : 1.5, selected ? 0x88aaff : 0x444444, 1);
    g.strokeRect(r.x, r.y, r.w, r.h);

    const ic = cd > 0 ? 0x555555 : (selected ? 0xdddeff : 0xaaaaaa);
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (type === 'sword') this.drawSwordIcon(g, cx, cy, ic);
    else                  this.drawBowIcon(g, cx, cy, ic);

    if (cd > 0) {
      g.fillStyle(0x000000, 0.55);
      g.fillRect(r.x, r.y + r.h * (1 - Math.min(cd / maxCd, 1)), r.w, r.h * Math.min(cd / maxCd, 1));
    }
  }

  drawSwordIcon(g, cx, cy, color) {
    g.lineStyle(2.5, color, 1);
    g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx, cy + 6);       g.strokePath();
    g.beginPath(); g.moveTo(cx - 8, cy + 4); g.lineTo(cx + 8, cy + 4); g.strokePath();
    g.lineStyle(2, color, 1);
    g.beginPath(); g.moveTo(cx, cy + 6); g.lineTo(cx, cy + 14);       g.strokePath();
  }

  drawBowIcon(g, cx, cy, color) {
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
    const r          = this.attackBtnRect();
    const hasSel     = this.player.selectedEnemyId !== null && this.enemies.some(e => e.id === this.player.selectedEnemyId);
    const hasNear    = !hasSel && this.nearestEnemyInAttackRange() !== null;
    const enabled    = hasSel || hasNear;
    const inMode     = this.player.attackMode;
    const bowOnCd    = this.player.weapon === 'bow' && this.player.bowCd > 0;

    let fillColor, fillAlpha, borderColor, borderWidth, textColor;
    if (inMode && !bowOnCd) {
      // Attack Mode active — muted red with pulsing border
      const pulse = 0.6 + 0.4 * Math.abs(Math.sin(this.time.now / 280));
      fillColor   = 0x6e1818; fillAlpha = 0.95;
      borderColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        { r: 180, g: 60, b: 60 }, { r: 255, g: 160, b: 160 }, 100, Math.round(pulse * 100)
      );
      borderColor = Phaser.Display.Color.GetColor(borderColor.r, borderColor.g, borderColor.b);
      borderWidth = 2.5;
      textColor   = '#ffffff';
    } else if (enabled && !bowOnCd) {
      // Ready to attack — bright red
      fillColor = 0xb42828; fillAlpha = 0.90;
      borderColor = 0xff8888; borderWidth = 1.5;
      textColor   = '#ffffff';
    } else {
      // Disabled
      fillColor = 0x1c1c1c; fillAlpha = 0.82;
      borderColor = 0x444444; borderWidth = 1.5;
      textColor   = '#444444';
    }

    g.fillStyle(fillColor, fillAlpha);
    g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(borderWidth, borderColor, 1);
    g.strokeRect(r.x, r.y, r.w, r.h);
    this.attackBtnText.setPosition(r.x + r.w / 2, r.y + r.h / 2);
    this.attackBtnText.setColor(textColor);
  }

  drawTalkButton(g) {
    const nearNpc = this.npcs.find(n => Math.hypot(this.player.x - n.x, this.player.y - n.y) <= TALK_RADIUS);
    if (!nearNpc) { this.talkBtnText.setVisible(false); return; }
    const r      = this.talkBtnRect();
    const active = nearNpc.talkTimer <= 0;
    g.fillStyle(active ? 0x28a050 : 0x1c1c1c, active ? 0.90 : 0.82);
    g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1.5, active ? 0x88ff88 : 0x444444, 1);
    g.strokeRect(r.x, r.y, r.w, r.h);
    this.talkBtnText.setPosition(r.x + r.w / 2, r.y + r.h / 2);
    this.talkBtnText.setColor(active ? '#ffffff' : '#668866');
    this.talkBtnText.setVisible(true);
  }

  drawPotion(g) {
    const { x, y, w, h } = this.potionRect();
    const cx = x + w / 2, ready = this.player.potionCd <= 0;
    g.fillStyle(ready ? 0x3c0a50 : 0x1c1c1c, ready ? 0.88 : 0.82);
    g.fillRect(x, y, w, h);
    g.lineStyle(1.5, ready ? 0xb05cff : 0x444444, 1);
    g.strokeRect(x, y, w, h);
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
    for (const t of this.trees) {
      g.fillRect(mm.x + t.x * scale - 1, mm.y + t.y * scale - 1, 2, 2);
    }
    g.fillStyle(0xeeeeee, 1);
    for (const e of this.enemies) g.fillRect(mm.x + e.x * scale - 2, mm.y + e.y * scale - 2, 4, 4);
    g.fillStyle(0xffe060, 1);
    for (const n of this.npcs) g.fillRect(mm.x + n.x * scale - 2, mm.y + n.y * scale - 2, 4, 4);
    g.fillStyle(0x44aaff, 1);
    g.fillRect(mm.x + this.player.x * scale - 2.5, mm.y + this.player.y * scale - 2.5, 5, 5);
  }

  // ── Phaser loop ────────────────────────────────────────────────────────

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.1);
    if (!this.gameOver) this.updatePointerMovement();
    if (!this.gameOver) this.updateGame(dt);
    this.syncCamera();
    this.renderWorld();
    this.renderUI();
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#111111',
  pixelArt: true,
  scene: GameScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
});
