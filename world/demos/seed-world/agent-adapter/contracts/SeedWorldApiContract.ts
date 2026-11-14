import * as z from "zod";

export const SEED_WORLD_CAPABILITY_DOMAIN_IDS = [
  "world",
  "spatial",
  "time",
  "atmosphere",
  "terrain",
  "water",
  "vegetation",
  "mount",
  "building",
  "animals"
] as const;

export type SeedWorldCapabilityDomainId = (typeof SEED_WORLD_CAPABILITY_DOMAIN_IDS)[number];

export type SeedWorldApiContract<
  Name extends string = string,
  InputSchema extends z.ZodType = z.ZodType,
  OutputSchema extends z.ZodType = z.ZodType
> = Readonly<{
  name: Name;
  effect?: "read" | "edit" | "command";
  domain: SeedWorldCapabilityDomainId;
  description: string;
  inputDescription: string;
  outputDescription: string;
  inputMode?: "required" | "optional" | "none";
  input: InputSchema;
  output: OutputSchema;
}>;

export function defineSeedWorldApiContract<
  const Name extends string,
  InputSchema extends z.ZodType,
  OutputSchema extends z.ZodType
>(contract: SeedWorldApiContract<Name, InputSchema, OutputSchema>): SeedWorldApiContract<Name, InputSchema, OutputSchema> {
  return Object.freeze(contract);
}
