import { IBaseSymbol } from "../common/IBaseSymbol";

export class ShaderSourceSymbol implements IBaseSymbol {
  constructor(
    public readonly ident: string,
    public readonly type: number,
    public readonly value?: any
  ) {}

  equal(other: ShaderSourceSymbol): boolean {
    return this.type === other.type;
  }
}
