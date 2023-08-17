import { ShaderData, ShaderMacro } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";

/**
 * Particle generator module.
 */
export abstract class ParticleGeneratorModule {
  /** Specifies whether the module is enabled or not. */
  enabled: boolean = false;

  protected _generator: ParticleGenerator;

  private _lastMacro: ShaderMacro;

  constructor(generator: ParticleGenerator) {
    this._generator = generator;
  }

  abstract cloneTo(destRotationOverLifetime: ParticleGeneratorModule);

  protected _enableModuleMacro(shaderData: ShaderData, enableMacro: ShaderMacro): void {
    const lastMacro = this._lastMacro;
    if (lastMacro !== enableMacro) {
      lastMacro && shaderData.disableMacro(lastMacro);
      enableMacro && shaderData.enableMacro(enableMacro);
      this._lastMacro = enableMacro;
    }
  }
}
