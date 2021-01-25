/**
 * Blend factor.
 * @remarks defines which function is used for blending pixel arithmetic
 */
export enum BlendFactor {
  /** (0, 0, 0, 0)*/
  Zero,
  /** (1, 1, 1, 1)*/
  One,
  /** (Rs, Gs, Bs, As) */
  SourceColor,
  /** (1 - Rs, 1 - Gs, 1 - Bs, 1 - As)*/
  OneMinusSourceColor,
  /** (Rd, Gd, Bd, Ad)*/
  DestinationColor,
  /** (1 - Rd, 1 - Gd, 1 - Bd, 1 - Ad)*/
  OneMinusDestinationColor,
  /** (As, As, As, As)*/
  SourceAlpha,
  /** (1 - As, 1 - As, 1 - As, 1 - As)*/
  OneMinusSourceAlpha,
  /** (Ad, Ad, Ad, Ad)*/
  DestinationAlpha,
  /** (1 - Ad, 1 - Ad, 1 - Ad, 1 - Ad)*/
  OneMinusDestinationAlpha,
  /** (min(As, 1 - Ad), min(As, 1 - Ad), min(As, 1 - Ad), 10)*/
  SourceAlphaSaturate,
  /** (Rc, Gc, Bc, Ac)*/
  BlendColor,
  /** (1 - Rc, 1 - Gc, 1 - Bc, 1 - Ac)*/
  OneMinusBlendColor
}
