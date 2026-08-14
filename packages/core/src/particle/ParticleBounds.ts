import { BoundingBox, MathUtil, Matrix, Quaternion, Vector2, Vector3 } from "@galacean/engine-math";
import { ParticleInheritVelocityMode } from "./enums/ParticleInheritVelocityMode";
import { ParticleRenderMode } from "./enums/ParticleRenderMode";
import { ParticleSimulationSpace } from "./enums/ParticleSimulationSpace";
import { ParticleSubEmitterInheritProperty } from "./enums/ParticleSubEmitterInheritProperty";
import type { ParticleGenerator } from "./ParticleGenerator";
import type { ParticleSubEmitterCommand } from "./modules/SubEmittersModule";
import type { ParticleCompositeCurve } from "./modules/ParticleCompositeCurve";

/**
 * Owns the conservative bounds state for one particle generator.
 * @internal
 */
export class ParticleBounds {
  private static readonly _tempVector20 = new Vector2();
  private static readonly _tempVector21 = new Vector2();
  private static readonly _tempVector22 = new Vector2();
  private static readonly _tempVector30 = new Vector3();
  private static readonly _tempVector31 = new Vector3();
  private static readonly _tempVector32 = new Vector3();
  private static readonly _tempVector33 = new Vector3();
  private static readonly _tempVector34 = new Vector3();
  private static readonly _tempMatrix = new Matrix();
  private static readonly _tempEmissionBounds = new BoundingBox();
  private static readonly _tempScaledBounds = new BoundingBox();

  private static readonly _recordStride = 15;
  private static readonly _recordTimeOffset = 6;
  private static readonly _recordMaxLifetimeOffset = 7;
  private static readonly _recordCurrentAxisReachOffset = 8;
  private static readonly _recordInitialDisplacementOffset = 11;
  private static readonly _recordInitialFactorOffset = 14;
  private static readonly _recordIncreaseCount = 16;
  private static readonly _bakedInitialVelocityFactor = -1;
  private static readonly _tempEmissionRecord = new Float32Array(ParticleBounds._recordStride);

  private readonly _generatorBounds = new BoundingBox();
  private readonly _transformedBounds = new BoundingBox();
  private _sourceBounds: BoundingBox;
  private _sourceBoundsFrame = -1;
  private _previousTrajectoryBounds: BoundingBox;
  private _trajectoryFrameDisplacement: Vector3;
  private _emissionRecords: Float32Array | null = null;
  private _emissionRecordCount = 0;
  private _nextEmissionExpiry = Infinity;
  private _lastEmissionFrame = -1;
  private _currentInheritedAxisReach: Vector3 | null = null;
  private _lastInitialCurveFactor = 0;

  constructor(private readonly _generator: ParticleGenerator) {}

  update(out: BoundingBox): void {
    const generator = this._generator;
    if (!generator.isAlive) {
      const worldPosition = generator._renderer.entity.transform.worldPosition;
      out.min.copyFrom(worldPosition);
      out.max.copyFrom(worldPosition);
      return;
    }

    if (generator.main.simulationSpace === ParticleSimulationSpace.Local) {
      this._updateLocal(out);
    } else {
      if (generator._renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.TransformVolume)) {
        this.generateTransformed();
      }
      this._updateWorld(out);
    }
  }

  generateTransformed(): void {
    const generator = this._generator;
    const renderer = generator._renderer;
    const maxLifetime = generator.main.startLifetime._getMax();
    const generatorBoundsDirty = renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume);

    if (generatorBoundsDirty) {
      this._calculateGeneratorBounds(maxLifetime, this._generatorBounds, true);
      renderer._clearDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume);
    }

    if (renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.TransformVolume)) {
      this._calculateTransformedBounds(maxLifetime, this._generatorBounds, this._transformedBounds);
      renderer._clearDirtyFlag(ParticleBoundsUpdateFlags.TransformVolume);
    }

    if (generatorBoundsDirty) {
      const initialCurveFactor = generator.inheritVelocity._usesInitialCurve(false)
        ? generator.inheritVelocity.curve._getMaxMagnitude()
        : 0;
      if (initialCurveFactor > this._lastInitialCurveFactor && this._emissionRecordCount > 0) {
        this._preserveInitialCurveFactor(initialCurveFactor);
      }
      this._lastInitialCurveFactor = initialCurveFactor;
    }
  }

  recordSubEmitterEmission(playTime: number, command: ParticleSubEmitterCommand, eventSizeBounds: number): void {
    const generator = this._generator;
    // The source snapshot is captured before retirement can collapse its bounds to the emitter position
    const sourceBounds = command.source._bounds._getSourceBounds();
    const { min: sourceMin, max: sourceMax } = sourceBounds;
    const maxLifetime = generator.main.startLifetime._getMax();
    const targetTransform = generator._renderer.entity.transform;
    const inheritParentDirection = (command.inheritProperties & ParticleSubEmitterInheritProperty.Velocity) !== 0;
    const generatorBounds = this._getSubEmitterGeneratorBounds(
      maxLifetime,
      generator.main._getPositionScale(),
      inheritParentDirection
    );
    const worldBounds = ParticleBounds._tempEmissionBounds;

    let extraExtent = eventSizeBounds;
    if (inheritParentDirection) {
      const speedRange = ParticleBounds._tempVector20;
      this._getExtremeValueFromZero(generator.main.startSpeed, speedRange);
      extraExtent += Math.max(Math.abs(speedRange.x), Math.abs(speedRange.y)) * maxLifetime;
    }

    const inheritVelocity = generator.inheritVelocity;
    let inheritedExtentX = 0;
    let inheritedExtentY = 0;
    let inheritedExtentZ = 0;
    if (inheritVelocity.enabled && inheritVelocity.mode === ParticleInheritVelocityMode.Initial) {
      const trajectoryDuration =
        command.isBirth === true ? command.getTrajectoryDuration() : command.trajectoryDuration;
      if (trajectoryDuration > MathUtil.zeroTolerance) {
        const trajectoryDisplacement = command.source._bounds._trajectoryFrameDisplacement;
        const factor = (inheritVelocity.curve._getMaxMagnitude() * maxLifetime) / trajectoryDuration;
        inheritedExtentX = trajectoryDisplacement.x * factor;
        inheritedExtentY = trajectoryDisplacement.y * factor;
        inheritedExtentZ = trajectoryDisplacement.z * factor;
      }
    }

    worldBounds.min.set(
      sourceMin.x - extraExtent - inheritedExtentX,
      sourceMin.y - extraExtent - inheritedExtentY,
      sourceMin.z - extraExtent - inheritedExtentZ
    );
    worldBounds.max.set(
      sourceMax.x + extraExtent + inheritedExtentX,
      sourceMax.y + extraExtent + inheritedExtentY,
      sourceMax.z + extraExtent + inheritedExtentZ
    );

    if (generator.main.simulationSpace === ParticleSimulationSpace.Local) {
      const inverseTargetWorld = ParticleBounds._tempMatrix;
      Matrix.affineTransformation(
        ParticleBounds._tempVector34.set(1, 1, 1),
        targetTransform.worldRotationQuaternion,
        targetTransform.worldPosition,
        inverseTargetWorld
      );
      inverseTargetWorld.invert();
      BoundingBox.transform(worldBounds, inverseTargetWorld, worldBounds);
      worldBounds.min.add(generatorBounds.min);
      worldBounds.max.add(generatorBounds.max);
    } else {
      const sourceWorldMinX = worldBounds.min.x;
      const sourceWorldMinY = worldBounds.min.y;
      const sourceWorldMinZ = worldBounds.min.z;
      const sourceWorldMaxX = worldBounds.max.x;
      const sourceWorldMaxY = worldBounds.max.y;
      const sourceWorldMaxZ = worldBounds.max.z;
      this._calculateTransformedBounds(
        maxLifetime,
        generatorBounds,
        worldBounds,
        ParticleBounds._tempVector34.set(0, 0, 0),
        targetTransform.worldRotationQuaternion
      );
      worldBounds.min.set(
        worldBounds.min.x + sourceWorldMinX,
        worldBounds.min.y + sourceWorldMinY,
        worldBounds.min.z + sourceWorldMinZ
      );
      worldBounds.max.set(
        worldBounds.max.x + sourceWorldMaxX,
        worldBounds.max.y + sourceWorldMaxY,
        worldBounds.max.z + sourceWorldMaxZ
      );
    }
    this._recordFixedEmission(playTime, maxLifetime, worldBounds);
  }

  recordWorldEmission(
    playTime: number,
    worldPosition: Vector3 | undefined,
    inheritedBounds: Vector3,
    usesInitialInheritCurve: boolean
  ): void {
    const generator = this._generator;
    const renderer = generator._renderer;
    const maxLifetime = generator.main.startLifetime._getMax();
    if (
      renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume) ||
      renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.TransformVolume)
    ) {
      this.generateTransformed();
    }

    const record = ParticleBounds._tempEmissionRecord;
    const emitterWorldPosition = renderer.entity.transform.worldPosition;
    const offsetX = worldPosition ? worldPosition.x - emitterWorldPosition.x : 0;
    const offsetY = worldPosition ? worldPosition.y - emitterWorldPosition.y : 0;
    const offsetZ = worldPosition ? worldPosition.z - emitterWorldPosition.z : 0;
    record[0] = this._transformedBounds.min.x + offsetX;
    record[1] = this._transformedBounds.min.y + offsetY;
    record[2] = this._transformedBounds.min.z + offsetZ;
    record[3] = this._transformedBounds.max.x + offsetX;
    record[4] = this._transformedBounds.max.y + offsetY;
    record[5] = this._transformedBounds.max.z + offsetZ;
    record[ParticleBounds._recordTimeOffset] = playTime;
    record[ParticleBounds._recordMaxLifetimeOffset] = maxLifetime;
    const axisReach = this._currentInheritedAxisReach;
    record[ParticleBounds._recordCurrentAxisReachOffset] = axisReach?.x ?? 0;
    record[ParticleBounds._recordCurrentAxisReachOffset + 1] = axisReach?.y ?? 0;
    record[ParticleBounds._recordCurrentAxisReachOffset + 2] = axisReach?.z ?? 0;
    record[ParticleBounds._recordInitialDisplacementOffset] = inheritedBounds.x;
    record[ParticleBounds._recordInitialDisplacementOffset + 1] = inheritedBounds.y;
    record[ParticleBounds._recordInitialDisplacementOffset + 2] = inheritedBounds.z;
    const hasInitialDisplacement = inheritedBounds.x !== 0 || inheritedBounds.y !== 0 || inheritedBounds.z !== 0;
    record[ParticleBounds._recordInitialFactorOffset] = hasInitialDisplacement
      ? usesInitialInheritCurve
        ? generator.inheritVelocity.curve._getMaxMagnitude()
        : ParticleBounds._bakedInitialVelocityFactor
      : 0;

    this._storeEmissionRecord(record);
  }

  captureSource(): void {
    const renderer = this._generator._renderer;
    const frameCount = renderer.engine.time.frameCount;
    const currentBounds = renderer.bounds;
    let sourceBounds = this._sourceBounds;
    if (sourceBounds && this._sourceBoundsFrame === frameCount) {
      BoundingBox.merge(sourceBounds, currentBounds, sourceBounds);
    } else {
      sourceBounds = this._sourceBounds ||= new BoundingBox();
      sourceBounds.copyFrom(currentBounds);
      this._sourceBoundsFrame = frameCount;
    }
  }

  captureTrajectory(resetBaseline: boolean): void {
    const currentBounds = this._getSourceBounds();
    const currentMin = currentBounds.min;
    const currentMax = currentBounds.max;
    let previousBounds = this._previousTrajectoryBounds;
    const displacement = (this._trajectoryFrameDisplacement ||= new Vector3());
    if (previousBounds && !resetBaseline) {
      const previousMin = previousBounds.min;
      const previousMax = previousBounds.max;
      displacement.set(
        Math.max(Math.abs(currentMin.x - previousMax.x), Math.abs(currentMax.x - previousMin.x)),
        Math.max(Math.abs(currentMin.y - previousMax.y), Math.abs(currentMax.y - previousMin.y)),
        Math.max(Math.abs(currentMin.z - previousMax.z), Math.abs(currentMax.z - previousMin.z))
      );
    } else {
      previousBounds ??= this._previousTrajectoryBounds = new BoundingBox();
      displacement.set(currentMax.x - currentMin.x, currentMax.y - currentMin.y, currentMax.z - currentMin.z);
    }
    previousBounds.copyFrom(currentBounds);
  }

  resetTrajectoryBaseline(): void {
    this._trajectoryFrameDisplacement?.set(0, 0, 0);
  }

  accumulateInheritedVelocity(deltaTime: number): void {
    if (deltaTime <= 0) {
      return;
    }
    const velocity = ParticleBounds._tempVector34;
    if (!this._generator.inheritVelocity._getCurrentBoundsVelocity(velocity)) {
      return;
    }
    const axisReach = (this._currentInheritedAxisReach ||= new Vector3());
    axisReach.set(
      axisReach.x + velocity.x * deltaTime,
      axisReach.y + velocity.y * deltaTime,
      axisReach.z + velocity.z * deltaTime
    );
    this._generator._renderer._onWorldVolumeChanged();
  }

  retireEmissionRecords(): void {
    const playTime = this._generator._playTime;
    if (playTime <= this._nextEmissionExpiry) {
      return;
    }

    const records = this._emissionRecords;
    let recordCount = this._emissionRecordCount;
    let retired = false;
    let nextExpiry = Infinity;
    let index = 0;
    while (index < recordCount) {
      const offset = index * ParticleBounds._recordStride;
      const expiry =
        records[offset + ParticleBounds._recordTimeOffset] + records[offset + ParticleBounds._recordMaxLifetimeOffset];
      if (playTime > expiry) {
        retired = true;
        recordCount--;
        if (index < recordCount) {
          const lastOffset = recordCount * ParticleBounds._recordStride;
          records.copyWithin(offset, lastOffset, lastOffset + ParticleBounds._recordStride);
        }
      } else {
        nextExpiry = Math.min(nextExpiry, expiry);
        index++;
      }
    }
    this._emissionRecordCount = recordCount;
    this._nextEmissionExpiry = nextExpiry;
    if (retired) {
      this._generator._renderer._onWorldVolumeChanged();
    }
    if (recordCount === 0) {
      this._currentInheritedAxisReach?.set(0, 0, 0);
    }
  }

  resetEmissionRecords(): void {
    this._emissionRecordCount = 0;
    this._nextEmissionExpiry = Infinity;
    this._lastEmissionFrame = -1;
    this._currentInheritedAxisReach?.set(0, 0, 0);
    this._lastInitialCurveFactor = 0;
    this._generator._renderer._onWorldVolumeChanged();
  }

  discardParticleState(): void {
    this.resetEmissionRecords();
    this._sourceBoundsFrame = -1;
    this._trajectoryFrameDisplacement?.set(0, 0, 0);
  }

  releaseEmissionRecords(): void {
    this._emissionRecords = null;
    this.resetEmissionRecords();
  }

  getConfiguredParticleSizeExtent(): number {
    const { main } = this._generator;
    return this.getParticleSizeExtent(main.startSizeX._getMax(), main.startSizeY._getMax(), main.startSizeZ._getMax());
  }

  getParticleSizeExtent(sizeX: number, sizeY: number, sizeZ: number): number {
    const generator = this._generator;
    const { main, sizeOverLifetime } = generator;
    let maxSize = Math.abs(sizeX);
    if (main.startSize3D) {
      maxSize = Math.max(maxSize, Math.abs(sizeY));
      if (generator._renderer.renderMode === ParticleRenderMode.Mesh) {
        maxSize = Math.max(maxSize, Math.abs(sizeZ));
      }
    }

    if (sizeOverLifetime.enabled) {
      let maxSizeOverLifetime = sizeOverLifetime.size._getMax();
      if (sizeOverLifetime.separateAxes) {
        maxSizeOverLifetime = Math.max(
          maxSizeOverLifetime,
          sizeOverLifetime.sizeY._getMax(),
          sizeOverLifetime.sizeZ._getMax()
        );
      }
      maxSize *= maxSizeOverLifetime;
    }
    return maxSize * 1.414;
  }

  private _updateWorld(out: BoundingBox): void {
    const generator = this._generator;
    const isPlaying = generator._isPlaying;
    const useOrbitalBounds = this._useOrbitalBounds();
    let maxLifetime = isPlaying ? generator.main.startLifetime._getMax() : 0;
    if (isPlaying) {
      out.copyFrom(this._transformedBounds);
    }
    if (this._emissionRecordCount > 0) {
      if (!isPlaying) {
        const extent = Number.MAX_VALUE;
        out.min.set(extent, extent, extent);
        out.max.set(-extent, -extent, -extent);
      }
      const currentInheritedVelocity = ParticleBounds._tempVector33;
      if (!generator.inheritVelocity._getCurrentBoundsVelocity(currentInheritedVelocity)) {
        currentInheritedVelocity.set(0, 0, 0);
      }
      maxLifetime = Math.max(
        maxLifetime,
        this._mergeWorldEmissionBounds(out, useOrbitalBounds, currentInheritedVelocity)
      );
    }
    if (!useOrbitalBounds) {
      this._addGravityToBounds(maxLifetime, out, out);
    }
  }

  private _updateLocal(out: BoundingBox): void {
    const generator = this._generator;
    const renderer = generator._renderer;
    const maxLifetime = generator.main.startLifetime._getMax();

    if (renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume)) {
      this._calculateGeneratorBounds(maxLifetime, this._generatorBounds, true);
      renderer._clearDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume);
    }

    if (renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.TransformVolume)) {
      this._calculateTransformedBounds(maxLifetime, this._generatorBounds, this._transformedBounds);
      renderer._clearDirtyFlag(ParticleBoundsUpdateFlags.TransformVolume);
    }

    const useOrbitalBounds = this._useOrbitalBounds();
    if (this._emissionRecordCount > 0) {
      const localBounds = ParticleBounds._tempEmissionBounds;
      localBounds.copyFrom(this._generatorBounds);
      const boundsLifetime = Math.max(maxLifetime, this._mergeLocalEmissionBounds(localBounds));
      this._calculateTransformedBounds(boundsLifetime, localBounds, out);
      if (!useOrbitalBounds) {
        this._addGravityToBounds(boundsLifetime, out, out);
      }
    } else if (useOrbitalBounds) {
      out.copyFrom(this._transformedBounds);
    } else {
      this._addGravityToBounds(maxLifetime, this._transformedBounds, out);
    }
  }

  private _getSourceBounds(): BoundingBox {
    const renderer = this._generator._renderer;
    return this._sourceBoundsFrame === renderer.engine.time.frameCount ? this._sourceBounds : renderer.bounds;
  }

  private _recordFixedEmission(playTime: number, maxLifetime: number, bounds: BoundingBox): void {
    const record = ParticleBounds._tempEmissionRecord;
    record.fill(0);
    const { min, max } = bounds;
    record[0] = min.x;
    record[1] = min.y;
    record[2] = min.z;
    record[3] = max.x;
    record[4] = max.y;
    record[5] = max.z;
    record[ParticleBounds._recordTimeOffset] = playTime;
    record[ParticleBounds._recordMaxLifetimeOffset] = maxLifetime;
    const axisReach = this._currentInheritedAxisReach;
    record[ParticleBounds._recordCurrentAxisReachOffset] = axisReach?.x ?? 0;
    record[ParticleBounds._recordCurrentAxisReachOffset + 1] = axisReach?.y ?? 0;
    record[ParticleBounds._recordCurrentAxisReachOffset + 2] = axisReach?.z ?? 0;
    this._storeEmissionRecord(record);
  }

  private _storeEmissionRecord(record: Float32Array): void {
    const generator = this._generator;
    const renderer = generator._renderer;
    const frameCount = renderer.engine.time.frameCount;
    const recordCount = this._emissionRecordCount;
    const sameFrame = frameCount === this._lastEmissionFrame;
    const expiry = record[ParticleBounds._recordTimeOffset] + record[ParticleBounds._recordMaxLifetimeOffset];
    let records = this._emissionRecords;
    this._lastEmissionFrame = frameCount;
    this._nextEmissionExpiry = Math.min(this._nextEmissionExpiry, expiry);

    if (recordCount > 0) {
      const previousOffset = (recordCount - 1) * ParticleBounds._recordStride;
      let sameRecord = true;
      for (let i = 0; i < ParticleBounds._recordStride; i++) {
        if (i !== ParticleBounds._recordTimeOffset && records[previousOffset + i] !== record[i]) {
          sameRecord = false;
          break;
        }
      }
      if (sameRecord) {
        const timeOffset = previousOffset + ParticleBounds._recordTimeOffset;
        const recordTime = record[ParticleBounds._recordTimeOffset];
        if (recordTime > records[timeOffset]) {
          records[timeOffset] = recordTime;
          if (generator.inheritVelocity._needTransformFeedback()) {
            renderer._onWorldVolumeChanged();
          }
        }
        return;
      }

      const bakedFactor = ParticleBounds._bakedInitialVelocityFactor;
      if (
        sameFrame &&
        records[previousOffset + ParticleBounds._recordMaxLifetimeOffset] ===
          record[ParticleBounds._recordMaxLifetimeOffset] &&
        (records[previousOffset + ParticleBounds._recordInitialFactorOffset] === bakedFactor) ===
          (record[ParticleBounds._recordInitialFactorOffset] === bakedFactor)
      ) {
        for (let i = 0; i < 3; i++) {
          records[previousOffset + i] = Math.min(records[previousOffset + i], record[i]);
          records[previousOffset + i + 3] = Math.max(records[previousOffset + i + 3], record[i + 3]);
        }
        records[previousOffset + ParticleBounds._recordTimeOffset] = Math.max(
          records[previousOffset + ParticleBounds._recordTimeOffset],
          record[ParticleBounds._recordTimeOffset]
        );
        for (
          let i = ParticleBounds._recordCurrentAxisReachOffset;
          i < ParticleBounds._recordInitialDisplacementOffset;
          i++
        ) {
          records[previousOffset + i] = Math.min(records[previousOffset + i], record[i]);
        }
        for (let i = ParticleBounds._recordInitialDisplacementOffset; i < ParticleBounds._recordStride; i++) {
          records[previousOffset + i] = Math.max(records[previousOffset + i], record[i]);
        }
        renderer._onWorldVolumeChanged();
        return;
      }
    }

    if (!records || recordCount * ParticleBounds._recordStride === records.length) {
      const lastCapacity = records ? records.length / ParticleBounds._recordStride : 0;
      const capacity = lastCapacity + Math.max(lastCapacity, ParticleBounds._recordIncreaseCount);
      const resizedRecords = new Float32Array(capacity * ParticleBounds._recordStride);
      if (records) {
        resizedRecords.set(records);
      }
      this._emissionRecords = records = resizedRecords;
    }
    records.set(record, recordCount * ParticleBounds._recordStride);
    this._emissionRecordCount = recordCount + 1;
    renderer._onWorldVolumeChanged();
  }

  private _preserveInitialCurveFactor(factor: number): void {
    const records = this._emissionRecords;
    for (let index = 0; index < this._emissionRecordCount; index++) {
      const offset = index * ParticleBounds._recordStride;
      if (
        records[offset + ParticleBounds._recordInitialFactorOffset] !== ParticleBounds._bakedInitialVelocityFactor &&
        (records[offset + ParticleBounds._recordInitialDisplacementOffset] !== 0 ||
          records[offset + ParticleBounds._recordInitialDisplacementOffset + 1] !== 0 ||
          records[offset + ParticleBounds._recordInitialDisplacementOffset + 2] !== 0)
      ) {
        records[offset + ParticleBounds._recordInitialFactorOffset] = Math.max(
          records[offset + ParticleBounds._recordInitialFactorOffset],
          factor
        );
      }
    }
  }

  private _mergeLocalEmissionBounds(bounds: BoundingBox): number {
    const records = this._emissionRecords;
    const { min, max } = bounds;
    let maxLifetime = 0;
    for (let index = 0; index < this._emissionRecordCount; index++) {
      const offset = index * ParticleBounds._recordStride;
      min.set(
        Math.min(min.x, records[offset]),
        Math.min(min.y, records[offset + 1]),
        Math.min(min.z, records[offset + 2])
      );
      max.set(
        Math.max(max.x, records[offset + 3]),
        Math.max(max.y, records[offset + 4]),
        Math.max(max.z, records[offset + 5])
      );
      maxLifetime = Math.max(maxLifetime, records[offset + ParticleBounds._recordMaxLifetimeOffset]);
    }
    return maxLifetime;
  }

  private _getSubEmitterGeneratorBounds(
    maxLifetime: number,
    positionScale: Vector3,
    inheritParentDirection: boolean
  ): BoundingBox {
    const renderer = this._generator._renderer;
    if (!inheritParentDirection && positionScale.x === 1 && positionScale.y === 1 && positionScale.z === 1) {
      if (renderer._hasDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume)) {
        this._calculateGeneratorBounds(maxLifetime, this._generatorBounds, true);
        renderer._clearDirtyFlag(ParticleBoundsUpdateFlags.GeneratorVolume);
      }
      return this._generatorBounds;
    }

    const scaledBounds = ParticleBounds._tempScaledBounds;
    this._calculateGeneratorBounds(maxLifetime, scaledBounds, !inheritParentDirection, positionScale);
    return scaledBounds;
  }

  private _calculateGeneratorBounds(
    maxLifetime: number,
    bounds: BoundingBox,
    includeStartSpeed: boolean,
    positionScale?: Vector3
  ): void {
    const { _tempVector30: directionMax, _tempVector31: directionMin, _tempVector20: speedMinMax } = ParticleBounds;
    const { min, max } = bounds;
    const generator = this._generator;
    const { main } = generator;

    const { shape } = generator.emission;
    if (shape?.enabled) {
      shape._getPositionRange(bounds);
      if (includeStartSpeed) {
        shape._getDirectionRange(directionMin, directionMax);
      }
      if (positionScale) {
        ParticleBounds._scaleRange(min, max, positionScale);
        if (includeStartSpeed) {
          ParticleBounds._scaleRange(directionMin, directionMax, positionScale);
        }
      }
    } else {
      min.set(0, 0, 0);
      max.set(0, 0, 0);
      if (includeStartSpeed) {
        directionMin.set(0, 0, -1);
        directionMax.set(0, 0, 0);
        if (positionScale && main.simulationSpace === ParticleSimulationSpace.Local) {
          ParticleBounds._scaleRange(directionMin, directionMax, positionScale);
        }
      }
    }
    if (includeStartSpeed) {
      this._getExtremeValueFromZero(main.startSpeed, speedMinMax);

      const { x: speedMin, y: speedMax } = speedMinMax;
      const { x: dirMinX, y: dirMinY, z: dirMinZ } = directionMin;
      const { x: dirMaxX, y: dirMaxY, z: dirMaxZ } = directionMax;

      min.set(
        min.x + Math.min(dirMinX * speedMax, dirMaxX * speedMin) * maxLifetime,
        min.y + Math.min(dirMinY * speedMax, dirMaxY * speedMin) * maxLifetime,
        min.z + Math.min(dirMinZ * speedMax, dirMaxZ * speedMin) * maxLifetime
      );
      max.set(
        max.x + Math.max(dirMinX * speedMin, dirMaxX * speedMax) * maxLifetime,
        max.y + Math.max(dirMinY * speedMin, dirMaxY * speedMax) * maxLifetime,
        max.z + Math.max(dirMinZ * speedMin, dirMaxZ * speedMax) * maxLifetime
      );
    }

    const maxSize = this.getConfiguredParticleSizeExtent();
    min.set(min.x - maxSize, min.y - maxSize, min.z - maxSize);
    max.set(max.x + maxSize, max.y + maxSize, max.z + maxSize);
  }

  private _mergeWorldEmissionBounds(
    bounds: BoundingBox,
    useOrbitalBounds: boolean,
    currentInheritedVelocity: Vector3
  ): number {
    const records = this._emissionRecords;
    const { min, max } = bounds;
    const extent = ParticleBounds._tempVector34;
    let maxLifetime = 0;
    for (let index = 0; index < this._emissionRecordCount; index++) {
      const offset = index * ParticleBounds._recordStride;
      this._getInheritedBoundsExtent(offset, useOrbitalBounds, currentInheritedVelocity, extent);
      min.set(
        Math.min(min.x, records[offset] - extent.x),
        Math.min(min.y, records[offset + 1] - extent.y),
        Math.min(min.z, records[offset + 2] - extent.z)
      );
      max.set(
        Math.max(max.x, records[offset + 3] + extent.x),
        Math.max(max.y, records[offset + 4] + extent.y),
        Math.max(max.z, records[offset + 5] + extent.z)
      );
      maxLifetime = Math.max(maxLifetime, records[offset + ParticleBounds._recordMaxLifetimeOffset]);
    }
    return maxLifetime;
  }

  private _getInheritedBoundsExtent(
    offset: number,
    useOrbitalBounds: boolean,
    currentInheritedVelocity: Vector3,
    out: Vector3
  ): void {
    const records = this._emissionRecords;
    const currentAxisReach = this._currentInheritedAxisReach;
    const currentX = Math.max(
      (currentAxisReach?.x ?? 0) - records[offset + ParticleBounds._recordCurrentAxisReachOffset],
      0
    );
    const currentY = Math.max(
      (currentAxisReach?.y ?? 0) - records[offset + ParticleBounds._recordCurrentAxisReachOffset + 1],
      0
    );
    const currentZ = Math.max(
      (currentAxisReach?.z ?? 0) - records[offset + ParticleBounds._recordCurrentAxisReachOffset + 2],
      0
    );
    const storedInitialFactor = records[offset + ParticleBounds._recordInitialFactorOffset];
    const initialFactor = storedInitialFactor === ParticleBounds._bakedInitialVelocityFactor ? 1 : storedInitialFactor;
    const initialX = records[offset + ParticleBounds._recordInitialDisplacementOffset] * initialFactor;
    const initialY = records[offset + ParticleBounds._recordInitialDisplacementOffset + 1] * initialFactor;
    const initialZ = records[offset + ParticleBounds._recordInitialDisplacementOffset + 2] * initialFactor;
    const remainingLifetime = Math.max(
      records[offset + ParticleBounds._recordMaxLifetimeOffset] -
        (this._generator._playTime - records[offset + ParticleBounds._recordTimeOffset]),
      0
    );
    if (useOrbitalBounds) {
      const currentReach = currentX + currentY + currentZ;
      const velocityReach = currentInheritedVelocity.x + currentInheritedVelocity.y + currentInheritedVelocity.z;
      const initialReach = initialX + initialY + initialZ;
      const reach = currentReach + velocityReach * remainingLifetime + initialReach;
      out.set(reach, reach, reach);
    } else {
      out.set(
        currentX + currentInheritedVelocity.x * remainingLifetime + initialX,
        currentY + currentInheritedVelocity.y * remainingLifetime + initialY,
        currentZ + currentInheritedVelocity.z * remainingLifetime + initialZ
      );
    }
  }

  private _calculateTransformedBounds(
    maxLifetime: number,
    origin: BoundingBox,
    out: BoundingBox,
    worldPositionOverride?: Vector3,
    worldRotationOverride?: Quaternion
  ): void {
    const {
      _tempVector20: velMinMaxX,
      _tempVector21: velMinMaxY,
      _tempVector22: velMinMaxZ,
      _tempVector30: worldOffsetMin,
      _tempVector31: worldOffsetMax,
      _tempVector32: noiseBoundsExtents,
      _tempMatrix: rotationMatrix
    } = ParticleBounds;
    worldOffsetMin.set(0, 0, 0);
    worldOffsetMax.set(0, 0, 0);

    const generator = this._generator;
    const { transform } = generator._renderer.entity;
    const worldPosition = worldPositionOverride ?? transform.worldPosition;
    Matrix.rotationQuaternion(worldRotationOverride ?? transform.worldRotationQuaternion, rotationMatrix);

    const { min, max } = out;
    min.copyFrom(origin.min);
    max.copyFrom(origin.max);

    const { velocityOverLifetime } = generator;
    if (velocityOverLifetime.enabled) {
      this._getExtremeValueFromZero(velocityOverLifetime.velocityX, velMinMaxX);
      this._getExtremeValueFromZero(velocityOverLifetime.velocityY, velMinMaxY);
      this._getExtremeValueFromZero(velocityOverLifetime.velocityZ, velMinMaxZ);

      velMinMaxX.scale(maxLifetime);
      velMinMaxY.scale(maxLifetime);
      velMinMaxZ.scale(maxLifetime);

      if (velocityOverLifetime.space === ParticleSimulationSpace.Local) {
        min.set(min.x + velMinMaxX.x, min.y + velMinMaxY.x, min.z + velMinMaxZ.x);
        max.set(max.x + velMinMaxX.y, max.y + velMinMaxY.y, max.z + velMinMaxZ.y);
      } else {
        worldOffsetMin.set(
          worldOffsetMin.x + velMinMaxX.x,
          worldOffsetMin.y + velMinMaxY.x,
          worldOffsetMin.z + velMinMaxZ.x
        );
        worldOffsetMax.set(
          worldOffsetMax.x + velMinMaxX.y,
          worldOffsetMax.y + velMinMaxY.y,
          worldOffsetMax.z + velMinMaxZ.y
        );
      }
    }

    const { forceOverLifetime } = generator;
    if (forceOverLifetime.enabled) {
      const { _tempVector20: forceMinMaxX, _tempVector21: forceMinMaxY, _tempVector22: forceMinMaxZ } = ParticleBounds;
      this._getExtremeValueFromZero(forceOverLifetime.forceX, forceMinMaxX);
      this._getExtremeValueFromZero(forceOverLifetime.forceY, forceMinMaxY);
      this._getExtremeValueFromZero(forceOverLifetime.forceZ, forceMinMaxZ);

      const coefficient = 0.5 * maxLifetime * maxLifetime;
      forceMinMaxX.scale(coefficient);
      forceMinMaxY.scale(coefficient);
      forceMinMaxZ.scale(coefficient);

      if (forceOverLifetime.space === ParticleSimulationSpace.Local) {
        min.set(min.x + forceMinMaxX.x, min.y + forceMinMaxY.x, min.z + forceMinMaxZ.x);
        max.set(max.x + forceMinMaxX.y, max.y + forceMinMaxY.y, max.z + forceMinMaxZ.y);
      } else {
        worldOffsetMin.set(
          worldOffsetMin.x + forceMinMaxX.x,
          worldOffsetMin.y + forceMinMaxY.x,
          worldOffsetMin.z + forceMinMaxZ.x
        );
        worldOffsetMax.set(
          worldOffsetMax.x + forceMinMaxX.y,
          worldOffsetMax.y + forceMinMaxY.y,
          worldOffsetMax.z + forceMinMaxZ.y
        );
      }
    }

    const { noise } = generator;
    this._getNoiseBoundsExtents(maxLifetime, noiseBoundsExtents);

    const needTransformFeedback = velocityOverLifetime._needTransformFeedback();
    const orbitalActive = needTransformFeedback && velocityOverLifetime._isOrbitalActive();
    if (needTransformFeedback) {
      const centerOffset = velocityOverLifetime.centerOffset;
      let radialReach = 0;
      if (velocityOverLifetime._isRadialActive()) {
        this._getExtremeValueFromZero(velocityOverLifetime.radial, velMinMaxX);
        radialReach = Math.max(Math.abs(velMinMaxX.x), Math.abs(velMinMaxX.y)) * maxLifetime;
      }
      if (orbitalActive) {
        const dx = Math.max(Math.abs(min.x - centerOffset.x), Math.abs(max.x - centerOffset.x));
        const dy = Math.max(Math.abs(min.y - centerOffset.y), Math.abs(max.y - centerOffset.y));
        const dz = Math.max(Math.abs(min.z - centerOffset.z), Math.abs(max.z - centerOffset.z));
        const worldReach = this._getRangeReach(worldOffsetMin, worldOffsetMax);
        const noiseReach = this._getVectorReach(noiseBoundsExtents);
        const gravityReach = this._getGravityBoundsReach(maxLifetime);
        const reach = Math.sqrt(dx * dx + dy * dy + dz * dz) + worldReach + noiseReach + gravityReach + radialReach;
        min.set(
          Math.min(min.x, centerOffset.x - reach),
          Math.min(min.y, centerOffset.y - reach),
          Math.min(min.z, centerOffset.z - reach)
        );
        max.set(
          Math.max(max.x, centerOffset.x + reach),
          Math.max(max.y, centerOffset.y + reach),
          Math.max(max.z, centerOffset.z + reach)
        );
      } else if (radialReach > 0) {
        min.set(min.x - radialReach, min.y - radialReach, min.z - radialReach);
        max.set(max.x + radialReach, max.y + radialReach, max.z + radialReach);
      }
    }

    out.transform(rotationMatrix);
    if (!orbitalActive) {
      min.add(worldOffsetMin);
      max.add(worldOffsetMax);

      if (noise.enabled) {
        min.set(min.x - noiseBoundsExtents.x, min.y - noiseBoundsExtents.y, min.z - noiseBoundsExtents.z);
        max.set(max.x + noiseBoundsExtents.x, max.y + noiseBoundsExtents.y, max.z + noiseBoundsExtents.z);
      }
    }

    min.add(worldPosition);
    max.add(worldPosition);
  }

  private _useOrbitalBounds(): boolean {
    const { velocityOverLifetime } = this._generator;
    return velocityOverLifetime._needTransformFeedback() && velocityOverLifetime._isOrbitalActive();
  }

  private _getNoiseBoundsExtents(maxLifetime: number, out: Vector3): void {
    const { noise } = this._generator;
    if (!noise.enabled) {
      out.set(0, 0, 0);
      return;
    }

    let noiseMaxX: number, noiseMaxY: number, noiseMaxZ: number;
    if (noise.separateAxes) {
      noiseMaxX = noise.strengthX._getMaxMagnitude();
      noiseMaxY = noise.strengthY._getMaxMagnitude();
      noiseMaxZ = noise.strengthZ._getMaxMagnitude();
    } else {
      noiseMaxX = noiseMaxY = noiseMaxZ = noise.strengthX._getMaxMagnitude();
    }
    out.set(noiseMaxX * maxLifetime, noiseMaxY * maxLifetime, noiseMaxZ * maxLifetime);
  }

  private _getGravityBoundsReach(maxLifetime: number): number {
    const modifierMinMax = ParticleBounds._tempVector20;
    this._getExtremeValueFromZero(this._generator.main.gravityModifier, modifierMinMax);

    const coefficient = 0.5 * maxLifetime * maxLifetime;
    const minGravityEffect = modifierMinMax.x * coefficient;
    const maxGravityEffect = modifierMinMax.y * coefficient;
    const { x, y, z } = this._generator._renderer.scene.physics.gravity;

    const gravityBoundsExtents = ParticleBounds._tempVector33;
    gravityBoundsExtents.set(
      Math.max(Math.abs(x * minGravityEffect), Math.abs(x * maxGravityEffect)),
      Math.max(Math.abs(y * minGravityEffect), Math.abs(y * maxGravityEffect)),
      Math.max(Math.abs(z * minGravityEffect), Math.abs(z * maxGravityEffect))
    );
    return this._getVectorReach(gravityBoundsExtents);
  }

  private _addGravityToBounds(maxLifetime: number, origin: BoundingBox, out: BoundingBox): void {
    const { min: originMin, max: originMax } = origin;
    const modifierMinMax = ParticleBounds._tempVector20;

    this._getExtremeValueFromZero(this._generator.main.gravityModifier, modifierMinMax);
    const { x, y, z } = this._generator._renderer.scene.physics.gravity;
    const coefficient = 0.5 * maxLifetime * maxLifetime;
    const minGravityEffect = modifierMinMax.x * coefficient;
    const maxGravityEffect = modifierMinMax.y * coefficient;
    const gravityEffectMinX = x * minGravityEffect;
    const gravityEffectMaxX = x * maxGravityEffect;
    const gravityEffectMinY = y * minGravityEffect;
    const gravityEffectMaxY = y * maxGravityEffect;
    const gravityEffectMinZ = z * minGravityEffect;
    const gravityEffectMaxZ = z * maxGravityEffect;

    // `origin` and `out` may reference the same bounds
    out.min.set(
      Math.min(gravityEffectMinX, gravityEffectMaxX) + originMin.x,
      Math.min(gravityEffectMinY, gravityEffectMaxY) + originMin.y,
      Math.min(gravityEffectMinZ, gravityEffectMaxZ) + originMin.z
    );
    out.max.set(
      Math.max(gravityEffectMinX, gravityEffectMaxX) + originMax.x,
      Math.max(gravityEffectMinY, gravityEffectMaxY) + originMax.y,
      Math.max(gravityEffectMinZ, gravityEffectMaxZ) + originMax.z
    );
  }

  private static _scaleRange(min: Vector3, max: Vector3, scale: Vector3): void {
    const minX = min.x * scale.x;
    const minY = min.y * scale.y;
    const minZ = min.z * scale.z;
    const maxX = max.x * scale.x;
    const maxY = max.y * scale.y;
    const maxZ = max.z * scale.z;
    min.set(Math.min(minX, maxX), Math.min(minY, maxY), Math.min(minZ, maxZ));
    max.set(Math.max(minX, maxX), Math.max(minY, maxY), Math.max(minZ, maxZ));
  }

  private _getRangeReach(min: Vector3, max: Vector3): number {
    const x = Math.max(Math.abs(min.x), Math.abs(max.x));
    const y = Math.max(Math.abs(min.y), Math.abs(max.y));
    const z = Math.max(Math.abs(min.z), Math.abs(max.z));
    return Math.sqrt(x * x + y * y + z * z);
  }

  private _getVectorReach(value: Vector3): number {
    return Math.sqrt(value.x * value.x + value.y * value.y + value.z * value.z);
  }

  private _getExtremeValueFromZero(curve: ParticleCompositeCurve, out: Vector2): void {
    curve._getMinMax(out);
    out.x = Math.min(0, out.x);
    out.y = Math.max(0, out.y);
  }
}

/**
 * @internal
 */
export enum ParticleBoundsUpdateFlags {
  /** World transform changes invalidate transformed bounds. */
  TransformVolume = 0x2,
  /** Generator parameter changes invalidate local generator bounds. */
  GeneratorVolume = 0x4
}
