/**
 * Base class of data objects: wherever an instance is held — a component field, an array, a map —
 * cloning produces an independent deep copy instead of a shared reference. A subclass must be
 * constructible without arguments; a preset-less copy is created bare, then populated.
 */
export abstract class DataObject {}
