export interface ISpineBoneData {
  readonly index: number;
  readonly name: string;
  readonly parent: ISpineBoneData | null;
  length: number;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  shearX: number;
  shearY: number;
}
