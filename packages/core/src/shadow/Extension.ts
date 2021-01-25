import { Logger } from "../base/Logger";
import { AmbientLight } from "../lighting/AmbientLight";
import { Light } from "../lighting/Light";
import { LightShadow } from "./LightShadow";
import { Component } from "../Component";

/**
 * Set whether the light to generate shadows.
 */
Object.defineProperty(Light.prototype, "enableShadow", {
  get: function () {
    return this._enableShadow;
  },
  set: function (enabled) {
    this._enableShadow = enabled;

    if (this._enableShadow) {
      if (this instanceof AmbientLight) {
        this._enableShadow = false;
        Logger.warn("Has no shadow!");
        return;
      }

      this.shadow = this.shadow || new LightShadow(this, { engine: this.engine, width: 512, height: 512 });
      this.shadow.initShadowProjectionMatrix(this);
    }
  }
});

/**
 * Set whether the renderer to receive shadows.
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
 * Set whether the renderer to cast shadows.
 */
Object.defineProperty(Component.prototype, "castShadow", {
  get: function () {
    return this._castShadow;
  },
  set: function (enabled) {
    this._castShadow = enabled;
  }
});
