export type AnimatorControllerParameterValue = number | string | boolean;

/**
 * Used to communicate between scripting and the controller, parameters can be set in scripting and used by the controller.
 */
export class AnimatorControllerParameter {
  /** The default value of the parameter. */
  defaultValue: AnimatorControllerParameterValue;

  /** @internal */
  _onNameChanged: (oldName: string, newName: string) => void = null;

  private _name: string;

  /**
   * The name of the parameter.
   */
  get name(): string {
    return this._name;
  }

  set name(name: string) {
    if (this._name === name) {
      return;
    }
    const oldName = this._name;
    this._name = name;
    this._onNameChanged?.(oldName, name);
  }
}
