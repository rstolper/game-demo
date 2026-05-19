import {
  LPC_COLS_STD, LPC_COLS_BOW,
  LPC_WALK_ROWS, LPC_THRUST_ROWS, LPC_SLASH_ROWS, LPC_SHOOT_ROWS, LPC_HURT_ROW,
  LPC_WALK_FRAMES, LPC_THRUST_FRAMES, LPC_SLASH_FRAMES, LPC_SHOOT_FRAMES, LPC_HURT_FRAMES,
} from './constants.js';

const DIRS = ['up', 'left', 'down', 'right'];

const toFrames = (sheet, rowStart, indices) =>
  indices.map(i => ({ key: sheet, frame: rowStart + i }));

export function createAnimations(scene) {
  // Walk + idle for all standard 13-col sheets
  for (const sheet of ['player-base', 'player-dagger', 'weirdo', 'jimmy']) {
    for (const dir of DIRS) {
      const rowStart = LPC_WALK_ROWS[dir] * LPC_COLS_STD;
      scene.anims.create({ key: `${sheet}-walk-${dir}`, frames: toFrames(sheet, rowStart, LPC_WALK_FRAMES), frameRate: 8, repeat: -1 });
      scene.anims.create({ key: `${sheet}-idle-${dir}`, frames: [{ key: sheet, frame: rowStart }], frameRate: 1 });
    }
  }

  // Weirdo hurt/death
  scene.anims.create({ key: 'weirdo-hurt', frames: toFrames('weirdo', LPC_HURT_ROW * LPC_COLS_STD, LPC_HURT_FRAMES), frameRate: 10, repeat: 0 });

  // Weirdo thrust (attack)
  for (const dir of DIRS) {
    const rowStart = LPC_THRUST_ROWS[dir] * LPC_COLS_STD;
    scene.anims.create({ key: `weirdo-thrust-${dir}`, frames: toFrames('weirdo', rowStart, LPC_THRUST_FRAMES), frameRate: 10, repeat: 0 });
  }

  // Player dagger slash
  for (const dir of DIRS) {
    const rowStart = LPC_SLASH_ROWS[dir] * LPC_COLS_STD;
    scene.anims.create({ key: `player-dagger-slash-${dir}`, frames: toFrames('player-dagger', rowStart, LPC_SLASH_FRAMES), frameRate: 10, repeat: 0 });
  }

  // Player bow (18-col sheet): walk + idle + shoot
  for (const dir of DIRS) {
    const walkStart  = LPC_WALK_ROWS[dir]  * LPC_COLS_BOW;
    const shootStart = LPC_SHOOT_ROWS[dir] * LPC_COLS_BOW;
    scene.anims.create({ key: `player-bow-walk-${dir}`,  frames: toFrames('player-bow', walkStart,  LPC_WALK_FRAMES),  frameRate: 8,  repeat: -1 });
    scene.anims.create({ key: `player-bow-idle-${dir}`,  frames: [{ key: 'player-bow', frame: walkStart }],            frameRate: 1 });
    scene.anims.create({ key: `player-bow-shoot-${dir}`, frames: toFrames('player-bow', shootStart, LPC_SHOOT_FRAMES), frameRate: 10, repeat: 0 });
  }
}
