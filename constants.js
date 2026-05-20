export const VERSION = '2026-05-19 18:00';

// World
export const RADIUS           = 18;
export const ATTACK_RANGE     = RADIUS * 4;
export const SPEED            = 300;
export const MAP_W            = 3008;
export const MAP_H            = 3008;

// Player
export const PLAYER_MAX_HP    = 100;
export const PLAYER_ATTACK    = 5;
export const PLAYER_ATTACK_CD = 1.0;
export const REGEN_INTERVAL       = 0.3;
export const REGEN_COMBAT_DELAY   = 3.0;
export const POTION_HEAL      = 50;
export const POTION_CD        = 20;
export const ATTACK_MODE_GRACE = 3.0;

// Bow
export const BOW_RANGE   = 900;
export const BOW_CD      = 1.0;   // cooldown after shoot animation completes
export const ARROW_SPEED = 500;
// Shoot animation: 13 frames, frame 8 lingers at 220ms, all others 70ms → 1.06s total
// Arrow releases at frame 9: time remaining = 4 frames × 70ms = 0.28s
export const BOW_SHOOT_DURATION         = 1.06;
export const BOW_ARROW_RELEASE_THRESHOLD = 0.28;

// Enemy
export const ENEMY_SPEED           = 120;
export const ENEMY_MAX_HP          = 20;
export const ENEMY_ATTACK          = 5;
export const ENEMY_ATTACK_CD       = 1.0;
export const ENEMY_REGEN_INTERVAL  = 0.5;
export const ENEMY_SPAWN_MIN_DIST  = 200;
export const SPAWN_LEASH           = 700;
export const AGGRO_RADIUS          = ATTACK_RANGE * 5;

// Enemy wander
export const WANDER_RADIUS       = 180;
export const WANDER_INTERVAL_MIN = 3;
export const WANDER_INTERVAL_MAX = 8;
export const WANDER_SPEED_MULT   = 0.45;
export const WANDER_TIMEOUT      = 5.0;

// Input
export const TAP_MAX_MS = 300;

// NPC
export const TALK_RADIUS   = RADIUS * 6;  // conversation zone; leaving clears bubbles

// Map / tiles
export const TREE_TILE_SIZE = 32;
export const TRUNK_TILE_IDS = new Set([441, 442, 443, 473, 474, 475, 569, 570, 571, 1023]);

// LPC sprite sheets
export const SPRITE_W      = 64;
export const SPRITE_H      = 64;

export const LPC_WALK_FRAMES   = [0, 1, 2, 3, 4, 5, 6, 7, 8];
export const LPC_THRUST_FRAMES = [0, 1, 2, 3, 4, 5, 6, 7];
export const LPC_SLASH_FRAMES  = [0, 1, 2, 3, 4, 5];
export const LPC_SHOOT_FRAMES  = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const LPC_HURT_FRAMES   = [0, 1, 2, 3, 4, 5];

// Combat timing — damage fires when timer crosses these thresholds (counting down)
export const PLAYER_SWING_HIT_THRESHOLD = 4 / 10;                              // 0.4s into slash
export const ENEMY_HIT_THRESHOLD        = (LPC_THRUST_FRAMES.length - 6) / 10; // after frame 5

// UI layout
export const POTION_SIZE    = 52;
export const WEAPON_SIZE    = 52;
export const WEAPON_MARGIN  = 12;
export const ATTACK_BTN_H   = 28;
export const TALK_BTN_H     = 28;
export const MINIMAP_SIZE   = 130;
export const MINIMAP_MARGIN = 10;

// Rendering — world-space entity overlay
export const ENTITY_HP_BAR_W      = 32;
export const ENTITY_HP_BAR_H      = 4;
export const ENTITY_HP_BAR_OFFSET = SPRITE_H + 6; // px above sprite feet

// Bow walk sprite (128px) has transparent padding below the character's feet.
// This offset pushes it down so feet align with player.y like all other sprites.
export const BOW_WALK_Y_OFFSET = 32;

// Depth stack
export const DEPTH_LAND        = 0;
export const DEPTH_TRUNKS      = 1;
export const DEPTH_CANOPY      = 3100;
export const DEPTH_WORLD_GFX   = 3150;
export const DEPTH_WORLD_TEXT  = 3200;
export const DEPTH_FLOAT_TEXT  = 3300;
export const DEPTH_HUD         = 5000;
export const DEPTH_GAME_OVER   = 6000;
