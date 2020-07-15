type array2<T> = { 0: T; 1: T };
type array3<T> = { 0: T; 1: T; 2: T };
type array4<T> = { 0: T; 1: T; 2: T; 3: T };
type array5<T> = { 0: T; 1: T; 2: T; 3: T; 4: T };
type array9<T> = { 0: T; 1: T; 2: T; 3: T; 4: T; 5: T; 6: T; 7: T; 8: T };
type array16<T> = {
  0: T;
  1: T;
  2: T;
  3: T;
  4: T;
  5: T;
  6: T;
  7: T;
  8: T;
  9: T;
  10: T;
  11: T;
  12: T;
  13: T;
  14: T;
  15: T;
};
type TypedArray = Array<number> | Float32Array;

/**等math全部重构完后，| 改成 &*/
export type vec2Type = TypedArray | array2<number>;
export type vec3Type = TypedArray | array3<number>;
export type vec4Type = TypedArray | array4<number>;
export type quatType = TypedArray | array4<number>;
export type mat2Type = TypedArray | array4<number>;
export type mat2dType = TypedArray | array5<number>;
export type mat3Type = TypedArray | array9<number>;
export type mat4Type = TypedArray | array16<number>;

export type Canvas = object;
export type BasicSceneRenderer = any;
export type WebGLRenderer = any;
