import { ShaderPass } from "./ShaderPass";

/**
 * Sub shader.
 */
export class SubShader {
  /** Disable batch. */
  disableBatch: boolean = false;

  private _replacementTags: Record<string, string>;
  private _passes: ShaderPass[] = [];

  /**
   * replacement tags.
   */
  get replacementTags(): Readonly<Record<string, string>> {
    return this._replacementTags;
  }

  /**
   * Sub shader passes.
   */
  get passes(): ReadonlyArray<ShaderPass> {
    return this._passes;
  }

  /**
   * Create a sub shader.
   * @param name - Name of the sub shader
   * @param passes - Sub shader passes
   */
  constructor(public readonly name: string, passes: ShaderPass[]) {
    const passCount = passes.length;
    if (passCount < 1) {
      throw " count must large than 0.";
    }
    for (let i = 0; i < passCount; i++) {
      this._passes.push(passes[i]);
    }
  }

  /**
   * Add a replacement tag.
   * @param name - Name of the tag
   * @param value - Value of the tag
   */
  addReplacementTag(name: string, value: string): void {
    const tags = this._replacementTags;
    if (tags[name]) {
      throw `Tag named "${name}" already exists.`;
    }

    tags[name] = value;
  }
}
