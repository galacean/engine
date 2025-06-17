export interface IBaseSymbol {
  readonly ident: string;

  equal(other: IBaseSymbol): boolean;
}
