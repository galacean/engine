import { Logger } from "@alipay/o3-base";
import { AAmbientLight, ALight } from "@alipay/o3-lighting";
import { LightShadow } from "./LightShadow";
import { Component } from "@alipay/o3-core";

/**
 * 设置是否产生阴影
 * @param {boolean} enabled
 */
Object.defineProperty(ALight.prototype, "enableShadow", {
  get: function () {
    return this._enableShadow;
  },
  set: function (enabled) {
    this._enableShadow = enabled;

    if (this._enableShadow) {
      if (this instanceof AAmbientLight) {
        Logger.warn("Has no shadow!");
        return;
      }

      this.shadow = this.shadow || new LightShadow();
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
