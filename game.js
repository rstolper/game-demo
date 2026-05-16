const VERSION = '2026-05-15 14:00';

const RADIUS           = 18;
const ATTACK_RANGE     = RADIUS * 2.5;
const SPEED            = 300;
const ENEMY_SPEED      = 120;
const SPAWN_LEASH      = 700;
const MAP_W            = 3000;
const MAP_H            = 3000;
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
const TALK_BTN_H    = 28;
const TALK_RADIUS   = 150;
const TALK_DURATION = 10.0;

// Terrain zones — rectangular areas placed on the map
const LAKE_ZONE  = { x: 1900, y: 400,  w: 600, h: 400 }; // northeast lake
const BEACH_ZONE = { x: 1848, y: 348,  w: 704, h: 504 }; // sand border around lake
const FARM_ZONE  = { x: 300,  y: 2100, w: 750, h: 500 }; // southwest farmland

// Sprite sheet layout: Player.png and Skeleton.png are both 192×320, 32×32 per frame (6 cols × 10 rows)
// Player.png / Skeleton.png — 192×320, 32×32 per frame (6 cols × 10 rows)
// Row 0: walk down  (frames  0-5)
// Row 1: walk right (frames  6-11)
// Row 2: walk up    (frames 12-17)
// Left = right mirrored (flipX)

// Player_Actions.png — 96×576, 48×48 per frame (2 cols × 12 rows)
// Row 2 (frames 4-5):  sword swing, facing right
// Row 3 (frames 6-7):  sword swing, facing down (toward camera)
// Row 4 (frames 8-9):  sword swing, facing up   (away from camera)
const SPRITE_W = 32;
const SPRITE_H = 32;
// Row 0=down, Row 1=right, Row 2=up. No separate left row — left is right flipped horizontally.
const WALK_FRAMES = { down: 0, right: 6, up: 12 };
const IDLE_FRAME  = { down: 1, right: 7, up: 13 };

class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  preload() {
    this.load.spritesheet('player',         'assets/Player/Player.png',            { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.spritesheet('player-actions', 'assets/Player/Player_Actions.png',    { frameWidth: 48, frameHeight: 48 });
    this.load.spritesheet('skeleton',       'assets/Enemies/Skeleton.png',         { frameWidth: SPRITE_W, frameHeight: SPRITE_H });
    this.load.image('grass',   'assets/Tiles/Grass_Middle.png');
    this.load.image('water',   'assets/Tiles/Water_Middle.png');
    this.load.image('beach',   'assets/Tiles/Beach_Tile.png');
    this.load.image('farmland','assets/Tiles/FarmLand_Tile.png');
    this.load.image('tree',    'assets/Outdoor decoration/Oak_Tree.png');
  }

  create() {
    this.nextId    = 0;
    this.gameOver  = false;
    this.pDownPos  = null;   // screen pos of pointer-down
    this.pDownTime = 0;
    this.pMoved    = false;  // true once pointer drifts past tap threshold

    this.player = {
      x: MAP_W / 2, y: MAP_H / 2,
      hp: PLAYER_MAX_HP,
      attackCd: 0, combatDelay: 0, regenTick: REGEN_INTERVAL,
      level: 1, xp: 0, damage: PLAYER_ATTACK,
      potionCd: 0, weapon: 'sword', bowCd: 0,
      selectedEnemyId: null, selectedNpcId: null, attackTarget: null,
      facing: 'down', swingTimer: 0,
    };
    this.target  = { x: this.player.x, y: this.player.y };
    this.enemies = [];
    this.arrows  = [];
    this.npcs    = [];
    this.trees   = [];

    this.createAnimations();

    // Ground — tiled grass across the whole map
    this.add.tileSprite(0, 0, MAP_W, MAP_H, 'grass').setOrigin(0, 0).setDepth(0);

    // Terrain zones
    this.add.tileSprite(FARM_ZONE.x,  FARM_ZONE.y,  FARM_ZONE.w,  FARM_ZONE.h,  'farmland').setOrigin(0, 0).setDepth(1);
    this.add.tileSprite(BEACH_ZONE.x, BEACH_ZONE.y, BEACH_ZONE.w, BEACH_ZONE.h, 'beach'   ).setOrigin(0, 0).setDepth(2);
    this.add.tileSprite(LAKE_ZONE.x,  LAKE_ZONE.y,  LAKE_ZONE.w,  LAKE_ZONE.h,  'water'   ).setOrigin(0, 0).setDepth(3);

    // worldGfx: overlays only (rings, arrows, border) — depth above ground, below sprites
    this.worldGfx = this.add.graphics().setDepth(50);
    // uiGfx: screen-space HUD
    this.uiGfx = this.add.graphics().setScrollFactor(0).setDepth(200);

    // World-space text (above sprites)
    this.playerHpText = this.add.text(0, 0, '', {
      fontFamily: 'monospace', fontSize: '11px', color: '#dddddd',
    }).setOrigin(0.5, 1).setDepth(120);

    this.enemyTextMap = new Map(); // id -> { hp: Text, sprite: Sprite }
    this.npcTextMap   = new Map(); // id -> { name: Text, dialogue: Text, sprite: Sprite }

    this.initTrees();
    this.initEnemies();
    this.initNpcs();

    // Player sprite (created after init so depth sorts correctly from the start)
    this.playerSprite = this.add.sprite(this.player.x, this.player.y, 'player')
      .setDepth(this.player.y)
      .setScale(1.5);
    this.playerSprite.play('player-idle-down');

    // Action sprite overlaid on player for sword-swing animation
    // Scale 1.5 matches the walk sprite (32×1.5=48px), action frames are 48px so 48×1.5=72px displayed
    this.playerActionSprite = this.add.sprite(this.player.x, this.player.y, 'player-actions')
      .setDepth(this.player.y)
      .setScale(1.5)
      .setVisible(false);

    // Screen-space UI text
    const mono = (sz, col, bold) => ({ fontFamily: 'monospace', fontSize: sz, color: col, fontStyle: bold ? 'bold' : 'normal' });
    const ui   = (obj) => obj.setScrollFactor(0).setDepth(200);
    const W = this.W, H = this.H;

    this.levelText      = ui(this.add.text(10, 12, '', mono('13px', '#ffffff'))).setAlpha(0.85);
    this.xpText         = ui(this.add.text(10, 30, '', mono('13px', '#ffffff'))).setAlpha(0.55);
    this.selNameText    = ui(this.add.text(W / 2, 8, '', mono('13px', '#eeeeee', true))).setOrigin(0.5, 0).setVisible(false);
    this.selHpText      = ui(this.add.text(W / 2, 35, '', mono('10px', '#dddddd'))).setOrigin(0.5, 0.5).setVisible(false);
    this.versionText    = ui(this.add.text(8, H - 8, VERSION, mono('11px', '#ffffff'))).setAlpha(0.25).setOrigin(0, 1);
    this.attackBtnText  = ui(this.add.text(0, 0, 'ATTACK', mono('11px', '#ffffff', true))).setOrigin(0.5, 0.5);
    this.talkBtnText    = ui(this.add.text(0, 0, 'TALK',   mono('11px', '#ffffff', true))).setOrigin(0.5, 0.5).setVisible(false);
    this.swordCdText    = ui(this.add.text(0, 0, '', mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);
    this.bowCdText      = ui(this.add.text(0, 0, '', mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);
    this.potionCdText   = ui(this.add.text(0, 0, '', mono('11px', '#888888', true))).setOrigin(0.5, 1).setVisible(false);

    this.gameOverText = ui(this.add.text(W / 2, H / 2 - 24, 'Game Over', {
      fontFamily: 'sans-serif', fontSize: '56px', color: '#ff5555', fontStyle: 'bold',
    })).setOrigin(0.5, 0.5).setDepth(300).setVisible(false);
    this.gameOverSubText = ui(this.add.text(W / 2, H / 2 + 28, 'Reload the page to play again', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#999999',
    })).setOrigin(0.5, 0.5).setDepth(300).setVisible(false);

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
    // Walk/idle: 3 directional rows; left reuses right with flipX
    const dirs = [['down', 0], ['right', 6], ['up', 12]];

    for (const [sheet] of [['player'], ['skeleton']]) {
      for (const [dir, start] of dirs) {
        this.anims.create({
          key: `${sheet}-walk-${dir}`,
          frames: this.anims.generateFrameNumbers(sheet, { start, end: start + 5 }),
          frameRate: 8,
          repeat: -1,
        });
        this.anims.create({
          key: `${sheet}-idle-${dir}`,
          frames: [{ key: sheet, frame: start + 1 }],
          frameRate: 1,
        });
      }
    }

    // Sword swing (Player_Actions.png, 48×48, 2 cols × 12 rows)
    // Row 3 = right, Row 4 = down, Row 5 = up  (left mirrors right via flipX)
    for (const [dir, row] of [['right', 3], ['down', 4], ['up', 5]]) {
      this.anims.create({
        key: `player-sword-${dir}`,
        frames: this.anims.generateFrameNumbers('player-actions', { start: row * 2, end: row * 2 + 1 }),
        frameRate: 10,
        repeat: 0,
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

  playSpriteAnim(sprite, key) {
    if (!sprite.anims.currentAnim || sprite.anims.currentAnim.key !== key) sprite.play(key);
  }

  updateEntityAnim(sprite, sheet, facing, moving) {
    const flipX  = facing === 'left';
    const animDir = flipX ? 'right' : facing;
    const key    = moving ? `${sheet}-walk-${animDir}` : `${sheet}-idle-${animDir}`;
    this.playSpriteAnim(sprite, key);
    sprite.setFlipX(flipX);
  }

  // ── Init ───────────────────────────────────────────────────────────────

  initTrees() {
    let attempts = 0;
    while (this.trees.length < TREE_COUNT && attempts < 3000) {
      attempts++;
      const x = TREE_SIZE * 1.5 + Math.random() * (MAP_W - TREE_SIZE * 3);
      const y = TREE_SIZE * 1.5 + Math.random() * (MAP_H - TREE_SIZE * 3);
      if (Math.hypot(x - MAP_W / 2, y - MAP_H / 2) < TREE_MIN_DIST) continue;
      if (this.inRect(x, y, BEACH_ZONE) || this.inRect(x, y, FARM_ZONE)) continue;
      this.trees.push({ x, y });
      // Sprite: anchor at trunk base (bottom-center of collision box), canopy extends up
      this.add.image(x, y + TREE_SIZE / 2, 'tree')
        .setOrigin(0.5, 1)
        .setDepth(y + TREE_SIZE / 2)
        .setScale(1.2);
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
      name: 'Skeleton', facing: 'down',
      hp: ENEMY_MAX_HP, maxHp: ENEMY_MAX_HP,
      attackCd: 0, regenTick: ENEMY_REGEN_INTERVAL, combatDelay: 0,
    };
    this.enemies.push(enemy);

    const sprite = this.add.sprite(x, y, 'skeleton').setDepth(y).setScale(1.5);
    sprite.play('skeleton-idle-down');

    this.enemyTextMap.set(enemy.id, {
      sprite,
      hp: this.add.text(0, 0, '', {
        fontFamily: 'monospace', fontSize: '11px', color: '#dddddd',
      }).setOrigin(0.5, 1).setDepth(120),
    });
    return enemy;
  }

  addNpc(x, y, name, dialogue) {
    const npc = { id: this.nextId++, x, y, name, dialogue, talkTimer: 0 };
    this.npcs.push(npc);

    // NPC uses player spritesheet tinted gold to distinguish from the player
    const sprite = this.add.sprite(x, y, 'player').setDepth(y).setScale(1.5).setTint(0xffcc44);
    sprite.play('player-idle-down');

    this.npcTextMap.set(npc.id, {
      sprite,
      name: this.add.text(x, y - RADIUS - 4, name, {
        fontFamily: 'monospace', fontSize: '11px', color: '#ffe090',
      }).setOrigin(0.5, 1).setDepth(120),
      dialogue: this.add.text(x, y - RADIUS - 20, dialogue, {
        fontFamily: 'monospace', fontSize: '12px', color: '#222222',
        backgroundColor: '#f0eed7', padding: { x: 8, y: 4 },
      }).setOrigin(0.5, 1).setDepth(121).setVisible(false),
    });
    return npc;
  }

  removeEnemy(enemy) {
    const t = this.enemyTextMap.get(enemy.id);
    if (t) {
      t.hp.destroy();
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
        t.x - TREE_SIZE / 2, t.y - TREE_SIZE / 2, TREE_SIZE, TREE_SIZE,
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
    this.pDownPos = null;
    this.pMoved   = false;
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
    this.player.bowCd   = BOW_CD;
    enemy.state = 'chasing';
    this.arrows.push({
      x: this.player.x, y: this.player.y,
      vx: (dx / dist) * ARROW_SPEED, vy: (dy / dist) * ARROW_SPEED,
      lifetime: BOW_RANGE / ARROW_SPEED + 0.2,
    });
  }

  executeAttack() {
    const enemy = this.enemies.find(e => e.id === this.player.selectedEnemyId);
    if (!enemy) return;
    if (this.player.weapon === 'bow') this.shootArrow(enemy);
    else this.player.attackTarget = enemy.id;
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

    if (this.inRect(sx, sy, this.attackBtnRect())) { this.executeAttack(); return; }
    if (this.isNearNpc() && this.inRect(sx, sy, this.talkBtnRect())) { this.executeTalk(); return; }

    const wp = this.cameras.main.getWorldPoint(sx, sy);

    for (const enemy of this.enemies) {
      if (Math.hypot(wp.x - enemy.x, wp.y - enemy.y) <= RADIUS * 1.5) {
        this.player.selectedEnemyId = enemy.id;
        this.player.selectedNpcId   = null;
        this.player.attackTarget    = null;
        return;
      }
    }
    for (const npc of this.npcs) {
      if (Math.hypot(wp.x - npc.x, wp.y - npc.y) <= RADIUS * 1.5) {
        this.player.selectedNpcId   = npc.id;
        this.player.selectedEnemyId = null;
        this.player.attackTarget    = null;
        return;
      }
    }

    this.player.selectedEnemyId = null;
    this.player.selectedNpcId   = null;
    this.player.attackTarget    = null;
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
      const prevX = enemy.x, prevY = enemy.y;
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
        }
      } else if (enemy.state === 'returning') {
        const rdx = enemy.spawnX - enemy.x, rdy = enemy.spawnY - enemy.y;
        const d = Math.hypot(rdx, rdy);
        if (d < 2) {
          enemy.x = enemy.spawnX; enemy.y = enemy.spawnY; enemy.state = 'idle';
        } else {
          const step = Math.min(ENEMY_SPEED * dt, d);
          enemy.x += rdx / d * step;
          enemy.y += rdy / d * step;
          this.applyTreeCollisions(enemy);
        }
      }
      const movedX = enemy.x - prevX, movedY = enemy.y - prevY;
      if (Math.hypot(movedX, movedY) > 0.1) enemy.facing = this.getFacing(movedX, movedY);
    }

    player.attackCd  = Math.max(0, player.attackCd  - dt);
    player.potionCd  = Math.max(0, player.potionCd  - dt);
    player.bowCd     = Math.max(0, player.bowCd     - dt);
    player.swingTimer = Math.max(0, player.swingTimer - dt);
    for (const e of this.enemies) e.attackCd = Math.max(0, e.attackCd - dt);

    const deadIds = new Set();
    this.arrows = this.arrows.filter(a => {
      a.x += a.vx * dt; a.y += a.vy * dt; a.lifetime -= dt;
      if (a.lifetime <= 0) return false;
      for (const enemy of this.enemies) {
        if (enemy.hp <= 0) continue;
        if (Math.hypot(a.x - enemy.x, a.y - enemy.y) <= RADIUS) {
          enemy.hp = Math.max(0, enemy.hp - player.damage);
          if (enemy.hp === 0) { this.awardXp(); deadIds.add(enemy.id); }
          return false;
        }
      }
      return true;
    });

    let anyInRange = false;
    for (const e of this.enemies) e.inCombat = false;

    for (const enemy of this.enemies) {
      if (Math.hypot(player.x - enemy.x, player.y - enemy.y) > ATTACK_RANGE + RADIUS) continue;
      anyInRange     = true;
      enemy.inCombat = true;
      if (enemy.attackCd <= 0) {
        enemy.attackCd = ENEMY_ATTACK_CD;
        player.hp = Math.max(0, player.hp - ENEMY_ATTACK);
        if (player.hp === 0) { this.onGameOver(); return; }
      }
    }

    if (player.weapon === 'sword' && player.attackCd <= 0 && anyInRange) {
      player.attackCd   = PLAYER_ATTACK_CD;
      player.swingTimer = 0.25;
      for (const enemy of this.enemies) {
        if (Math.hypot(player.x - enemy.x, player.y - enemy.y) <= ATTACK_RANGE + RADIUS) {
          enemy.hp = Math.max(0, enemy.hp - player.damage);
          if (enemy.hp === 0) { this.awardXp(); deadIds.add(enemy.id); }
          else enemy.state = 'chasing';
        }
      }
    }

    for (const enemy of this.enemies) {
      if (deadIds.has(enemy.id)) this.removeEnemy(enemy);
    }
    this.enemies = this.enemies.filter(e => !deadIds.has(e.id));

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
    this.cameras.main.setScroll(
      Math.max(0, Math.min(MAP_W - W, this.player.x - W / 2)),
      Math.max(0, Math.min(MAP_H - H, this.player.y - H / 2)),
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

    // Attack range rings
    for (const e of this.enemies) {
      g.fillStyle(0xff5050, 0.07);
      g.fillCircle(e.x, e.y, ATTACK_RANGE);
      g.lineStyle(1, 0xff6464, 0.25);
      g.strokeCircle(e.x, e.y, ATTACK_RANGE);
    }
    g.fillStyle(0x44aaff, 0.07);
    g.fillCircle(this.player.x, this.player.y, ATTACK_RANGE);
    g.lineStyle(1, 0x44aaff, 0.25);
    g.strokeCircle(this.player.x, this.player.y, ATTACK_RANGE);

    // Selection rings
    const selEnemy = this.enemies.find(e => e.id === this.player.selectedEnemyId);
    if (selEnemy) {
      g.lineStyle(2, 0xffffff, 0.85);
      g.strokeCircle(selEnemy.x, selEnemy.y, RADIUS + 10);
    }
    const selNpc = this.npcs.find(n => n.id === this.player.selectedNpcId);
    if (selNpc) {
      g.lineStyle(2, 0xffdc50, 0.85);
      g.strokeCircle(selNpc.x, selNpc.y, RADIUS + 10);
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

    // Player
    const isMoving = Math.hypot(this.target.x - this.player.x, this.target.y - this.player.y) > 2;
    const swinging = this.player.swingTimer > 0 && this.player.weapon === 'sword';
    const depth    = this.player.y;

    this.playerSprite.setPosition(this.player.x, this.player.y).setDepth(depth).setVisible(!swinging);
    this.playerActionSprite.setPosition(this.player.x, this.player.y).setDepth(depth).setVisible(swinging);

    if (swinging) {
      const flipX  = this.player.facing === 'left';
      const dir    = flipX ? 'right' : (this.player.facing === 'down' || this.player.facing === 'up' ? this.player.facing : 'right');
      this.playSpriteAnim(this.playerActionSprite, `player-sword-${dir}`);
      this.playerActionSprite.setFlipX(flipX);
    } else {
      this.updateEntityAnim(this.playerSprite, 'player', this.player.facing, isMoving);
    }

    this.playerHpText.setPosition(this.player.x, this.player.y - SPRITE_H - 4);
    this.playerHpText.setText(`${this.player.hp}/${PLAYER_MAX_HP}`);

    // Enemies
    for (const enemy of this.enemies) {
      const t = this.enemyTextMap.get(enemy.id);
      if (!t) continue;
      t.sprite.setPosition(enemy.x, enemy.y).setDepth(enemy.y);
      const enemyMoving = enemy.state === 'chasing' || enemy.state === 'returning';
      this.updateEntityAnim(t.sprite, 'skeleton', enemy.facing, enemyMoving);
      t.hp.setPosition(enemy.x, enemy.y - SPRITE_H - 4).setText(`${enemy.hp}/${enemy.maxHp}`);
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

    this.levelText.setText(`Level ${this.player.level}   Damage ${this.player.damage}`);
    this.xpText.setText(`XP  ${this.player.xp} / 100`);
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
    const r      = this.attackBtnRect();
    const hasSel = this.player.selectedEnemyId !== null && this.enemies.some(e => e.id === this.player.selectedEnemyId);
    const active = hasSel && !(this.player.weapon === 'bow' && this.player.bowCd > 0);
    g.fillStyle(active ? 0xb42828 : 0x1c1c1c, active ? 0.90 : 0.82);
    g.fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(1.5, active ? 0xff8888 : 0x444444, 1);
    g.strokeRect(r.x, r.y, r.w, r.h);
    this.attackBtnText.setPosition(r.x + r.w / 2, r.y + r.h / 2);
    this.attackBtnText.setColor(active ? '#ffffff' : (hasSel ? '#aa6666' : '#444444'));
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
    this.talkBtnText.setColor(active ? '#ffffff' : (inRange ? '#668866' : '#444444'));
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
      const ts = TREE_SIZE * scale;
      g.fillRect(mm.x + t.x * scale - ts / 2, mm.y + t.y * scale - ts / 2, ts, ts);
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
  scene: GameScene,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
});
