import { Oasis } from "../Oasis";
import { Resource } from "./Resource";

export class ResouceManager {
  constructor(private oasis: Oasis) {}
  async load(asset: AssetConfig) {}

  get(id: string): Resource {
    return new Resource();
  }
}
