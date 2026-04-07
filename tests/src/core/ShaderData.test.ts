import { CloneManager, ShaderData, ShaderDataGroup, ShaderMacro } from "@galacean/engine-core";
import { CloneMode } from "@galacean/engine-core/src/clone/enums/CloneMode";
import { describe, expect, it } from "vitest";

describe("ShaderData", () => {
  describe("Macro operations", () => {
    it("enableMacro and disableMacro", () => {
      const shaderData = new ShaderData(ShaderDataGroup.Renderer);
      const macro = ShaderMacro.getByName("TEST_ENABLE_DISABLE");

      shaderData.enableMacro("TEST_ENABLE_DISABLE");
      expect(shaderData._macroCollection.isEnable(macro)).to.be.true;

      const macros = shaderData.getMacros() as ShaderMacro[];
      expect(macros).to.have.lengthOf(1);
      expect(macros[0]).to.equal(macro);

      shaderData.disableMacro("TEST_ENABLE_DISABLE");
      expect(shaderData._macroCollection.isEnable(macro)).to.be.false;
      expect(shaderData.getMacros() as ShaderMacro[]).to.have.lengthOf(0);
    });

    it("enableMacro with value replaces same-name macro", () => {
      const shaderData = new ShaderData(ShaderDataGroup.Renderer);

      shaderData.enableMacro("TEST_VALUE_MACRO", "1");
      const macro1 = ShaderMacro.getByName("TEST_VALUE_MACRO", "1");
      expect(shaderData._macroCollection.isEnable(macro1)).to.be.true;

      shaderData.enableMacro("TEST_VALUE_MACRO", "2");
      const macro2 = ShaderMacro.getByName("TEST_VALUE_MACRO", "2");
      expect(shaderData._macroCollection.isEnable(macro1)).to.be.false;
      expect(shaderData._macroCollection.isEnable(macro2)).to.be.true;
      expect(shaderData.getMacros() as ShaderMacro[]).to.have.lengthOf(1);
    });
  });

  describe("cloneTo", () => {
    it("should produce identical macros in target", () => {
      const source = new ShaderData(ShaderDataGroup.Renderer);
      source.enableMacro("CLONE_MACRO_A");
      source.enableMacro("CLONE_MACRO_B");

      const target = new ShaderData(ShaderDataGroup.Renderer);
      source.cloneTo(target);

      const macroA = ShaderMacro.getByName("CLONE_MACRO_A");
      const macroB = ShaderMacro.getByName("CLONE_MACRO_B");
      expect(target._macroCollection.isEnable(macroA)).to.be.true;
      expect(target._macroCollection.isEnable(macroB)).to.be.true;

      const targetMacros = target.getMacros() as ShaderMacro[];
      expect(targetMacros).to.have.lengthOf(2);
    });

    it("should clear stale macros in target before cloning", () => {
      const source = new ShaderData(ShaderDataGroup.Renderer);
      source.enableMacro("SOURCE_ONLY_MACRO");

      const target = new ShaderData(ShaderDataGroup.Renderer);
      target.enableMacro("TARGET_STALE_MACRO");

      source.cloneTo(target);

      const staleMacro = ShaderMacro.getByName("TARGET_STALE_MACRO");
      const sourceMacro = ShaderMacro.getByName("SOURCE_ONLY_MACRO");

      expect(target._macroCollection.isEnable(staleMacro)).to.be.false;
      const targetMacros = target.getMacros() as ShaderMacro[];
      expect(targetMacros).to.have.lengthOf(1);
      expect(targetMacros[0]).to.equal(sourceMacro);

      const macroMap = (target as any)._macroMap;
      for (const key in macroMap) {
        expect(Number(key)).to.equal(macroMap[key]._nameId);
      }
    });

    it("should not have duplicate macros with same name under different keys", () => {
      const target = new ShaderData(ShaderDataGroup.Renderer);
      target.enableMacro("MACRO_X");
      target.enableMacro("MACRO_Y");
      target.enableMacro("MACRO_Z");

      const source = new ShaderData(ShaderDataGroup.Renderer);
      source.enableMacro("MACRO_Y");

      source.cloneTo(target);

      const targetMacros = target.getMacros() as ShaderMacro[];
      expect(targetMacros).to.have.lengthOf(1);
      expect(targetMacros[0].name).to.equal("MACRO_Y");

      const names = targetMacros.map((m) => m.name);
      const uniqueNames = [...new Set(names)];
      expect(names.length).to.equal(uniqueNames.length);
    });

    it("clone() should produce a clean independent copy", () => {
      const source = new ShaderData(ShaderDataGroup.Renderer);
      source.enableMacro("CLONE_INDEPENDENT_A");
      source.enableMacro("CLONE_INDEPENDENT_B");

      const cloned = source.clone();

      const macroA = ShaderMacro.getByName("CLONE_INDEPENDENT_A");
      const macroB = ShaderMacro.getByName("CLONE_INDEPENDENT_B");
      expect(cloned._macroCollection.isEnable(macroA)).to.be.true;
      expect(cloned._macroCollection.isEnable(macroB)).to.be.true;

      source.disableMacro("CLONE_INDEPENDENT_A");
      expect(cloned._macroCollection.isEnable(macroA)).to.be.true;
    });
  });

  describe("CloneManager", () => {
    it("default cloneMode deep-clones same-constructor objects", () => {
      const sourceObj = { name: "B", id: 2 };
      const targetObj = { name: "A", id: 1 };
      const source = { _field: sourceObj };
      const target = { _field: targetObj };

      CloneManager.cloneProperty(source, target, "_field", undefined, null, null, new Map());

      expect(target._field).to.equal(targetObj);
      expect(targetObj.name).to.equal("B");
      expect(targetObj.id).to.equal(2);
    });

    it("CloneMode.Assignment prevents singleton corruption", () => {
      const macroA = ShaderMacro.getByName("SINGLETON_FIX_A");
      const macroB = ShaderMacro.getByName("SINGLETON_FIX_B");

      const source = { _macro: macroB };
      const target = { _macro: macroA };

      CloneManager.cloneProperty(source, target, "_macro", CloneMode.Assignment, null, null, new Map());

      expect(macroA.name).to.equal("SINGLETON_FIX_A");
      expect(macroA._nameId).to.not.equal(macroB._nameId);
      expect(target._macro).to.equal(macroB);
    });

    it("should not infinite loop on circular references", () => {
      // Simulate AnimatorState ↔ AnimatorStateTransition cycle:
      // State has transitions array, each Transition has destinationState pointing back to a State
      class FakeState {
        transitions: FakeTransition[] = [];
      }
      class FakeTransition {
        destinationState: FakeState = null;
      }

      // Build circular graph: stateA → transitionAB → stateB → transitionBA → stateA
      const srcStateA = new FakeState();
      const srcStateB = new FakeState();
      const srcTransAB = new FakeTransition();
      const srcTransBA = new FakeTransition();
      srcTransAB.destinationState = srcStateB;
      srcTransBA.destinationState = srcStateA;
      srcStateA.transitions = [srcTransAB];
      srcStateB.transitions = [srcTransBA];

      // Target has its own independent state graph
      const tgtStateA = new FakeState();
      const tgtStateB = new FakeState();
      const tgtTransAB = new FakeTransition();
      const tgtTransBA = new FakeTransition();
      tgtTransAB.destinationState = tgtStateB;
      tgtTransBA.destinationState = tgtStateA;
      tgtStateA.transitions = [tgtTransAB];
      tgtStateB.transitions = [tgtTransBA];

      const source = { state: srcStateA };
      const target = { state: tgtStateA };

      // This must not hang — should complete within milliseconds
      CloneManager.cloneProperty(source, target, "state", CloneMode.Deep, null, null, new Map());

      // After clone, target's state graph should reflect source's data
      expect(target.state.transitions).to.have.lengthOf(1);
    });
  });
});
