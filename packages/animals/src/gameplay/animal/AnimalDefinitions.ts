import type { BehaviorNode } from "../behavior/BehaviorTree";
import type { AnimalDefinition } from "./Animal";

const action = (name: string): BehaviorNode => ({ type: "action", name });

/** Ground roaming: independently choose a rest, walk or short run after each task. */
export const HORSE_ANIMAL: AnimalDefinition = {
  id: "horse",
  ground: { walkSpeed: 1.25, runSpeed: 4.2, turnRate: 1.6 },
  acceleration: 2.5,
  strideLength: 2.1,
  behavior: {
    type: "weightedRandom",
    children: [
      { weight: 3, node: action("rest") },
      { weight: 5, node: action("walk") },
      { weight: 2, node: action("run") }
    ]
  }
};

/** Ground and air roaming share one bird definition; appearance is supplied separately. */
export const BIRD_ANIMAL: AnimalDefinition = {
  id: "bird",
  ground: { walkSpeed: 0.65, runSpeed: 1.2, turnRate: 3.2 },
  flight: { speed: 3.8, height: 3.4, turnRate: 1.7 },
  acceleration: 3.5,
  strideLength: 0.7,
  behavior: {
    type: "weightedRandom",
    children: [
      { weight: 3, node: action("rest") },
      { weight: 3, node: action("walk") },
      {
        weight: 4,
        node: { type: "sequence", children: [action("takeOff"), action("fly"), action("land"), action("rest")] }
      }
    ]
  }
};
