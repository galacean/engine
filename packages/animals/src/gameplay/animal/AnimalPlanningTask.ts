/** CPU planning continuation. A yield is a safe suspension point, never a failed query. */
export type AnimalPlanningTask<T> = Generator<void, T, void>;

/** Compatibility path for synchronous hosts and transactional authoring validation. */
export function finishAnimalPlanningTask<T>(task: AnimalPlanningTask<T>): T {
  let step = task.next();
  while (!step.done) step = task.next();
  return step.value;
}
