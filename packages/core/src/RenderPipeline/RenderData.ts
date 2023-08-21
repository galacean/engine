import { Material } from "../material";
import { Renderer } from "../Renderer";
import { RenderDataUsage } from "./enums/RenderDataUsage";

export class RenderData {
  component: Renderer;
  material: Material;
  usage: RenderDataUsage;
}
