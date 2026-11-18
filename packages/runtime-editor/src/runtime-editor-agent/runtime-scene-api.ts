import * as z from "zod";
import { defineApiMethod } from "@galacean/engine-project/api-contract/api-method";
import type { RuntimeSceneEdit } from "../runtime-editor/scene/runtime-scene-edit";

export interface RuntimeSceneApiContext {
  scene(path: string): RuntimeSceneEdit;
}
const method = defineApiMethod<RuntimeSceneApiContext>();
const id = z.string().min(1);
const vector = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const value: z.ZodType<GalaceanSourceValue> = z.lazy(() =>
  z.union([z.null(), z.string(), z.number().finite(), z.boolean(), z.array(value), z.record(z.string(), value)])
);
const props = z.record(z.string(), value);
const entityPatch = z
  .object({
    name: id.optional(),
    position: vector.optional(),
    rotation: vector.optional(),
    scale: vector.optional(),
    isActive: z.boolean().optional(),
    layer: z.number().int().optional()
  })
  .strict();
const updated = () => ({ updated: true as const });

export const runtimeSceneApi = {
  "entity.list": method({
    description:
      "Lists a bounded page of Entity summaries from the current draft, including Prefab members. name is a case-sensitive substring; parentId:null selects roots. Follow nextCursor with the same filters; changed results reject old cursors. Use entity.read for full properties, children and component IDs.",
    effect: "read",
    input: z
      .object({
        scene: id,
        name: z.string().optional(),
        parentId: id.nullable().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().max(256).optional()
      })
      .strict(),
    execute: (context, { scene, ...options }) => context.scene(scene).page(options)
  }),
  "entity.read": method({
    description:
      "Reads one complete authored Entity record by ID, including children and component IDs. Scene is a virtual path; supports linked Prefab members.",
    effect: "read",
    input: z.object({ scene: id, id }).strict(),
    execute: (context, input) => context.scene(input.scene).readEntity(input.id)
  }),
  "entity.create": method({
    description:
      "Creates a node or linked Prefab instance in the draft. prefab is the template virtual path; parentEntityId may select an editable Prefab member. Transforms are local coordinates; rotation is in degrees. Await does not activate the Engine.",
    effect: "edit",
    input: entityPatch.extend({ scene: id, name: id, parentEntityId: id.optional(), prefab: id.optional() }).strict(),
    execute: (context, { scene, ...input }) => context.scene(scene).create(input)
  }),
  "entity.update": method({
    description:
      "Patches the node in the current draft; inherited Prefab properties become local overrides. Identity and hierarchy stay stable; await does not activate the Engine.",
    effect: "edit",
    input: z.object({ scene: id, id, patch: entityPatch }).strict(),
    execute: (context, input) => {
      context.scene(input.scene).update(input.id, input.patch);
      return updated();
    }
  }),
  "entity.revert": method({
    description:
      "Removes inherited Prefab property overrides. Omitted keys restore all supported Entity properties; local added entities have no template to revert.",
    effect: "edit",
    input: z
      .object({
        scene: id,
        id,
        keys: z
          .array(z.enum(["name", "position", "rotation", "scale", "isActive", "layer"]))
          .min(1)
          .optional()
      })
      .strict(),
    execute: (context, input) => {
      context.scene(input.scene).revert(input.id, input.keys);
      return updated();
    }
  }),
  "entity.reparent": method({
    description:
      "Moves a Scene node or instance-local addition. null selects the Scene root. World pose is preserved by default. Rejects template-owned moves, cycles and unrepresentable transforms.",
    effect: "edit",
    input: z.object({ scene: id, id, parentEntityId: id.nullable(), preserveWorld: z.boolean().optional() }).strict(),
    execute: (context, input) => {
      context.scene(input.scene).reparent(input.id, input.parentEntityId, input.preserveWorld);
      return updated();
    }
  }),
  "entity.delete": method({
    description: "Removes the node, its descendants and their owned components in the draft.",
    effect: "edit",
    input: z.object({ scene: id, id }).strict(),
    execute: (context, input) => {
      context.scene(input.scene).delete(input.id);
      return updated();
    }
  }),
  "component.query": method({
    description:
      "Queries source identities in the current Scene draft, including earlier edits in this execute. Live methods require commit and activation.",
    effect: "read",
    input: z.object({ scene: id, entityId: id.optional(), id: id.optional(), type: id.optional() }).strict(),
    execute: (context, { scene, ...selector }) => context.scene(scene).queryComponents(selector)
  }),
  "component.read": method({
    description:
      "Reads current draft properties under props, including earlier edits. Live component methods observe the active runtime instead.",
    effect: "read",
    input: z.object({ scene: id, id }).strict(),
    execute: (context, input) => context.scene(input.scene).readComponent(input.id)
  }),
  "component.add": method({
    description:
      "Adds an authored component to a node in the draft. Assets use {$ref: virtualPath}; hierarchy references use $entity/$component IDs.",
    effect: "edit",
    input: z
      .object({
        scene: id,
        entityId: id,
        type: id,
        props: props.optional(),
        script: z.object({ $ref: id }).strict().optional()
      })
      .strict(),
    execute: (context, { scene, entityId, ...input }) => context.scene(scene).addComponent(entityId, input)
  }),
  "component.update": method({
    description:
      "Merges top-level draft props; nested values replace previous values. Inherited Prefab properties become instance overrides, including nested instances; template values restore inheritance. Await completes the draft update, not Engine activation. Verify live effects in the next execute after commit and activation.",
    effect: "edit",
    input: z.object({ scene: id, id, props }).strict(),
    execute: (context, input) => {
      context.scene(input.scene).updateComponent(input.id, input.props);
      return updated();
    }
  }),
  "component.revert": method({
    description:
      "Removes inherited component property overrides. Omitted keys restore all component mutations. Applies only to inherited Prefab components.",
    effect: "edit",
    input: z.object({ scene: id, id, keys: z.array(id).min(1).optional() }).strict(),
    execute: (context, input) => {
      context.scene(input.scene).revertComponent(input.id, input.keys);
      return updated();
    }
  }),
  "component.remove": method({
    description:
      "Removes the authored component and its node ownership link in the draft. Engine disposal occurs during activation.",
    effect: "edit",
    input: z.object({ scene: id, id }).strict(),
    execute: (context, input) => {
      context.scene(input.scene).removeComponent(input.id);
      return updated();
    }
  })
};
