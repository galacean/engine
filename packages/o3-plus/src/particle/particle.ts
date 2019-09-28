import { AGPUParticleSystem, BlendFunc } from "@alipay/o3";

/**
 * 暂时只为编辑器使用
 */
export class Particle extends AGPUParticleSystem {
  private _config;
  private _options;

  constructor(node, props) {
    super(node);

    this._options = {
      position: props.__position,
      positionRandomness: props.__positionRandomness,
      velocity: props.__velocity,
      velocityRandomness: props.__velocityRandomness,
      acceleration: props.__acceleration,
      accelerationRandomness: props.__accelerationRandomness,
      color: props.__color,
      colorRandomness: props.__colorRandomness,
      lifetime: props.__lifetime,
      size: props.__size,
      sizeRandomness: props.__sizeRandomness,
      startAngle: props.__startAngle,
      startAngleRandomness: props.__startAngleRandomness,
      rotateRate: props.__rotateRate,
      rotateRateRandomness: props.__rotateRateRandomness,
      scaleFactor: props.__scaleFactor,
      alpha: props.__alpha,
      alphaRandomness: props.__alphaRandomness,
      startTimeRandomness: props.__startTimeRandomness,
    };
    // 粒子发射器环境参数
    this._config = {
      maxCount: props.__maxCount,
      once: props.__once,
      rotateToVelocity: props.__rotateToVelocity,
      isScaleByLifetime: props.__isScaleByLifetime,
      fadeIn: props.__fadeIn,
      texture: props.__texture ? props.__texture.asset : null,
      maskTexture: props.__maskTexture ? props.__maskTexture.asset : null,
      // blendFunc: [props.__blendFunc01, props.__blendFunc02],
      useOriginColor: props.__useOriginColor,
      is2d: props.__is2d,
      options: this._options
    };
    if (props.__spriteSheet) {
      if (typeof props.__spriteSheet === 'object' && props.__spriteSheet.length) {
        this._config.spriteSheet = props.__spriteSheet;
      } else if (typeof props.__spriteSheet === 'string') {
        try {
          const spriteSheet = JSON.parse(props.__spriteSheet);
          if (spriteSheet.length) {
            this._config.spriteSheet = spriteSheet;
          }
        } catch (e) {
        }
      }
    }
    if (props.__positionArray) {
      if (typeof props.__positionArray === 'object' && props.__positionArray.length) {
        this._options.positionArray = props.__positionArray;
      } else if (typeof props.__positionArray === 'string') {
        try {
          const positionArray = JSON.parse(props.__positionArray);
          if (positionArray.length) {
            this._options.positionArray = positionArray;
          }
        } catch (e) {
        }
      }
    }
    if (props.__separate) {
      this._config.blendFuncSeparate = [
        BlendFunc[props.__srcRGB || "SRC_ALPHA"],
        BlendFunc[props.__dstRGB || "ONE_MINUS_SRC_ALPHA"],
        BlendFunc[props.__srcAlpha || "SRC_ALPHA"],
        BlendFunc[props.__dstAlpha || "ONE_MINUS_SRC_ALPHA"]
      ];
    } else if (props.__src && props.__dst) {
      this._config.blendFunc = [BlendFunc[props.__src], BlendFunc[props.__dst]];
    }
    this.initialize(this._config);
    if (props.__defaultStart === true || props.__defaultStart === undefined) {
      this.start();
    }
  }

  updateOption(key, value) {
    this._options = {
      ...this._options,
      [key]: value
    };
    this._config = {
      ...this._config,
      options: {
        ...this._options
      }
    };
    this.initialize(this._config);
    this.start();
  }

  updateConfig(key, value) {
    this._config = {
      ...this._config,
      [key]: value
    };
    this.initialize(this._config);
    this.start();
  }

  set __position(value) {
    this.updateOption("position", value);
  }

  set __positionRandomness(value) {
    this.updateOption("positionRandomness", value);
  }

  set __velocity(value) {
    this.updateOption("velocity", value);
  }

  set __velocityRandomness(value) {
    this.updateOption("velocityRandomness", value);
  }

  set __acceleration(value) {
    this.updateOption("acceleration", value);
  }

  set __accelerationRandomness(value) {
    this.updateOption("accelerationRandomness", value);
  }

  set __color(value) {
    this.updateOption("color", value);
  }

  set __colorRandomness(value) {
    this.updateOption("colorRandomness", value);
  }

  set __lifetime(value) {
    this.updateOption("lifetime", value);
  }

  set __size(value) {
    this.updateOption("size", value);
  }

  set __sizeRandomness(value) {
    this.updateOption("sizeRandomness", value);
  }

  set __startAngle(value) {
    this.updateOption("startAngle", value);
  }

  set __startAngleRandomness(value) {
    this.updateOption("startAngleRandomness", value);
  }

  set __rotateRate(value) {
    this.updateOption("rotateRate", value);
  }

  set __rotateRateRandomness(value) {
    this.updateOption("rotateRateRandomness", value);
  }

  set __scaleFactor(value) {
    this.updateOption("scaleFactor", value);
  }

  set __alpha(value) {
    this.updateOption('alpha', value);
  }
    
  set __alphaRandomness(value) {
    this.updateOption('alphaRandomness', value);
  }

  set __startTimeRandomness(value) {
    this.updateOption('startTimeRandomness', value);
  }

  set __positionArray(value) {
    if (typeof value === 'object' && value.length) {
      this.updateOption('positionArray', value);
    } else if (typeof value === 'string') {
      try {
        const positionArray = JSON.parse(value);
        if (positionArray.length) {
          this.updateOption('positionArray', positionArray);
        } else {
          this.updateOption('positionArray', null);
        }
      } catch (e) {
        this.updateOption('positionArray', null);
      }
    } else {
      this.updateOption('positionArray', null);
    }
  }

  set __maxCount(value) {
    this.updateConfig("maxCount", value);
  }

  set __useOriginColor(value) {
    this.updateConfig("useOriginColor", value);
  }

  set __once(value) {
    this.updateConfig("once", value);
  }

  set __rotateToVelocity(value) {
    this.updateConfig("rotateToVelocity", value);
  }

  set __isScaleByLifetime(value) {
    this.updateConfig("isScaleByLifetime", value);
  }

  set __fadeIn(value) {
    this.updateConfig("fadeIn", value);
  }

  set __texture(value) {
    this.updateConfig("texture", value.asset);
  }

  set __maskTexture(value) {
    this.updateConfig("maskTexture", value.asset);
  }

  set __spriteSheet(value) {
    if (typeof value === 'object' && value.length) {
      this.updateConfig('spriteSheet', value);
    } else if (typeof value === 'string') {
      try {
        const spriteSheet = JSON.parse(value);
        if (spriteSheet.length) {
          this.updateConfig('spriteSheet', spriteSheet);
        } else {
          this.updateConfig('spriteSheet', null);
        }
      } catch (e) {
        this.updateConfig('spriteSheet', null);
      }
    } else {
      this.updateConfig('spriteSheet', null);
    }
  }

  set __is2d(value) {
    this.updateConfig('is2d', value);
  }
  // set __blendFunc01(value) {
  //   this._config.blendFunc[0] = value;
  //   this.updateConfig('blendFunc', this._config.blendFunc);
  // }

  // set __blendFunc02(value) {
  //   this._config.blendFunc[1] = value;
  //   this.updateConfig('blendFunc', this._config.blendFunc);
  // }
}
