/**
 * Base class of value-semantic math types (vectors, matrices, quaternion, color, rect, bounds…).
 *
 * Carries no state or behavior; it exists so family-wide traits can be declared once on the
 * prototype chain — e.g. the engine registers the default clone mode (deep) on it for all math
 * value types in a single place.
 */
export abstract class MathValue {}
