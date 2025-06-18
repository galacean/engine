import { IBaseSymbol } from "../common/IBaseSymbol";

export class ShaderSourceSymbol implements IBaseSymbol {
  constructor(
    public ident: string,
    public type: number,
    public value?: any
  ) {}

  set(ident: string, type: number, value?: any): void {
    this.ident = ident;
    this.type = type;
    this.value = value;
  }

  equal(other: ShaderSourceSymbol): boolean {
    return this.type === other.type;
  }
}
