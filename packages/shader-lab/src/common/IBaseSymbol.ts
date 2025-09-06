export interface IBaseSymbol {
  isInMacroBranch: boolean;

  readonly ident: string;

  equal(other: IBaseSymbol): boolean;
}
