import type { VirtualResource } from "@galacean/engine-core";

export interface IProject {
  scene: string;
  files: (VirtualResource & { id: string })[];
}
