import { MixBlend } from "./Animation";
import { Skeleton } from "./Skeleton";

export interface Map<T> {
  [key: string]: T;
}

export class IntSet {
  array = new Array<number>();

  add(value: number): boolean {
    const contains = this.contains(value);
    this.array[value | 0] = value | 0;
    return !contains;
  }

  contains(value: number) {
    return this.array[value | 0] != undefined;
  }

  remove(value: number) {
    this.array[value | 0] = undefined;
  }

  clear() {
    this.array.length = 0;
  }
}

export interface Disposable {
  dispose(): void;
}

export interface Restorable {
  restore(): void;
}

export class Color {
  public static WHITE = new Color(1, 1, 1, 1);
  public static RED = new Color(1, 0, 0, 1);
  public static GREEN = new Color(0, 1, 0, 1);
  public static BLUE = new Color(0, 0, 1, 1);
  public static MAGENTA = new Color(1, 0, 1, 1);

  constructor(
    public r: number = 0,
    public g: number = 0,
    public b: number = 0,
    public a: number = 0
  ) {}

  set(r: number, g: number, b: number, a: number) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
    this.clamp();
    return this;
  }

  setFromColor(c: Color) {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    this.a = c.a;
    return this;
  }

  setFromString(hex: string) {
    hex = hex.charAt(0) == "#" ? hex.substr(1) : hex;
    this.r = parseInt(hex.substr(0, 2), 16) / 255.0;
    this.g = parseInt(hex.substr(2, 2), 16) / 255.0;
    this.b = parseInt(hex.substr(4, 2), 16) / 255.0;
    this.a = (hex.length != 8 ? 255 : parseInt(hex.substr(6, 2), 16)) / 255.0;
    return this;
  }

  add(r: number, g: number, b: number, a: number) {
    this.r += r;
    this.g += g;
    this.b += b;
    this.a += a;
    this.clamp();
    return this;
  }

  clamp() {
    if (this.r < 0) this.r = 0;
    else if (this.r > 1) this.r = 1;

    if (this.g < 0) this.g = 0;
    else if (this.g > 1) this.g = 1;

    if (this.b < 0) this.b = 0;
    else if (this.b > 1) this.b = 1;

    if (this.a < 0) this.a = 0;
    else if (this.a > 1) this.a = 1;
    return this;
  }

  static rgba8888ToColor(color: Color, value: number) {
    color.r = ((value & 0xff000000) >>> 24) / 255;
    color.g = ((value & 0x00ff0000) >>> 16) / 255;
    color.b = ((value & 0x0000ff00) >>> 8) / 255;
    color.a = (value & 0x000000ff) / 255;
  }

  static rgb888ToColor(color: Color, value: number) {
    color.r = ((value & 0x00ff0000) >>> 16) / 255;
    color.g = ((value & 0x0000ff00) >>> 8) / 255;
    color.b = (value & 0x000000ff) / 255;
  }
}

export class MathUtils {
  static PI = 3.1415927;
  static PI2 = MathUtils.PI * 2;
  static radiansToDegrees = 180 / MathUtils.PI;
  static radDeg = MathUtils.radiansToDegrees;
  static degreesToRadians = MathUtils.PI / 180;
  static degRad = MathUtils.degreesToRadians;

  static clamp(value: number, min: number, max: number) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }

  static cosDeg(degrees: number) {
    return Math.cos(degrees * MathUtils.degRad);
  }

  static sinDeg(degrees: number) {
    return Math.sin(degrees * MathUtils.degRad);
  }

  static signum(value: number): number {
    return value > 0 ? 1 : value < 0 ? -1 : 0;
  }

  static toInt(x: number) {
    return x > 0 ? Math.floor(x) : Math.ceil(x);
  }

  static cbrt(x: number) {
    const y = Math.pow(Math.abs(x), 1 / 3);
    return x < 0 ? -y : y;
  }

  static randomTriangular(min: number, max: number): number {
    return MathUtils.randomTriangularWith(min, max, (min + max) * 0.5);
  }

  static randomTriangularWith(min: number, max: number, mode: number): number {
    const u = Math.random();
    const d = max - min;
    if (u <= (mode - min) / d) return min + Math.sqrt(u * d * (mode - min));
    return max - Math.sqrt((1 - u) * d * (max - mode));
  }
}

export abstract class Interpolation {
  protected abstract applyInternal(a: number): number;
  apply(start: number, end: number, a: number): number {
    return start + (end - start) * this.applyInternal(a);
  }
}

export class Pow extends Interpolation {
  protected power = 2;

  constructor(power: number) {
    super();
    this.power = power;
  }

  applyInternal(a: number): number {
    if (a <= 0.5) return Math.pow(a * 2, this.power) / 2;
    return Math.pow((a - 1) * 2, this.power) / (this.power % 2 == 0 ? -2 : 2) + 1;
  }
}

export class PowOut extends Pow {
  constructor(power: number) {
    super(power);
  }

  override applyInternal(a: number): number {
    return Math.pow(a - 1, this.power) * (this.power % 2 == 0 ? -1 : 1) + 1;
  }
}

export class Utils {
  static SUPPORTS_TYPED_ARRAYS = typeof Float32Array !== "undefined";

  static arrayCopy<T>(
    source: ArrayLike<T>,
    sourceStart: number,
    dest: ArrayLike<T>,
    destStart: number,
    numElements: number
  ) {
    for (let i = sourceStart, j = destStart; i < sourceStart + numElements; i++, j++) {
      dest[j] = source[i];
    }
  }

  static setArraySize<T>(array: Array<T>, size: number, value: any = 0): Array<T> {
    const oldSize = array.length;
    if (oldSize == size) return array;
    array.length = size;
    if (oldSize < size) {
      for (let i = oldSize; i < size; i++) array[i] = value;
    }
    return array;
  }

  static ensureArrayCapacity<T>(array: Array<T>, size: number, value: any = 0): Array<T> {
    if (array.length >= size) return array;
    return Utils.setArraySize(array, size, value);
  }

  static newArray<T>(size: number, defaultValue: T): Array<T> {
    const array = new Array<T>(size);
    for (let i = 0; i < size; i++) array[i] = defaultValue;
    return array;
  }

  static newFloatArray(size: number): ArrayLike<number> {
    if (Utils.SUPPORTS_TYPED_ARRAYS) {
      return new Float32Array(size);
    } else {
      const array = new Array<number>(size);
      for (let i = 0; i < array.length; i++) array[i] = 0;
      return array;
    }
  }

  static newShortArray(size: number): ArrayLike<number> {
    if (Utils.SUPPORTS_TYPED_ARRAYS) {
      return new Int16Array(size);
    } else {
      const array = new Array<number>(size);
      for (let i = 0; i < array.length; i++) array[i] = 0;
      return array;
    }
  }

  static toFloatArray(array: Array<number>) {
    return Utils.SUPPORTS_TYPED_ARRAYS ? new Float32Array(array) : array;
  }

  static toSinglePrecision(value: number) {
    return Utils.SUPPORTS_TYPED_ARRAYS ? Math.fround(value) : value;
  }

  // This function is used to fix WebKit 602 specific issue described at http://esotericsoftware.com/forum/iOS-10-disappearing-graphics-10109
  static webkit602BugfixHelper(alpha: number, blend: MixBlend) {}

  static contains<T>(array: Array<T>, element: T, identity = true) {
    for (let i = 0; i < array.length; i++) {
      if (array[i] == element) return true;
    }
    return false;
  }
}

export class DebugUtils {
  static logBones(skeleton: Skeleton) {
    for (let i = 0; i < skeleton.bones.length; i++) {
      const bone = skeleton.bones[i];
      console.log(
        bone.data.name +
          ", " +
          bone.a +
          ", " +
          bone.b +
          ", " +
          bone.c +
          ", " +
          bone.d +
          ", " +
          bone.worldX +
          ", " +
          bone.worldY
      );
    }
  }
}

export class Pool<T> {
  private items = new Array<T>();
  private instantiator: () => T;

  constructor(instantiator: () => T) {
    this.instantiator = instantiator;
  }

  obtain() {
    return this.items.length > 0 ? this.items.pop() : this.instantiator();
  }

  free(item: T) {
    if ((item as any).reset) (item as any).reset();
    this.items.push(item);
  }

  freeAll(items: ArrayLike<T>) {
    for (let i = 0; i < items.length; i++) {
      this.free(items[i]);
    }
  }

  clear() {
    this.items.length = 0;
  }
}

export class Vector2 {
  constructor(
    public x = 0,
    public y = 0
  ) {}

  set(x: number, y: number): Vector2 {
    this.x = x;
    this.y = y;
    return this;
  }

  length() {
    const x = this.x;
    const y = this.y;
    return Math.sqrt(x * x + y * y);
  }

  normalize() {
    const len = this.length();
    if (len != 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }
}

export class TimeKeeper {
  maxDelta = 0.064;
  framesPerSecond = 0;
  delta = 0;
  totalTime = 0;

  private lastTime = Date.now() / 1000;
  private frameCount = 0;
  private frameTime = 0;

  update() {
    const now = Date.now() / 1000;
    this.delta = now - this.lastTime;
    this.frameTime += this.delta;
    this.totalTime += this.delta;
    if (this.delta > this.maxDelta) this.delta = this.maxDelta;
    this.lastTime = now;

    this.frameCount++;
    if (this.frameTime > 1) {
      this.framesPerSecond = this.frameCount / this.frameTime;
      this.frameTime = 0;
      this.frameCount = 0;
    }
  }
}

export interface ArrayLike<T> {
  length: number;
  [n: number]: T;
}

export class WindowedMean {
  values: Array<number>;
  addedValues = 0;
  lastValue = 0;
  mean = 0;
  dirty = true;

  constructor(windowSize: number = 32) {
    this.values = new Array<number>(windowSize);
  }

  hasEnoughData() {
    return this.addedValues >= this.values.length;
  }

  addValue(value: number) {
    if (this.addedValues < this.values.length) this.addedValues++;
    this.values[this.lastValue++] = value;
    if (this.lastValue > this.values.length - 1) this.lastValue = 0;
    this.dirty = true;
  }

  getMean() {
    if (this.hasEnoughData()) {
      if (this.dirty) {
        let mean = 0;
        for (let i = 0; i < this.values.length; i++) {
          mean += this.values[i];
        }
        this.mean = mean / this.values.length;
        this.dirty = false;
      }
      return this.mean;
    } else {
      return 0;
    }
  }
}
