// ================================================================
// CONFIGURATION CONSTANTS
// ================================================================

// --- Scene ---
export const FOG_COLOR    = 0x555555;
export const FOG_DENSITY  = 0.015;

// --- Player ---
export const PLAYER_RADIUS        = 0.4;
export const PLAYER_HP_MAX        = 10;
export const EYE_HEIGHT_STAND     = 1.5;
export const EYE_HEIGHT_CROUCH    = 0.8;
export const EYE_HEIGHT_PRONE     = 0.3;

// --- Movement speeds ---
export const SPEED_STAND_WALK     = 5;
export const SPEED_STAND_SPRINT   = 8;
export const SPEED_CROUCH_WALK    = 3;
export const SPEED_CROUCH_SPRINT  = 6.5;
export const SPEED_PRONE          = 1.125;
export const SPEED_PRONE_SPRINT   = 3.0;
export const SPEED_PRONE_ROLL     = 4.0;
export const SLIDE_INITIAL_SPEED  = 16.0;
export const SLIDE_DURATION       = 0.75;
export const SLIDE_FRICTION       = 20;

// --- Machine gun heat ---
export const MG_HEAT_PER_SHOT     = 8;
export const MG_OVERHEAT_CAP      = 100;
export const MG_COOL_NORMAL       = 35;
export const MG_COOL_OVERHEAT     = 20;

// --- Sniper bolt action ---
export const SNIPER_PRE_BOLT_DELAY  = 250;   // ms before bolt animation begins
export const SNIPER_ZOOM_DEFAULT    = 4;
export const SNIPER_ZOOM_MIN        = 2;
export const SNIPER_ZOOM_MAX        = 10;

// --- Audio ---
export const AUDIO_PROXIMITY_RANGE  = 25;    // metres, positional audio cutoff
export const NEAR_MISS_THROTTLE     = 0.3;   // seconds between bullet-whiz sounds

// --- Turret ---
export const TURRET_MOUNT_RANGE          = 3.0;
export const TURRET_PLAYER_FIRE_COOLDOWN = 600;   // ms
export const TURRET_AI_FIRE_COOLDOWN     = 1800;  // ms
export const TURRET_EXPLOSION_RADIUS     = 4.0;
export const TURRET_EXPLOSION_DAMAGE     = 10;

// --- AI ---
export const AI_MOVE_SPEED          = 4.5;
export const AI_DAMAGE_FROM_AI      = 0.05;  // flat damage when AI shoots AI
export const AI_PEER_SEPARATION     = 0.8;   // metres, crowd-separation radius
