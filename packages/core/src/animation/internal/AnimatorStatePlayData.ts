import { Component } from "../../Component";
import { AnimatorState } from "../AnimatorState";
import { PlayState } from "../enums/PlayState";
import { AnimatorStateData } from "./AnimatorStataData";

/**
 * @internal
 */
export class AnimatorStatePlayData {
  state: AnimatorState;
  stateData: AnimatorStateData;
  frameTime: number;
}
