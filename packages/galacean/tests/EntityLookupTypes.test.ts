import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("requires callers to handle missing entity and scene references in the published types", () => {
  const fileName = fileURLToPath(new URL("../../../tests/entity-lookup-types.ts", import.meta.url));
  const source = `
import { AnimationRefCurve, AnimatorState, BloomEffect, Component, DirectLight, Entity, Keyframe, ModelMesh, PostProcess, ReferResource, Scene, SceneManager, Shader } from "@galacean/engine";
declare const entity: Entity;
declare const scene: Scene;
declare const component: Component;
declare const manager: SceneManager;
const named: Entity | null = entity.findByName("missing");
const pathed: Entity | null = entity.findByPath("child/missing");
const child: Entity | undefined = entity.getChild(0);
const root: Entity | undefined = scene.getRootEntity();
const parent: Entity | null = entity.parent;
const entityScene: Scene | null | undefined = entity.scene;
const componentScene: Scene | null | undefined = component.scene;
const activeScene: Scene | undefined = manager.activeScene;
const sun: DirectLight | null | undefined = scene.sun;
declare const mesh: ModelMesh;
declare const volume: PostProcess;
declare const state: AnimatorState;
const positions = mesh.getPositions();
positions?.length;
const effect = volume.addEffect(BloomEffect);
effect?.intensity.value;
state.clip = null;
state.clip = undefined;
const key = new Keyframe<ReferResource | null>();
key.value = null;
new AnimationRefCurve().addKey(key);
const shader = Shader.create("typed-shader", []);
shader?.name;
// @ts-expect-error Released CPU vertex data is null.
mesh.getPositions().length;
// @ts-expect-error Adding a duplicate effect returns undefined.
volume.addEffect(BloomEffect).intensity.value;
// @ts-expect-error A state can have no animation clip.
state.clip.length;
// @ts-expect-error Duplicate shader names return undefined.
shader.name;
named?.name;
pathed?.name;
child?.name;
root?.name;
parent?.name;
entityScene?.name;
componentScene?.name;
activeScene?.name;
sun?.enabled;
entity.parent = null;
manager.activeScene = null;
manager.activeScene = undefined;
// @ts-expect-error A name lookup may return null.
entity.findByName("missing").name;
// @ts-expect-error A path lookup may return null.
entity.findByPath("child/missing").name;
// @ts-expect-error An indexed child may not exist.
entity.getChild(0).name;
// @ts-expect-error An empty scene has no root entity.
scene.getRootEntity().name;
// @ts-expect-error A null-only guard does not handle an undefined root.
if (root !== null) root.name;
// @ts-expect-error An entity may not have a parent.
entity.parent.name;
// @ts-expect-error An entity may not belong to a scene.
entity.scene.name;
// @ts-expect-error A component's entity may not belong to a scene.
component.scene.name;
// @ts-expect-error A null-only guard cannot narrow an unassigned scene.
if (entityScene !== null) entityScene.name;
// @ts-expect-error A null-only guard cannot narrow an unassigned component scene.
if (componentScene !== null) componentScene.name;
// @ts-expect-error An empty manager has no active scene.
manager.activeScene.name;
// @ts-expect-error The explicit sun may be unassigned or automatic.
scene.sun.enabled;
// @ts-expect-error A null-only guard cannot narrow an unassigned sun.
if (sun !== null) sun.enabled;
`;
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    target: ts.ScriptTarget.ES2020
  };
  const host = ts.createCompilerHost(options);
  const originalReadFile = host.readFile;
  const originalFileExists = host.fileExists;
  host.readFile = (path) => (resolve(path) === fileName ? source : originalReadFile(path));
  host.fileExists = (path) => resolve(path) === fileName || originalFileExists(path);
  const program = ts.createProgram([fileName], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program, program.getSourceFile(fileName)).map((diagnostic) => ({
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
  }));

  expect(diagnostics).toEqual([]);
});
