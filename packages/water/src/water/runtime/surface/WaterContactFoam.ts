/** Constants shared by the contact-foam shader generators. */
export const WATER_CONTACT_FOAM_HASH_MODULUS = 289;
export const WATER_CONTACT_FOAM_HASH_MULTIPLIER = 34;
export const WATER_CONTACT_FOAM_HASH_OFFSET = 1;
export const WATER_CONTACT_FOAM_HASH_SCALE_X = 0.1031;
export const WATER_CONTACT_FOAM_HASH_SCALE_Y = 0.11369;
export const WATER_CONTACT_FOAM_PHASE_PERIOD = WATER_CONTACT_FOAM_HASH_MODULUS;
export const WATER_CONTACT_FOAM_MAX_F1_SQUARED = 2;
export const WATER_CONTACT_FOAM_FINITE_MAGNITUDE_LIMIT = 1e20;

export type WaterContactFoamOctaveCount = 1 | 2 | 3;
