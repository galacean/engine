import { ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";

/**
 * Particle generator module.
 */
export abstract class ParticleGeneratorModule {
  /** Specifies whether the module is enabled or not. */
  enabled: boolean = false;

  @ignoreClone
  protected _generator: ParticleGenerator;

  private _lastMacro: ShaderMacro;

  constructor(generator: ParticleGenerator) {
    this._generator = generator;
  }

  protected _enableModuleMacro(shaderData: ShaderData, enableMacro: ShaderMacro): void {
    const lastMacro = this._lastMacro;
    if (lastMacro !== enableMacro) {
      lastMacro && shaderData.disableMacro(lastMacro);
      enableMacro && shaderData.enableMacro(enableMacro);
      this._lastMacro = enableMacro;
    }
  }

  protected _enableModuleMacroX(
    shaderData: ShaderData,
    lastEnableMacro: ShaderMacro,
    enableMacro: ShaderMacro
  ): ShaderMacro {
    if (lastEnableMacro !== enableMacro) {
      lastEnableMacro && shaderData.disableMacro(lastEnableMacro);
      enableMacro && shaderData.enableMacro(enableMacro);
    }
    return enableMacro;
  }
}
