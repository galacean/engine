/**
 * @internal
 * Base class marking engine data objects: wherever an instance is held — a component field,
 * an array, a map — cloning produces an independent deep copy instead of a shared reference
 * (the clone gate recognizes the family via `instanceof`). A subclass should stay constructible
 * without arguments: the clone system creates preset-less copies bare and then populates every
 * field. Exported only so sibling engine packages (ui) can extend it — not public API for now.
 */
export abstract class DataObject {}
