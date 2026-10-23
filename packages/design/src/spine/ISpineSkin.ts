/** Shared skin definitions. Mutations affect every instance using this skin. */
export interface ISpineSkin {
  readonly name: string;
  addSkin(skin: ISpineSkin): void;
}
