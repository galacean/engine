import {script as assetsScript} from "./runtime/sceneLoader/assets";

import * as r3 from "./exporter";

export * from "./exporter";

(function () {
  if (typeof window === "object" && window === window.window) {
    (window as any).__r3_script_context__ = {
      r3,
      script: assetsScript,
    };
  } else {
    (global as any).window = {};
  }
})();

/**
 * 脚本类装饰器
 * @param name 脚本名称
 */
export function script (name) {
  return function(constructor: Function) {
    (window as any).__r3_script_context__.script(name)(constructor)
  }
}