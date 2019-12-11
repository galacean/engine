import { Oasis } from "./Oasis";

export abstract class Plugin {
  constructor(private oasis: Oasis) {}

  abstract sceneLoaded(): void;
  abstract nodeAdded(): void;
  abstract abilityAdded(): void;
  abstract resourceAdded(): void;
}
