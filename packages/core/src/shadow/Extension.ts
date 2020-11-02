import { Logger } from "../base/Logger";
import { AmbientLight } from "../lighting/AmbientLight";
import { Light } from "../lighting/Light";
import { LightShadow } from "./LightShadow";
import { Component } from "../Component";

/**
 * 设置是否产生阴影
 * @param {boolean} enabled
 */
Object.defineProperty(Light.prototype, "enableShadow", {
  get: function () {
    return this._enableShadow;
  },
  set: function (enabled) {
    this._enableShadow = enabled;

    if (this._enableShadow) {
      if (this instanceof AmbientLight) {
        Logger.warn("Has no shadow!");
        return;
      }

      this.shadow = this.shadow || new LightShadow({ engine: this.engine });
      this.shadow.initShadowProjectionMatrix(this);
    }
  }
});

/**
 * 设置是否接收阴影
 * @param {boolean} enabled
 */
Object.defineProperty(Component.prototype, "recieveShadow", {
  get: function () {
    return this._recieveShadow;
  },
  set: function (enabled) {
    this._recieveShadow = enabled;
  }
});

/**
 * 设置是否投射阴影
 * @param {boolean} enabled
 */
Object.defineProperty(Component.prototype, "castShadow", {
  get: function () {
    return this._castShadow;
  },
  set: function (enabled) {
    this._castShadow = enabled;
  }
});
