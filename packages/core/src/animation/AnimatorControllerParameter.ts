export type AnimatorControllerParameterValue = number | string | boolean;

/**
 * Used to communicate between scripting and the controller, parameters can be set in scripting and used by the controller.
 */
export class AnimatorControllerParameter {
  /** The name of the parameter. */
  name: string;
  /** The value of the parameter. */
  value: AnimatorControllerParameterValue;
}
