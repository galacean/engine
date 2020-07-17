import { TextureWrapMode } from "@alipay/o3-base";
import { vec2, quat } from "@alipay/o3-math";
import { translate, scale, rotate, fade, slide } from "./rfuiTween";

const ScaleMin = 1e-12;

export class RfuiAnimation {
  public node;
  public material;
  public defaultParam;
  public onStart;
  public started;

  constructor(node, props) {
    this.node = node;
    this.material = props.material;
    this.defaultParam = props.param;
    this.started = false;
    this.onStart = () => {
      if (!this.started) {
        this.node.isActive = true;
        this.started = true;
      }
    };
  }

  scaleIn(param: any = {}) {
    this.started = false;
    const currentScale = this.node.scale.slice(0);

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.node.scale = currentScale;
        param.onComplete && param.onComplete();
      }
    });

    this.node.scale = config.start || [ScaleMin, ScaleMin, ScaleMin];
    return scale(this.node, currentScale, config);
  }

  scaleXIn(param: any = {}) {
    this.started = false;
    const currentScale = this.node.scale.slice(0);

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.node.scale = currentScale;
        param.onComplete && param.onComplete();
      }
    });

    this.node.scale = [config.start || ScaleMin, currentScale[1], currentScale[2]];
    return scale(this.node, currentScale, config);
  }

  scaleYIn(param: any = {}) {
    this.started = false;
    const currentScale = this.node.scale.slice(0);

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.node.scale = currentScale;
        param.onComplete && param.onComplete();
      }
    });

    this.node.scale = [currentScale[0], config.start || ScaleMin, currentScale[2]];
    return scale(this.node, currentScale, config);
  }

  translateIn(param: any = {}) {
    this.started = false;
    const currentPosition = this.node.position.slice(0);

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.node.position = currentPosition;
        param.onComplete && param.onComplete();
      }
    });

    this.node.position = config.start || [currentPosition[0] + 5, currentPosition[1] + 5, currentPosition[2] + 5];
    return translate(this.node, currentPosition, config);
  }

  rotateIn(param: any = {}) {
    this.started = false;
    const currentRotation = this.node.rotation.slice(0);

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.node.rotation = currentRotation;
        param.onComplete && param.onComplete();
      }
    });
    const start = config.start || [0, 0, 180];
    this.node.setRotationAngles(start[0], start[1], start[2]);
    return rotate(this.node, currentRotation, config);
  }

  fadeIn(param: any = {}) {
    this.started = false;

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.material.opacity = 1;
        param.onComplete && param.onComplete();
      }
    });

    this.material.opacity = 0;
    return fade(
      0,
      (value) => {
        this.material.opacity = value;
      },
      1,
      config
    );
  }

  slideIn(param: any = {}) {
    this.started = false;

    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.material.uvOffset = vec2.fromValues(0, 0);
        param.onComplete && param.onComplete();
      }
    });

    this.material.uvOffset = config.uvOffset || vec2.fromValues(-1, 0);
    this.material.diffuse.wrapModeU = this.material.diffuse.wrapModeV = TextureWrapMode.Clamp;

    return slide(
      this.material.uvOffset,
      (value) => {
        this.material.uvOffset = value;
      },
      vec2.fromValues(0, 0),
      config
    );
  }

  maskSlideIn(param: any = {}) {
    this.started = false;

    const maskUvOffset = param.maskUvOffset || vec2.fromValues(0, -1);
    const config = Object.assign({}, this.defaultParam, param, {
      onTick: this.onStart.bind(this),
      onComplete: () => {
        this.node.isActive = true;
        this.material.maskUvOffset = maskUvOffset;
        param.onComplete && param.onComplete();
      }
    });

    this.material.maskUvOffset = vec2.fromValues(0, 0);
    this.material.mask.wrapModeU = this.material.mask.wrapModeV = TextureWrapMode.Clamp;

    return slide(
      vec2.fromValues(0, 0),
      (value) => {
        this.material.maskUvOffset = value;
      },
      maskUvOffset,
      config
    );
  }

  scaleOut(param: any = {}) {
    const origin = this.node.scale.slice(0);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.node.scale = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });
    const end = config.end || [ScaleMin, ScaleMin, ScaleMin];
    return scale(this.node, end, config);
  }

  scaleXOut(param: any = {}) {
    const origin = this.node.scale.slice(0);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.node.scale = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });
    const end = [config.end || ScaleMin, origin[1], origin[2]];
    return scale(this.node, end, config);
  }

  scaleYOut(param: any = {}) {
    const origin = this.node.scale.slice(0);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.node.scale = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });
    const end = [origin[0], config.end || ScaleMin, origin[2]];
    return scale(this.node, end, config);
  }

  translateOut(param: any = {}) {
    const origin = this.node.position.slice(0);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.node.position = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });
    const end = config.end || [origin[0] + 5, origin[1] + 5, origin[2] + 5];
    return translate(this.node, end, config);
  }

  rotateOut(param: any = {}) {
    const origin = this.node.rotation.slice(0);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.node.rotation = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });
    const end = quat.create();
    config.end ? quat.fromEuler(end, ...(config.end as [number, number, number])) : quat.fromEuler(end, 0, 0, 180);
    return rotate(this.node, end, config);
  }

  fadeOut(param: any = {}) {
    const origin = 1;

    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.material.opacity = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });
    this.material.opacity = origin;
    return fade(
      origin,
      (value) => {
        this.material.opacity = value;
      },
      0,
      config
    );
  }

  slideOut(param: any = {}) {
    const origin = vec2.fromValues(0, 0);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.material.uvOffset = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });

    const uvOffset = config.uvOffset || vec2.fromValues(-1, 0);
    this.material.uvOffset = origin;

    this.material.diffuse.wrapModeU = this.material.diffuse.wrapModeV = TextureWrapMode.Clamp;
    return slide(
      origin,
      (value) => {
        this.material.uvOffset = value;
      },
      uvOffset,
      config
    );
  }

  maskSlideOut(param: any = {}) {
    const origin = param.maskUvOffset || vec2.fromValues(0, -1);
    const config = Object.assign({}, this.defaultParam, param, {
      onComplete: () => {
        this.material.maskUvOffset = origin;
        this.node.isActive = false;
        param.onComplete && param.onComplete();
      }
    });

    this.material.maskUvOffset = origin;
    this.material.mask.wrapModeU = this.material.mask.wrapModeV = TextureWrapMode.Clamp;

    return slide(
      origin,
      (value) => {
        this.material.maskUvOffset = value;
      },
      vec2.fromValues(0, 0),
      config
    );
  }
}
