/** The base class for all constraint datas. */
export abstract class ConstraintData {
  constructor(
    public name: string,
    public order: number,
    public skinRequired: boolean
  ) {}
}
