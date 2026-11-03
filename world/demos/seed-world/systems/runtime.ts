/** Native Script imports share class identities with Scene deserialization and the Editor. */
export {
  PlanningVegetation, PlanningVegetationPopulation, PlanningVegetationInfluence, PlanningFlowerInfluence,
  PlanningFlowers, PlanningGrassAppearance, PlanningPlantMaterials, PlanningVegetationResources, PlanningGroundWind
} from "../src/planning/spatial/runtime/PlanningAuthoringComponents.ts";
export { FarmingSystem } from "@galacean/engine-farming/farming/native/FarmingSystem";
export { FarmingAreaComponent } from "@galacean/engine-farming/farming/native/FarmingAreaComponent";
export { FarmingAPI } from "@galacean/engine-farming/farming/native/FarmingAPI";
export {
  BuildingSystem, MainBuildingComponent, HouseComponent, WallComponent, FenceComponent,
  DecorationComponent, WallDecorationComponent, WindowComponent, DoorComponent, OpeningComponent,
  WallLampComponent, BuildingSurfaceComponent,
  SizedDecorationComponent, RoofDecorationComponent, RoofWindowComponent, RoofHatchComponent, RoofLampComponent
} from "@galacean/engine-building/tiny-glade/components/BuildingComponents";
