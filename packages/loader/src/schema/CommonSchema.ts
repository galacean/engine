export type Vec3Tuple = [number, number, number];
export type Vec4Tuple = [number, number, number, number];

export interface RefItem {
  url: string;
  key?: string;
}

export interface AssetRef {
  $ref: number;
}

export interface ComponentRef {
  entity: number;
  type: string;
  index: number;
}

export interface SignalListener {
  target: { $component: ComponentRef };
  methodName: string;
  args?: unknown[];
}

export interface CallSpec {
  method: string;
  args?: unknown[];
  result?: MutationBlock;
}

export interface MutationBlock {
  props?: Record<string, unknown>;
  calls?: CallSpec[];
}
