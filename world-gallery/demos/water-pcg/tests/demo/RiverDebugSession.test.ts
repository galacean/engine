import { describe, expect, it } from "vitest";
import { RiverQualityLevel } from "../../authoring/river/RiverAuthoringEnums";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import {
  RiverDebugChannel,
  RiverDebugSession,
  RiverDebugStage,
  parseRiverDebugTarget,
  resolveRiverDebugSceneState,
  serializeRiverDebugTarget,
  type RiverDebugRuntimeMetrics,
  type RiverDebugSessionContext
} from "../../demo/debug/RiverDebugSession";
import { RiverDebugMode } from "../../demo/debug/constants";
import { RiverSurfaceDebugMode } from "../../runtime/river/RiverRuntimeEnums";

const EMPTY_METRICS: RiverDebugRuntimeMetrics = {
  resourceByteLength: 0,
  drawCalls: 0,
  bufferMemory: 0,
  textureMemory: 0,
  totalMemory: 0,
  submissionYieldCount: 0,
  submissionMaxSliceMs: 0,
  workerDeserializeMs: 0
};

function createContext(
  quality: RiverQualityLevel = RiverQualityLevel.Medium,
  resourceHash = "compiled-hash"
): RiverDebugSessionContext {
  const result = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor);
  if (!result.data) throw new Error("Expected the multi-tributary fixture to compile.");
  return {
    exampleLabel: "Multi Tributary River",
    resourceHash,
    data: result.data,
    quality,
    metrics: EMPTY_METRICS
  };
}

describe("RiverDebugSession", () => {
  it("maps the six stages to distinct scene policies and restores production presentation in Final", () => {
    const base = { target: { kind: "network" as const }, queryT: 0.5 };

    expect(
      resolveRiverDebugSceneState(
        { ...base, stage: RiverDebugStage.Authoring, channel: RiverDebugChannel.ControlPoints },
        RiverQualityLevel.Medium,
        true
      )
    ).toMatchObject({
      overlayMode: RiverDebugMode.ControlPoints,
      surfaceVisible: false,
      bedVisible: false,
      decorationsVisible: false
    });
    expect(
      resolveRiverDebugSceneState(
        { ...base, stage: RiverDebugStage.Topology, channel: RiverDebugChannel.Banks },
        RiverQualityLevel.Medium,
        true
      )
    ).toMatchObject({ overlayMode: RiverDebugMode.Full, surfaceVisible: false });
    expect(
      resolveRiverDebugSceneState(
        { ...base, stage: RiverDebugStage.Geometry, channel: RiverDebugChannel.Chunks },
        RiverQualityLevel.Medium,
        true
      )
    ).toMatchObject({
      overlayMode: RiverDebugMode.Shoreline,
      networkOverlay: "chunks",
      rawGeometryMaterial: true,
      surfaceVisible: true
    });
    expect(
      resolveRiverDebugSceneState(
        { ...base, stage: RiverDebugStage.Fields, channel: RiverDebugChannel.LocalSignedDistance },
        RiverQualityLevel.Medium,
        true
      )
    ).toMatchObject({
      surfaceDebugMode: RiverSurfaceDebugMode.LocalSignedDistance,
      surfaceVisible: true,
      foamVisible: false
    });
    expect(
      resolveRiverDebugSceneState(
        { ...base, stage: RiverDebugStage.Surface, channel: RiverDebugChannel.MacroHeight },
        RiverQualityLevel.Medium,
        true
      )
    ).toMatchObject({
      surfaceDebugMode: RiverSurfaceDebugMode.MacroHeight,
      bedVisible: true,
      decorationsVisible: false
    });
    expect(
      resolveRiverDebugSceneState(
        { ...base, stage: RiverDebugStage.Final, channel: RiverDebugChannel.Final },
        RiverQualityLevel.Medium,
        true
      )
    ).toEqual({
      overlayMode: RiverDebugMode.Off,
      networkOverlay: "off",
      surfaceDebugMode: RiverSurfaceDebugMode.Off,
      surfaceVisible: true,
      foamVisible: true,
      rawGeometryMaterial: false,
      bedVisible: true,
      decorationsVisible: true
    });
  });

  it("keeps stage selection and resource identity stable while debug state changes", () => {
    const context = createContext();
    const session = new RiverDebugSession(context);

    session.select({
      stage: RiverDebugStage.Geometry,
      channel: RiverDebugChannel.Chunks,
      target: { kind: "reach", id: context.data.reaches[0].id }
    });
    session.setQueryT(0.72);

    expect(session.snapshot.selection).toMatchObject({
      stage: RiverDebugStage.Geometry,
      channel: RiverDebugChannel.Chunks,
      queryT: 0.72
    });
    expect(session.snapshot.context.resourceHash).toBe("compiled-hash");
    expect(session.snapshot.context.data).toBe(context.data);
  });

  it("keeps the last successful context and selection visible when compilation fails", () => {
    const context = createContext();
    const session = new RiverDebugSession(context, {
      stage: RiverDebugStage.Surface,
      channel: RiverDebugChannel.MacroHeight,
      target: { kind: "reach", id: context.data.reaches[0].id }
    });

    session.setStatus("compiling", "compiling network");
    session.setStatus("error", "synthetic compile failure");

    expect(session.snapshot.status).toBe("error");
    expect(session.snapshot.statusMessage).toBe("synthetic compile failure");
    expect(session.snapshot.context).toBe(context);
    expect(session.snapshot.selection).toMatchObject({
      stage: RiverDebugStage.Surface,
      channel: RiverDebugChannel.MacroHeight,
      target: { kind: "reach", id: context.data.reaches[0].id }
    });
  });

  it("falls back to Network when the selected target disappears after a successful compile", () => {
    const context = createContext();
    const session = new RiverDebugSession(context, {
      stage: RiverDebugStage.Geometry,
      channel: RiverDebugChannel.Chunks,
      target: { kind: "chunk", id: context.data.chunks[0].id }
    });
    const nextContext = createContext(RiverQualityLevel.Medium, "next-hash");
    const withoutSelectedChunk = {
      ...nextContext,
      data: { ...nextContext.data, chunks: nextContext.data.chunks.slice(1) }
    };

    session.setStatus("compiling", "compiling network");
    session.updateContext(withoutSelectedChunk);

    expect(session.snapshot.selection.target).toEqual({ kind: "network" });
    expect(session.snapshot.selection.stage).toBe(RiverDebugStage.Geometry);
    expect(session.snapshot.selection.channel).toBe(RiverDebugChannel.Chunks);
    expect(session.snapshot.status).toBe("compiling");
    expect(session.snapshot.context.resourceHash).toBe("next-hash");
  });

  it("does not upgrade Low quality and disables unavailable shader channels", () => {
    const session = new RiverDebugSession(createContext(RiverQualityLevel.Low), {
      stage: RiverDebugStage.Fields,
      channel: RiverDebugChannel.LocalFlow
    });

    expect(session.snapshot.cards.find((card) => card.channel === RiverDebugChannel.LocalFlow)?.disabledReason).toBe(
      "Low 质量不启用该调试通道"
    );
    expect(session.snapshot.selection.channel).toBe(RiverDebugChannel.TerrainCorridor);

    const state = resolveRiverDebugSceneState(
      { ...session.snapshot.selection, stage: RiverDebugStage.Surface, channel: RiverDebugChannel.MacroHeight },
      RiverQualityLevel.Low,
      true
    );
    expect(state.surfaceDebugMode).toBe(RiverSurfaceDebugMode.Off);
  });

  it("round-trips valid URL targets and rejects malformed targets", () => {
    expect(parseRiverDebugTarget("reach:main-upper")).toEqual({ kind: "reach", id: "main-upper" });
    expect(serializeRiverDebugTarget({ kind: "chunk", id: "chunk-3" })).toBe("chunk:chunk-3");
    expect(parseRiverDebugTarget("reach:")).toEqual({ kind: "network" });
    expect(parseRiverDebugTarget("unknown:id")).toEqual({ kind: "network" });
  });
});
