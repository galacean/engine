import { FarmingSystem } from "@galacean/engine-farming/farming/native/FarmingSystem";
import { FarmingAPI } from "@galacean/engine-farming/farming/native/FarmingAPI";
import { HouseComponent, WallComponent } from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
import type { RuntimeScriptModule } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-script-environment";
import declarations from "./fixture-declarations.json";
export const fixtureModules: readonly RuntimeScriptModule[] = [{
  name: "@galacean/building-demo-systems", exports: { FarmingSystem, FarmingAPI, HouseComponent, WallComponent }, declarations
}];
