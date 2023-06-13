import {
  ColorOverLifetimeModule,
  FrameOverTime,
  SizeGradient,
  ColorGradient,
  ParticleCurve,
  SizeOverLifetimeModule,
  StartFrame,
  TextureSheetAnimationModule
} from "./module";
import { Color, MathUtil, Rand, Vector3, Vector4 } from "@oasis-engine/math";
import { ParticleRenderer } from "./ParticleRenderer";
import { ParticleCurveMode } from "./enum";

/**
 *  @internal
 */
export class ParticleData {
  private static _tempVector30: Vector3 = new Vector3();

  static startLifeTime: number;
  static startColor = new Color();
  static startSize = new Vector3();
  static startRotation = new Vector3();
  static startUVInfo = new Vector4();

  /**
   * @internal
   */
  static create(particleRender: ParticleRenderer): void {
    const particleMesh = particleRender.particleMesh;
    const autoRandomSeed: boolean = particleMesh.autoRandomSeed;
    const rand: Rand = particleMesh._rand;
    const randomSeeds: Uint32Array = particleMesh._randomSeeds;

    //StartColor
    switch (particleMesh.startColorType) {
      case 0:
        const constantStartColor: Color = particleMesh.startColorConstant;
        ParticleData.startColor.r = constantStartColor.r;
        ParticleData.startColor.g = constantStartColor.g;
        ParticleData.startColor.b = constantStartColor.b;
        ParticleData.startColor.a = constantStartColor.a;
        break;
      case 2:
        if (autoRandomSeed) {
          Color.lerp(
            particleMesh.startColorConstantMin,
            particleMesh.startColorConstantMax,
            Math.random(),
            ParticleData.startColor
          );
        } else {
          rand.seed = randomSeeds[3];
          Color.lerp(
            particleMesh.startColorConstantMin,
            particleMesh.startColorConstantMax,
            rand.getFloat(),
            ParticleData.startColor
          );
          randomSeeds[3] = rand.seed;
        }
        break;
    }
    const colorOverLifetime: ColorOverLifetimeModule = particleMesh.colorOverLifetime;
    if (colorOverLifetime && colorOverLifetime.enable) {
      const color: ColorGradient = colorOverLifetime.color;
      switch (color.mode) {
        case 0:
          ParticleData.startColor.r = ParticleData.startColor.r * color.color.r;
          ParticleData.startColor.g = ParticleData.startColor.g * color.color.g;
          ParticleData.startColor.b = ParticleData.startColor.b * color.color.b;
          ParticleData.startColor.a = ParticleData.startColor.a * color.color.a;
          break;
        case 2:
          let colorRandom: number;
          if (autoRandomSeed) {
            colorRandom = Math.random();
          } else {
            rand.seed = randomSeeds[10];
            colorRandom = rand.getFloat();
            randomSeeds[10] = rand.seed;
          }
          const minConstantColor = color.colorMin;
          const maxConstantColor = color.colorMax;
          ParticleData.startColor.r =
            ParticleData.startColor.r * MathUtil.lerp(minConstantColor.r, maxConstantColor.r, colorRandom);
          ParticleData.startColor.g =
            ParticleData.startColor.g * MathUtil.lerp(minConstantColor.g, maxConstantColor.g, colorRandom);
          ParticleData.startColor.b =
            ParticleData.startColor.b * MathUtil.lerp(minConstantColor.b, maxConstantColor.b, colorRandom);
          ParticleData.startColor.a =
            ParticleData.startColor.a * MathUtil.lerp(minConstantColor.a, maxConstantColor.a, colorRandom);
          break;
      }
    }

    //StartSize
    const particleSize = ParticleData.startSize;
    switch (particleMesh.startSizeType) {
      case 0:
        if (particleMesh.startSize3D) {
          const startSizeConstantSeparate: Vector3 = particleMesh.startSizeConstantSeparate;
          particleSize.x = startSizeConstantSeparate.x;
          particleSize.y = startSizeConstantSeparate.y;
          particleSize.z = startSizeConstantSeparate.z;
        } else {
          particleSize.x = particleSize.y = particleSize.z = particleMesh.startSizeConstant;
        }
        break;
      case 2:
        if (particleMesh.startSize3D) {
          const startSizeConstantMinSeparate: Vector3 = particleMesh.startSizeConstantMinSeparate;
          const startSizeConstantMaxSeparate: Vector3 = particleMesh.startSizeConstantMaxSeparate;
          if (autoRandomSeed) {
            particleSize.x = MathUtil.lerp(
              startSizeConstantMinSeparate.x,
              startSizeConstantMaxSeparate.x,
              Math.random()
            );
            particleSize.y = MathUtil.lerp(
              startSizeConstantMinSeparate.y,
              startSizeConstantMaxSeparate.y,
              Math.random()
            );
            particleSize.z = MathUtil.lerp(
              startSizeConstantMinSeparate.z,
              startSizeConstantMaxSeparate.z,
              Math.random()
            );
          } else {
            rand.seed = randomSeeds[4];
            particleSize.x = MathUtil.lerp(
              startSizeConstantMinSeparate.x,
              startSizeConstantMaxSeparate.x,
              rand.getFloat()
            );
            particleSize.y = MathUtil.lerp(
              startSizeConstantMinSeparate.y,
              startSizeConstantMaxSeparate.y,
              rand.getFloat()
            );
            particleSize.z = MathUtil.lerp(
              startSizeConstantMinSeparate.z,
              startSizeConstantMaxSeparate.z,
              rand.getFloat()
            );
            randomSeeds[4] = rand.seed;
          }
        } else {
          if (autoRandomSeed) {
            particleSize.x =
              particleSize.y =
              particleSize.z =
                MathUtil.lerp(particleMesh.startSizeConstantMin, particleMesh.startSizeConstantMax, Math.random());
          } else {
            rand.seed = randomSeeds[4];
            particleSize.x =
              particleSize.y =
              particleSize.z =
                MathUtil.lerp(particleMesh.startSizeConstantMin, particleMesh.startSizeConstantMax, rand.getFloat());
            randomSeeds[4] = rand.seed;
          }
        }
        break;
    }

    const sizeOverLifetime: SizeOverLifetimeModule = particleMesh.sizeOverLifetime;
    if (sizeOverLifetime && sizeOverLifetime.enable && sizeOverLifetime.size.mode === ParticleCurveMode.Curve) {
      const size: SizeGradient = sizeOverLifetime.size;
      if (size.separateAxes) {
        if (autoRandomSeed) {
          particleSize.x =
            particleSize.x * MathUtil.lerp(size.constantMinSeparate.x, size.constantMaxSeparate.x, Math.random());
          particleSize.y =
            particleSize.y * MathUtil.lerp(size.constantMinSeparate.y, size.constantMaxSeparate.y, Math.random());
          particleSize.z =
            particleSize.z * MathUtil.lerp(size.constantMinSeparate.z, size.constantMaxSeparate.z, Math.random());
        } else {
          rand.seed = randomSeeds[11];
          particleSize.x =
            particleSize.x * MathUtil.lerp(size.constantMinSeparate.x, size.constantMaxSeparate.x, rand.getFloat());
          particleSize.y =
            particleSize.y * MathUtil.lerp(size.constantMinSeparate.y, size.constantMaxSeparate.y, rand.getFloat());
          particleSize.z =
            particleSize.z * MathUtil.lerp(size.constantMinSeparate.z, size.constantMaxSeparate.z, rand.getFloat());
          randomSeeds[11] = rand.seed;
        }
      } else {
        let randomSize: number;
        if (autoRandomSeed) {
          randomSize = MathUtil.lerp(size.constantMin, size.constantMax, Math.random());
        } else {
          rand.seed = randomSeeds[11];
          randomSize = MathUtil.lerp(size.constantMin, size.constantMax, rand.getFloat());
          randomSeeds[11] = rand.seed;
        }
        particleSize.x = particleSize.x * randomSize;
        particleSize.y = particleSize.y * randomSize;
        particleSize.z = particleSize.z * randomSize;
      }
    }

    //StartRotation//TODO:renderMode2、3模式都不需要旋转，是否移除。
    const renderMode: number = particleRender.renderMode;
    if (renderMode !== 1) {
      switch (particleMesh.startRotationType) {
        case 0:
          if (particleMesh.startRotation3D) {
            const startRotationConstantSeparate: Vector3 = particleMesh.startRotationConstantSeparate;
            const randomRotationE: Vector3 = ParticleData._tempVector30;
            ParticleData._randomInvertRationArray(
              startRotationConstantSeparate,
              randomRotationE,
              particleMesh.flipRotation,
              autoRandomSeed ? null : rand,
              randomSeeds
            );
            ParticleData.startRotation.x = randomRotationE.x;
            ParticleData.startRotation.y = randomRotationE.y;
            if (renderMode !== 4) ParticleData.startRotation.z = -randomRotationE.z;
            else ParticleData.startRotation.z = randomRotationE.z;
          } else {
            ParticleData.startRotation.x = ParticleData._randomInvertRotation(
              particleMesh.startRotationConstant,
              particleMesh.flipRotation,
              autoRandomSeed ? null : rand,
              randomSeeds
            );
            ParticleData.startRotation.y = 0;
            ParticleData.startRotation.z = 0; //需要置0,否则上次缓存影响数据。TODO:mesh模式下使用Z,但是这里为什么是X
          }
          break;
        case 2:
          if (particleMesh.startRotation3D) {
            const startRotationConstantMinSeparate: Vector3 = particleMesh.startRotationConstantMinSeparate;
            const startRotationConstantMaxSeparate: Vector3 = particleMesh.startRotationConstantMaxSeparate;
            const lerpRotationE: Vector3 = ParticleData._tempVector30;
            if (autoRandomSeed) {
              lerpRotationE.x = MathUtil.lerp(
                startRotationConstantMinSeparate.x,
                startRotationConstantMaxSeparate.x,
                Math.random()
              );
              lerpRotationE.y = MathUtil.lerp(
                startRotationConstantMinSeparate.y,
                startRotationConstantMaxSeparate.y,
                Math.random()
              );
              lerpRotationE.z = MathUtil.lerp(
                startRotationConstantMinSeparate.z,
                startRotationConstantMaxSeparate.z,
                Math.random()
              );
            } else {
              rand.seed = randomSeeds[5];
              lerpRotationE.x = MathUtil.lerp(
                startRotationConstantMinSeparate.x,
                startRotationConstantMaxSeparate.x,
                rand.getFloat()
              );
              lerpRotationE.y = MathUtil.lerp(
                startRotationConstantMinSeparate.y,
                startRotationConstantMaxSeparate.y,
                rand.getFloat()
              );
              lerpRotationE.z = MathUtil.lerp(
                startRotationConstantMinSeparate.z,
                startRotationConstantMaxSeparate.z,
                rand.getFloat()
              );
              randomSeeds[5] = rand.seed;
            }
            ParticleData._randomInvertRationArray(
              lerpRotationE,
              lerpRotationE,
              particleMesh.flipRotation,
              autoRandomSeed ? null : rand,
              randomSeeds
            );
            ParticleData.startRotation.x = lerpRotationE.x;
            ParticleData.startRotation.y = lerpRotationE.y;
            if (renderMode !== 4) ParticleData.startRotation.z = -lerpRotationE.z;
            else ParticleData.startRotation.z = lerpRotationE.z;
          } else {
            if (autoRandomSeed) {
              ParticleData.startRotation.x = ParticleData._randomInvertRotation(
                MathUtil.lerp(
                  particleMesh.startRotationConstantMin,
                  particleMesh.startRotationConstantMax,
                  Math.random()
                ),
                particleMesh.flipRotation,
                autoRandomSeed ? null : rand,
                randomSeeds
              );
            } else {
              rand.seed = randomSeeds[5];
              ParticleData.startRotation.x = ParticleData._randomInvertRotation(
                MathUtil.lerp(
                  particleMesh.startRotationConstantMin,
                  particleMesh.startRotationConstantMax,
                  rand.getFloat()
                ),
                particleMesh.flipRotation,
                autoRandomSeed ? null : rand,
                randomSeeds
              );
              randomSeeds[5] = rand.seed;
            }
          }
          break;
      }
    }

    //StartLifetime
    switch (particleMesh.startLifetimeType) {
      case 0:
        ParticleData.startLifeTime = particleMesh.startLifetimeConstant;
        break;
      case 1:
        ParticleData.startLifeTime = ParticleData._getStartLifetimeFromGradient(
          particleMesh.startLifeTimeGradient,
          particleMesh.emissionTime
        );
        break;
      case 2:
        if (autoRandomSeed) {
          ParticleData.startLifeTime = MathUtil.lerp(
            particleMesh.startLifetimeConstantMin,
            particleMesh.startLifetimeConstantMax,
            Math.random()
          );
        } else {
          rand.seed = randomSeeds[7];
          ParticleData.startLifeTime = MathUtil.lerp(
            particleMesh.startLifetimeConstantMin,
            particleMesh.startLifetimeConstantMax,
            rand.getFloat()
          );
          randomSeeds[7] = rand.seed;
        }
        break;
      case 3:
        const emissionTime: number = particleMesh.emissionTime;
        if (autoRandomSeed) {
          ParticleData.startLifeTime = MathUtil.lerp(
            ParticleData._getStartLifetimeFromGradient(particleMesh.startLifeTimeGradientMin, emissionTime),
            ParticleData._getStartLifetimeFromGradient(particleMesh.startLifeTimeGradientMax, emissionTime),
            Math.random()
          );
        } else {
          rand.seed = randomSeeds[7];
          ParticleData.startLifeTime = MathUtil.lerp(
            ParticleData._getStartLifetimeFromGradient(particleMesh.startLifeTimeGradientMin, emissionTime),
            ParticleData._getStartLifetimeFromGradient(particleMesh.startLifeTimeGradientMax, emissionTime),
            rand.getFloat()
          );
          randomSeeds[7] = rand.seed;
        }
        break;
    }

    //StartUV
    const textureSheetAnimation: TextureSheetAnimationModule = particleMesh.textureSheetAnimation;
    const enableSheetAnimation: boolean = textureSheetAnimation && textureSheetAnimation.enable;
    if (enableSheetAnimation) {
      const titleX: number = textureSheetAnimation.numTilesX,
        titleY: number = textureSheetAnimation.numTilesY;
      const subU: number = 1.0 / titleX,
        subV: number = 1.0 / titleY;

      let startFrameCount: number;
      const startFrame: StartFrame = textureSheetAnimation.startFrame;
      switch (startFrame.mode) {
        case 0: //常量模式
          startFrameCount = startFrame.constant;
          break;
        case 1: //随机双常量模式
          if (autoRandomSeed) {
            startFrameCount = MathUtil.lerp(startFrame.constantMin, startFrame.constantMax, Math.random());
          } else {
            rand.seed = randomSeeds[14];
            startFrameCount = MathUtil.lerp(startFrame.constantMin, startFrame.constantMax, rand.getFloat());
            randomSeeds[14] = rand.seed;
          }
          break;
      }

      const frame: FrameOverTime = textureSheetAnimation.frameOverTime;
      const cycles: number = textureSheetAnimation.cyclesCount;
      switch (frame.mode) {
        case 0:
          startFrameCount += frame.constant * cycles;
          break;
        case 2:
          if (autoRandomSeed) {
            startFrameCount += MathUtil.lerp(frame.constantMin, frame.constantMax, Math.random()) * cycles;
          } else {
            rand.seed = randomSeeds[15];
            startFrameCount += MathUtil.lerp(frame.constantMin, frame.constantMax, rand.getFloat()) * cycles;
            randomSeeds[15] = rand.seed;
          }
          break;
      }

      let startRow: number = 0; //TODO:case 2 没处理
      switch (textureSheetAnimation.animation) {
        case 0: //Whole Sheet
          startRow = Math.floor(startFrameCount / titleX);
          break;
        case 1: //Single Row
          if (textureSheetAnimation.rowMode) {
            if (autoRandomSeed) {
              startRow = Math.floor(Math.random() * titleY);
            } else {
              rand.seed = randomSeeds[13];
              startRow = Math.floor(rand.getFloat() * titleY);
              randomSeeds[13] = rand.seed;
            }
          } else {
            startRow = textureSheetAnimation.rowIndex;
          }
          break;
      }

      const startCol: number = Math.floor(startFrameCount % titleX);
      ParticleData.startUVInfo.x = subU;
      ParticleData.startUVInfo.y = subV;
      ParticleData.startUVInfo.z = startCol * subU;
      ParticleData.startUVInfo.w = startRow * subV;
    } else {
      ParticleData.startUVInfo.x = 1.0;
      ParticleData.startUVInfo.y = 1.0;
      ParticleData.startUVInfo.z = 0.0;
      ParticleData.startUVInfo.w = 0.0;
    }
  }

  private static _getStartLifetimeFromGradient(startLifeTimeGradient: ParticleCurve, emissionTime: number): number {
    for (let i: number = 1, n: number = startLifeTimeGradient.gradientCount; i < n; i++) {
      const key: number = startLifeTimeGradient.getKeyByIndex(i);
      if (key >= emissionTime) {
        const lastKey: number = startLifeTimeGradient.getKeyByIndex(i - 1);
        const age: number = (emissionTime - lastKey) / (key - lastKey);
        return MathUtil.lerp(
          startLifeTimeGradient.getValueByIndex(i - 1),
          startLifeTimeGradient.getValueByIndex(i),
          age
        );
      }
    }
    throw new Error("ParticleData: can't get value foam startLifeTimeGradient.");
  }

  private static _randomInvertRationArray(
    rotationE: Vector3,
    outE: Vector3,
    randomizeRotationDirection: number,
    rand: Rand,
    randomSeeds: Uint32Array
  ): void {
    let randDic: number;
    if (rand) {
      rand.seed = randomSeeds[6];
      randDic = rand.getFloat();
      randomSeeds[6] = rand.seed;
    } else {
      randDic = Math.random();
    }
    if (randDic < randomizeRotationDirection) {
      outE.x = -rotationE.x;
      outE.y = -rotationE.y;
      outE.z = -rotationE.z;
    } else {
      outE.x = rotationE.x;
      outE.y = rotationE.y;
      outE.z = rotationE.z;
    }
  }

  private static _randomInvertRotation(
    rotation: number,
    randomizeRotationDirection: number,
    rand: Rand,
    randomSeeds: Uint32Array
  ): number {
    let randDic: number;
    if (rand) {
      rand.seed = randomSeeds[6];
      randDic = rand.getFloat();
      randomSeeds[6] = rand.seed;
    } else {
      randDic = Math.random();
    }
    if (randDic < randomizeRotationDirection) rotation = -rotation;
    return rotation;
  }
}
