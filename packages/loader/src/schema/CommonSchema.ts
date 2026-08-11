export type Vec3Tuple = [number, number, number];
export type Vec4Tuple = [number, number, number, number];

export interface RefItem {
  /** Referenced asset path, normally a virtualPath registered by the project. */
  url: string;
  key?: string;
}

/** path[0] = flat index into top-level entities[]; subsequent indices descend via children. */
export type EntityRef = number[];

export interface ComponentRef {
  entity: EntityRef;
  type: string;
  index: number;
}

/** Reference to a registered runtime class constructor. */
export interface ClassRef {
  $class: string;
}

/** Registered runtime value with optional recursively-resolved constructor arguments. */
export interface TypeValue {
  $type: string;
  $args?: unknown[];
  [key: string]: unknown;
}

/** JSON-safe encoding for positive infinity. */
export interface SpecialNumberValue {
  $number: "Infinity";
}

export interface SignalListener {
  target: { $component: ComponentRef };
  methodName: string;
  args?: unknown[];
}

export interface CallSpec {
  /** Optional property path from the mutation root to the method owner. */
  target?: string[];
  method: string;
  args?: unknown[];
  result?: MutationBlock;
}

export interface MutationBlock {
  props?: Record<string, unknown>;
  calls?: CallSpec[];
}
