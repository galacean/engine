import type { GroundBounds } from "../../domain/FarmingGround";

/** Host-owned mud preview on the same contact clock as the cultivated bed. */
export interface FarmingSoilWorkPresentation {
  begin(bounds: GroundBounds): void;
  seek(progress: number): void;
  end(committed: boolean): void;
}
