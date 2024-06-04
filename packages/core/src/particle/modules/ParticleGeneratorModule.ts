import { ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";

/**
 * Particle generator module.
 */
export abstract class ParticleGeneratorModule {
  _enabled: boolean = false;

  /**
   * Specifies whether the module is enabled or not.
   */
  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(value: boolean) {
    this._enabled = value;
  }

  @ignoreClone
  protected _generator: ParticleGenerator;

  /**
   * @internal
   */
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
