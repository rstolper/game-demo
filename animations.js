import {
  LPC_WALK_FRAMES, LPC_THRUST_FRAMES, LPC_SLASH_FRAMES, LPC_SHOOT_FRAMES, LPC_HURT_FRAMES,
} from './constants.js';

// Per-sheet format: each file has 4 rows in order up/left/down/right (hurt is 1 row)
const DIR_ROW = { up: 0, left: 1, down: 2, right: 3 };
const COLS_64     = 13;
const COLS_BOW_WALK = 9;

const toFrames = (sheet, rowStart, indices) =>
  indices.map(i => ({ key: sheet, frame: rowStart + i }));

export function createAnimations(scene) {
  // Weirdo
  scene.anims.create({ key: 'weirdo-hurt', frames: LPC_HURT_FRAMES.map(i => ({ key: 'weirdo-hurt', frame: i })), frameRate: 10, repeat: 0 });
  for (const [dir, row] of Object.entries(DIR_ROW)) {
    const r = row * COLS_64;
    scene.anims.create({ key: `weirdo-walk-${dir}`,   frames: toFrames('weirdo-walk',   r, LPC_WALK_FRAMES),   frameRate: 8,  repeat: -1 });
    scene.anims.create({ key: `weirdo-idle-${dir}`,   frames: [{ key: 'weirdo-walk', frame: r }],              frameRate: 1              });
    scene.anims.create({ key: `weirdo-thrust-${dir}`, frames: toFrames('weirdo-thrust', r, LPC_THRUST_FRAMES), frameRate: 10, repeat: 0  });
  }

  // Jimmy NPC
  for (const [dir, row] of Object.entries(DIR_ROW)) {
    const r = row * COLS_64;
    scene.anims.create({ key: `jimmy-walk-${dir}`, frames: toFrames('jimmy-walk', r, LPC_WALK_FRAMES), frameRate: 8, repeat: -1 });
    scene.anims.create({ key: `jimmy-idle-${dir}`, frames: [{ key: 'jimmy-walk', frame: r }], frameRate: 1 });
  }

  // Player hurt/death (single-row sheet, no directional variants)
  scene.anims.create({ key: 'player-hurt', frames: LPC_HURT_FRAMES.map(i => ({ key: 'player-unarmed-hurt', frame: i })), frameRate: 10, repeat: 0 });

  // Player — each animation is its own sheet with rows: 0=up 1=left 2=down 3=right
  for (const [dir, row] of Object.entries(DIR_ROW)) {
    const r64 = row * COLS_64;

    // Unarmed walk/idle (sheet key: 'player-unarmed-walk')
    scene.anims.create({ key: `player-walk-${dir}`, frames: toFrames('player-unarmed-walk', r64, LPC_WALK_FRAMES), frameRate: 8, repeat: -1 });
    scene.anims.create({ key: `player-idle-${dir}`, frames: [{ key: 'player-unarmed-walk', frame: r64 }], frameRate: 1 });

    // Dagger walk/idle and slash
    scene.anims.create({ key: `dagger-walk-${dir}`, frames: toFrames('player-dagger-walk', r64, LPC_WALK_FRAMES), frameRate: 8, repeat: -1 });
    scene.anims.create({ key: `dagger-idle-${dir}`, frames: [{ key: 'player-dagger-walk', frame: r64 }], frameRate: 1 });
    scene.anims.create({ key: `dagger-slash-${dir}`, frames: toFrames('player-dagger-slash', r64, LPC_SLASH_FRAMES), frameRate: 10, repeat: 0 });

    // Bow walk/idle (128×128, 9 cols) and shoot (64×64, 13 cols)
    const rBow = row * COLS_BOW_WALK;
    scene.anims.create({ key: `bow-walk-${dir}`, frames: LPC_WALK_FRAMES.map(i => ({ key: 'player-bow-walk', frame: rBow + i })), frameRate: 8, repeat: -1 });
    scene.anims.create({ key: `bow-idle-${dir}`, frames: [{ key: 'player-bow-walk', frame: rBow }], frameRate: 1 });
    // Frame 8 lingers (bow fully drawn); all others 70ms. Total = 12×70ms + 220ms = 1.06s.
    scene.anims.create({ key: `bow-shoot-${dir}`, repeat: 0, frames:
      LPC_SHOOT_FRAMES.map((_, i) => ({ key: 'player-bow-shoot', frame: r64 + i, duration: i === 8 ? 220 : 70 })) });
  }
}
