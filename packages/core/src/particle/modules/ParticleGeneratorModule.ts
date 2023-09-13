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

  constructor(generator: ParticleGenerator) {
    this._generator = generator;
  }

  protected _enableMacro(shaderData: ShaderData, lastEnableMacro: ShaderMacro, enableMacro: ShaderMacro): ShaderMacro {
    if (lastEnableMacro !== enableMacro) {
      lastEnableMacro && shaderData.disableMacro(lastEnableMacro);
      enableMacro && shaderData.enableMacro(enableMacro);
    }
    return enableMacro;
  }
}
