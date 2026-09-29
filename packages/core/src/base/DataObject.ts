import { CloneMode, registerDefaultCloneMode } from "../clone/CloneDecorators";

/**
 * Base class for objects whose own enumerable string-keyed properties are structurally cloned by default.
 * Subclasses must support argument-less construction when no compatible preset exists.
 */
export abstract class DataObject {}

registerDefaultCloneMode(DataObject, CloneMode.Deep);
