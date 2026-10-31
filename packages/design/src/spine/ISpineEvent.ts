export interface ISpineEvent {
  readonly data: { readonly name: string };
  readonly time: number;
  intValue: number;
  floatValue: number;
  stringValue: string | null;
}
