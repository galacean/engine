import { Color } from "./Utils";

/** Stores the setup pose for a {@link Bone}. */
export class BoneData {
  /** The index of the bone in {@link Skeleton#getBones()}. */
  index: number;

  /** The name of the bone, which is unique across all bones in the skeleton. */
  name: string;

  /** @returns May be null. */
  parent: BoneData;

  /** The bone's length. */
  length: number;

  /** The local x translation. */
  x = 0;

  /** The local y translation. */
  y = 0;

  /** The local rotation. */
  rotation = 0;

  /** The local scaleX. */
  scaleX = 1;

  /** The local scaleY. */
  scaleY = 1;

  /** The local shearX. */
  shearX = 0;

  /** The local shearX. */
  shearY = 0;

  /** The transform mode for how parent world transforms affect this bone. */
  transformMode = TransformMode.Normal;

  /** When true, {@link Skeleton#updateWorldTransform()} only updates this bone if the {@link Skeleton#skin} contains this
   * bone.
   * @see Skin#bones */
  skinRequired = false;

  /** The color of the bone as it was in Spine. Available only when nonessential data was exported. Bones are not usually
   * rendered at runtime. */
  color = new Color();

  constructor(index: number, name: string, parent: BoneData) {
    if (index < 0) throw new Error("index must be >= 0.");
    if (name == null) throw new Error("name cannot be null.");
    this.index = index;
    this.name = name;
    this.parent = parent;
  }
}

/** Determines how a bone inherits world transforms from parent bones. */
export enum TransformMode {
  Normal,
  OnlyTranslation,
  NoRotationOrReflection,
  NoScale,
  NoScaleOrReflection
}
