import { FarmingSystem } from "@galacean/engine-farming/farming/native/FarmingSystem";
import { FarmingAPI } from "@galacean/engine-farming/farming/native/FarmingAPI";
import { BuildingPartComponent } from "@galacean/engine-building/tiny-glade/parts/architecture/BuildingPartComponent";
import type { RuntimeScriptModule } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-environment";
import declarations from "./fixture-declarations.json";
export const fixtureModules: readonly RuntimeScriptModule[] = [{
  name: "@galacean/building-demo-systems", exports: { FarmingSystem, FarmingAPI, BuildingPartComponent }, declarations
}];
