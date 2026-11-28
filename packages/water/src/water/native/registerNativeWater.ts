import { Loader } from "@galacean/engine-core";
import { WaterBodyComponent } from "./WaterBodyComponent";
import { registerWaterBuiltinShaders } from "./WaterBuiltinShaders";
import { WaterSystem } from "./WaterSystem";

/** Call before ResourceManager loads a Scene/Prefab containing Water components. */
export function registerNativeWater(): void {
  registerWaterBuiltinShaders();
  Loader.registerClass("WaterSystem", WaterSystem);
  Loader.registerClass("WaterBodyComponent", WaterBodyComponent);
}
