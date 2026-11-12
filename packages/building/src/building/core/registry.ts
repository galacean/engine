import { compareKeys } from "./identity";

/** Named entries. Registration never silently replaces an existing id, so a saved
 * reference always means the code that was registered under it. */
export class Registry<T> {
  private readonly entries = new Map<string, T>();
  constructor(readonly label: string) {}
  register<V extends T>(id: string, value: V): V {
    if (typeof id !== "string" || !id) throw Error(`${this.label} id must be a non-empty string`);
    if (this.entries.has(id)) throw Error(`${this.label} "${id}" is already registered`);
    this.entries.set(id, value);
    return value;
  }
  has(id: string): boolean {
    return this.entries.has(id);
  }
  get(id: string): T | undefined {
    return this.entries.get(id);
  }
  ids(): string[] {
    return [...this.entries.keys()].sort(compareKeys);
  }
}
