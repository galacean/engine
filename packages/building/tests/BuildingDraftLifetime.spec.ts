import { expect, it, vi } from "vitest";
vi.mock("@galacean/engine", async () => ({
  ...(await import("@galacean/engine-core")),
  ...(await import("@galacean/engine-math"))
}));
import { Component, Entity, ReferResource, type Engine, type Material } from "@galacean/engine-core";
import { BuildingPartDraft } from "../src/tiny-glade/parts/BuildingParts";

class OwnedResource extends ReferResource {
  // Engine's internal reference operation is omitted from published typings.
  declare _addReferCount: (value: number) => void;
  constructor(engine: Engine) {
    super(engine);
  }
}
class ResourceUser extends Component {
  resource!: OwnedResource;
  protected override _onDestroy(): void {
    this.resource._addReferCount(-1);
    super._onDestroy();
  }
}
function harness() {
  const engine = {
    _frameInProcess: false,
    _processingPendingDestroys: false,
    _pendingDestroyObjects: [] as { destroy(): void }[],
    resourceManager: {
      _addReferResource() {},
      _deleteReferResource() {},
      _deleteAsset() {},
      _deleteContentRestorer() {}
    }
  };
  const parent = new Entity(engine as unknown as Engine);
  const draft = new BuildingPartDraft(parent);
  const resource = new OwnedResource(parent.engine);
  draft.own(resource as unknown as Material);
  const use = (entity: Entity) => {
    resource._addReferCount(1);
    entity.addComponent(ResourceUser).resource = resource;
  };
  use(draft.root);
  use(draft.ownTemplate(new Entity(parent.engine)));
  return { engine, parent, draft, resource };
}

it("releases owned resources after native Entity destruction outside a frame", () => {
  const { parent, draft, resource } = harness();
  draft.publish();
  draft.dispose();
  expect(draft.root.destroyed).toBe(true);
  expect(resource.refCount).toBe(0);
  expect(resource.destroyed).toBe(true);
  draft.dispose();
  parent.destroy();
});

it("does not lose owned resources when Entity destruction is deferred until frame end", async () => {
  const { engine, parent, draft, resource } = harness();
  draft.publish();
  engine._frameInProcess = true;
  draft.dispose();
  expect(draft.root.pendingDestroy).toBe(true);
  expect(resource.refCount).toBe(2);
  expect(resource.destroyed).toBe(false);
  // Use the Engine's actual queued Entity/Component destruction, then let the
  // output owner release resources after renderer/template references detach.
  engine._processingPendingDestroys = true;
  while (engine._pendingDestroyObjects.length) engine._pendingDestroyObjects.shift()!.destroy();
  engine._frameInProcess = engine._processingPendingDestroys = false;
  await Promise.resolve();
  expect(draft.root.destroyed).toBe(true);
  expect(resource.refCount).toBe(0);
  expect(resource.destroyed).toBe(true);
  draft.dispose();
  parent.destroy();
});
