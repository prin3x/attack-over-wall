// World is measured in "game pixels": 320x180, y goes UP, origin bottom-left.
export const W = 320;
export const H = 180;
export const GROUND_Y = 28;

export const DT = 1 / 60;           // fixed simulation step
export const GRAVITY = 200;         // px/s^2
export const MAX_SPEED = 300;       // px/s at 100% power
export const WIND_ACCEL = 5;        // px/s^2 per wind unit (wind is -10..10)
export const MAX_WIND = 10;

export const ANGLE_MIN = 5;
export const ANGLE_MAX = 85;
export const POWER_RATE = 90;       // power bar % per second

export const MAX_HP = 100;
export const DMG_CRIT = 30;
export const DMG_HIT = 20;
export const SPLASH_RADIUS = 20;
export const SPLASH_MAX = 12;

// The fence in the middle (collision box).
export const WALL = { x0: 152, x1: 168, y0: GROUND_Y, y1: GROUND_Y + 56 };

export const PLAYER_X = [36, 284];
export const NAMES = ['BISCUIT', 'MISO'];

// Offsets relative to a player's x (multiplied by facing) and GROUND_Y.
export const LAUNCH = { dx: 9, dy: 14 };
export const HEAD = { dx: 4, dy: 14, r: 5.5 };
export const BODY = { dx: -1, dy: 8, r: 8 };
