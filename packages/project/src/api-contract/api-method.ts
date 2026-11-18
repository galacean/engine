import type * as z from "zod";

/** A host method's schema, semantics and implementation are one registration.
 * Worker clients receive only the existing name/effect binding, never this module.
 * Declarations are extracted from execute's inferred signature at build time. */
export function defineApiMethod<Context>() {
  return <Input extends z.ZodType, Output, const Description extends string>(definition: {
    readonly description: Description;
    readonly effect: "read" | "edit" | "command";
    readonly input: Input;
    readonly execute: (context: Context, input: z.output<Input>) => Output;
  }) => ({
    ...definition,
    invoke(context: Context, input: unknown): Output {
      return definition.execute(context, definition.input.parse(input));
    }
  });
}

export interface ApiOperation {
  readonly description: string;
  readonly effect: "read" | "edit" | "command";
  readonly input: z.ZodType;
  readonly options?: z.ZodType;
}

/** Object.entries erases keys; this boundary preserves the registration's keys. */
export function mapApiMethods<Methods extends Record<string, ApiOperation>, Value>(
  methods: Methods,
  project: (method: ApiOperation) => Value
): { [Key in keyof Methods]: Value } {
  return Object.fromEntries(Object.entries(methods).map(([name, method]) => [name, project(method)])) as {
    [Key in keyof Methods]: Value;
  };
}

/** API inputs accept readonly snapshots; parsing still produces owned mutable values.
 * An empty object schema must not become TS `{}`, which accepts non-object values. */
export type ApiInput<T> = T extends object
  ? keyof T extends never
    ? Record<string, never>
    : { readonly [K in keyof T]: ApiInput<T[K]> }
  : T;
