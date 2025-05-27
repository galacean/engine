import { ignoreClone } from "../../clone/CloneManager";
import { ShaderData, ShaderMacro } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleCompositeCurve } from "./ParticleCompositeCurve";

/**
 * Particle generator module.
 */
export abstract class ParticleGeneratorModule {
  @ignoreClone
  protected _generator: ParticleGenerator;

  protected _enabled: boolean = false;

  /**
   * Specifies whether the module is enabled or not.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
  }

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

  protected _onCompositeCurveChange(lastValue: ParticleCompositeCurve, value: ParticleCompositeCurve): void {
    const renderer = this._generator._renderer;
    lastValue?._unRegisterOnValueChanged(renderer._onGeneratorParamsChanged);
    value?._registerOnValueChanged(renderer._onGeneratorParamsChanged);
    renderer._onGeneratorParamsChanged();
  }
}
