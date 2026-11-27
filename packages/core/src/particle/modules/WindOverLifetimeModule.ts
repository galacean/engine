import { Vector3 } from "@galacean/engine-math";
import { ShaderData, ShaderMacro, ShaderProperty } from "../../shader";
import { ParticleGenerator } from "../ParticleGenerator";
import { ParticleGeneratorModule } from "./ParticleGeneratorModule";

/**
 * Relaxes particle velocity toward a world-space wind velocity over time.
 *
 * @remarks
 * The module is simulated with WebGL2 transform feedback. `responseTime` is measured in particle
 * simulation seconds, `targetVelocity` in world units per simulation second, and `influence`
 * selects how strongly each world axis follows the wind. When combined with Limit Velocity over
 * Lifetime, wind owns the continuous displacement for the current step and the limit owns the
 * stored endpoint velocity used by the next step.
 */
export class WindOverLifetimeModule extends ParticleGeneratorModule {
  private static readonly _enabledMacro = ShaderMacro.getByName("RENDERER_WOL_MODULE_ENABLED");
  private static readonly _targetVelocityProperty = ShaderProperty.getByName("renderer_WOLTargetVelocity");
  private static readonly _influenceProperty = ShaderProperty.getByName("renderer_WOLInfluence");
  private static readonly _responseTimeProperty = ShaderProperty.getByName("renderer_WOLResponseTime");
  private static readonly _wrapCenterProperty = ShaderProperty.getByName("renderer_WOLWrapCenter");
  private static readonly _wrapSizeProperty = ShaderProperty.getByName("renderer_WOLWrapSize");

  private readonly _targetVelocity = new Vector3();
  private readonly _influence = new Vector3(1, 1, 1);
  private readonly _wrapCenter = new Vector3();
  private readonly _wrapSize = new Vector3();
  private _responseTime = 0.35;
  private _enabledMacro: ShaderMacro | null;

  /** Target air velocity in world space. */
  get targetVelocity(): Vector3 {
    return this._targetVelocity;
  }

  set targetVelocity(value: Vector3) {
    if (value !== this._targetVelocity) {
      this._targetVelocity.copyFrom(value);
    }
  }

  /** Per-world-axis response-rate weight. Zero disables an axis; values are clamped to [0, 1]. */
  get influence(): Vector3 {
    return this._influence;
  }

  set influence(value: Vector3) {
    if (value !== this._influence) {
      this._influence.copyFrom(value);
    }
  }

  /** Center of the optional world-space periodic volume. */
  get wrapCenter(): Vector3 {
    return this._wrapCenter;
  }

  set wrapCenter(value: Vector3) {
    if (value !== this._wrapCenter) {
      this._wrapCenter.copyFrom(value);
    }
  }

  /** Per-axis size of the optional world-space periodic volume. Non-positive axes do not wrap. */
  get wrapSize(): Vector3 {
    return this._wrapSize;
  }

  set wrapSize(value: Vector3) {
    if (value !== this._wrapSize) {
      this._wrapSize.copyFrom(value);
    }
  }

  /** Particle-simulation time constant; at one time constant velocity has closed 63.2% of the gap. */
  get responseTime(): number {
    return this._responseTime;
  }

  set responseTime(value: number) {
    this._responseTime = value;
  }

  override get enabled(): boolean {
    return this._enabled;
  }

  override set enabled(value: boolean) {
    if (value !== this._enabled) {
      this._enabled = value;
      this._generator._setTransformFeedback();
      this._generator._onWindBoundsChanged();
    }
  }

  constructor(generator: ParticleGenerator) {
    super(generator);
    const onBoundsChanged = (): void => this._generator._onWindBoundsChanged();
    // @ts-ignore Vector change callbacks are an internal engine data-binding hook.
    this._targetVelocity._onValueChanged = onBoundsChanged;
    // @ts-ignore Vector change callbacks are an internal engine data-binding hook.
    this._influence._onValueChanged = onBoundsChanged;
    // @ts-ignore Vector change callbacks are an internal engine data-binding hook.
    this._wrapCenter._onValueChanged = onBoundsChanged;
    // @ts-ignore Vector change callbacks are an internal engine data-binding hook.
    this._wrapSize._onValueChanged = onBoundsChanged;
  }

  /** @internal */
  _updateShaderData(shaderData: ShaderData): void {
    const enabledMacro = this.enabled ? WindOverLifetimeModule._enabledMacro : null;
    if (enabledMacro) {
      shaderData.setVector3(WindOverLifetimeModule._targetVelocityProperty, this._targetVelocity);
      shaderData.setVector3(WindOverLifetimeModule._influenceProperty, this._influence);
      shaderData.setFloat(WindOverLifetimeModule._responseTimeProperty, Math.max(0, this._responseTime));
      shaderData.setVector3(WindOverLifetimeModule._wrapCenterProperty, this._wrapCenter);
      shaderData.setVector3(WindOverLifetimeModule._wrapSizeProperty, this._wrapSize);
    }
    this._enabledMacro = this._enableMacro(shaderData, this._enabledMacro, enabledMacro);
  }
}
