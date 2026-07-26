import type {
  Engine,
  PBRMaterial,
  Texture2D
} from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import {
  OceanWetSandTextureService,
  type OceanWetSandTextureFactory
} from "../../demo/ocean/OceanWetSandTextureService";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import { OceanNearshoreStateField } from "../../runtime/ocean/OceanNearshoreStateField";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

interface FakeTextureRecord {
  readonly isSRGBColorSpace: boolean;
  readonly name: string;
  readonly uploads: Uint8Array[];
  destroyCount: number;
  readonly texture: Texture2D;
}

function createField(): {
  readonly resource: OceanNearshoreFieldResource;
  readonly field: OceanNearshoreStateField;
} {
  const compiled = OceanNearshoreCompiler.compile(
    createOceanNearshoreFixture()
  );
  if (!compiled.valid || !compiled.data) {
    throw new Error("Nearshore fixture did not compile.");
  }
  const resource = OceanNearshoreFieldResource.create(compiled.data);
  return {
    resource,
    field: new OceanNearshoreStateField(resource, {
      swashPeriodSeconds: 4,
      minimumRunupDistance: 0,
      maximumRunupDistance: 2
    })
  };
}

function createTextureFactory(
  records: FakeTextureRecord[],
  failAtIndex = -1
): OceanWetSandTextureFactory {
  return {
    create(
      _engine: Engine,
      _width: number,
      _height: number,
      isSRGBColorSpace: boolean,
      name: string
    ): Texture2D {
      if (records.length === failAtIndex) {
        throw new Error("synthetic texture creation failure");
      }
      const record = {
        isSRGBColorSpace,
        name,
        uploads: [],
        destroyCount: 0
      } as Omit<FakeTextureRecord, "texture"> & {
        texture?: Texture2D;
      };
      const texture = {
        setPixelBuffer(buffer: Uint8Array): void {
          record.uploads.push(new Uint8Array(buffer));
        },
        destroy(): void {
          record.destroyCount++;
        }
      } as unknown as Texture2D;
      record.texture = texture;
      records.push(record as FakeTextureRecord);
      return texture;
    }
  };
}

describe("OceanWetSandTextureService", () => {
  it("drives PBR base color and roughness from wetness below the state rate", () => {
    const { resource, field } = createField();
    const records: FakeTextureRecord[] = [];
    const material = {} as PBRMaterial;
    const service = new OceanWetSandTextureService(
      {} as Engine,
      material,
      field,
      {
        uploadRateHz: 10,
        textureFactory: createTextureFactory(records)
      }
    );

    expect(records.map((record) => record.isSRGBColorSpace)).toEqual([
      true,
      false,
      false,
      false
    ]);
    expect(material.baseTexture).toBe(records[0].texture);
    expect(material.normalTexture).toBe(records[1].texture);
    expect(material.roughnessMetallicTexture).toBe(records[2].texture);
    expect(material.occlusionTexture).toBe(records[3].texture);
    expect(service.metrics.textureCreateCount).toBe(4);
    expect(service.metrics.textureDestroyCount).toBe(0);
    expect(service.metrics.normalUploadCount).toBe(1);
    expect(service.metrics.occlusionUploadCount).toBe(1);
    expect(service.metrics.uploadRateHz).toBeLessThan(
      field.metrics.fixedStepRateHz
    );
    expect(service.updateFrame(0, 0)).toBe(true);
    expect(service.updateFrame(0, 1)).toBe(false);
    const initialDryBase = records[0].uploads[0][22 * 4];

    field.seek(2);
    for (let frame = 1; frame <= 5; frame++) {
      expect(service.updateFrame(frame, 1 / 60)).toBe(false);
    }
    expect(service.updateFrame(6, 1 / 60)).toBe(true);
    const wetBase = records[0].uploads.at(-1);
    const wetRoughnessMetallic = records[2].uploads.at(-1);
    expect(wetBase?.[22 * 4]).toBeLessThan(initialDryBase);
    expect(wetRoughnessMetallic?.[22 * 4 + 1]).toBeLessThan(224);
    expect(wetRoughnessMetallic?.[22 * 4 + 2]).toBe(0);
    expect(service.metrics.lastFrameBaseColorUploadCount).toBe(1);
    expect(service.metrics.lastFrameRoughnessMetallicUploadCount).toBe(1);
    expect(service.metrics.baseColorUploadCount).toBe(
      service.metrics.roughnessMetallicUploadCount
    );

    service.destroy();
    expect(material.baseTexture).toBeNull();
    expect(material.normalTexture).toBeNull();
    expect(material.roughnessMetallicTexture).toBeNull();
    expect(material.occlusionTexture).toBeNull();
    expect(records.map((record) => record.destroyCount)).toEqual([
      1,
      1,
      1,
      1
    ]);
    expect(service.metrics.textureCount).toBe(0);
    expect(service.metrics.textureCreateCount).toBe(
      service.metrics.textureDestroyCount
    );
    expect(service.metrics.resourceBytes).toBe(0);
    field.destroy();
    resource.dispose();
  });

  it("can disable wet darkening and restores dry values on the next upload", () => {
    const { resource, field } = createField();
    const records: FakeTextureRecord[] = [];
    const service = new OceanWetSandTextureService(
      {} as Engine,
      {} as PBRMaterial,
      field,
      { textureFactory: createTextureFactory(records) }
    );
    service.updateFrame(0, 0);
    field.seek(2);
    service.setEnabled(false);

    expect(service.updateFrame(1, 0)).toBe(true);
    expect(records[0].uploads.at(-1)?.[22 * 4]).toBe(172);
    expect(service.metrics.enabled).toBe(false);

    service.destroy();
    field.destroy();
    resource.dispose();
  });

  it("draws film only on exposed residual wetness", () => {
    const { resource, field } = createField();
    const records: FakeTextureRecord[] = [];
    const service = new OceanWetSandTextureService(
      {} as Engine,
      {} as PBRMaterial,
      field,
      { textureFactory: createTextureFactory(records) }
    );
    service.updateFrame(0, 0);
    field.seek(2);
    service.reset();

    expect(service.updateFrame(1, 0)).toBe(true);
    const occupiedBaseColor = records[0].uploads.at(-1);
    const occupiedWetIndices = Array.from(
      { length: field.wetnessUploadBuffer.length },
      (_, index) => index
    ).filter(
      (index) =>
        field.wetnessUploadBuffer[index] > 0 &&
        field.stateUploadBuffer[index * 4 + 1] > 0
    );
    expect(occupiedWetIndices.length).toBeGreaterThan(0);
    expect(
      occupiedWetIndices.every(
        (index) =>
          occupiedBaseColor?.[index * 4 + 3] === 0
      )
    ).toBe(true);

    field.seek(3.5);
    service.reset();
    expect(service.updateFrame(2, 0)).toBe(true);
    const exposedBaseColor = records[0].uploads.at(-1);
    const exposedWetIndices = Array.from(
      { length: field.wetnessUploadBuffer.length },
      (_, index) => index
    ).filter(
      (index) =>
        field.wetnessUploadBuffer[index] > 0 &&
        field.stateUploadBuffer[index * 4 + 1] === 0
    );
    expect(exposedWetIndices.length).toBeGreaterThan(0);
    expect(
      exposedWetIndices.some(
        (index) =>
          (exposedBaseColor?.[index * 4 + 3] ?? 0) > 0
      )
    ).toBe(true);
    expect(
      Math.max(
        ...exposedWetIndices.map(
          (index) =>
            exposedBaseColor?.[index * 4 + 3] ?? 0
        )
      )
    ).toBeLessThanOrEqual(96);
    expect(
      Array.from(
        { length: field.wetnessUploadBuffer.length },
        (_, index) => index
      )
        .filter(
          (index) =>
            field.wetnessUploadBuffer[index] === 0
        )
        .every(
          (index) =>
            exposedBaseColor?.[index * 4 + 3] === 0
        )
    ).toBe(true);

    service.setEnabled(false);
    expect(service.updateFrame(3, 0)).toBe(true);
    const disabledBaseColor = records[0].uploads.at(-1);
    expect(
      Array.from(
        { length: field.wetnessUploadBuffer.length },
        (_, index) => disabledBaseColor?.[index * 4 + 3] ?? 0
      ).every((alpha) => alpha === 0)
    ).toBe(true);

    service.destroy();
    field.destroy();
    resource.dispose();
  });

  it("uses authored detail luminance without replacing the warm sand palette", () => {
    const { resource, field } = createField();
    const records: FakeTextureRecord[] = [];
    const detailPixels = new Uint8ClampedArray(
      2 * 2 * 4
    );
    for (
      let offset = 0;
      offset < detailPixels.length;
      offset += 4
    ) {
      detailPixels.set([128, 128, 128, 255], offset);
    }
    const service = new OceanWetSandTextureService(
      {} as Engine,
      {} as PBRMaterial,
      field,
      {
        textureFactory: createTextureFactory(records),
        detailSource: {
          width: 2,
          height: 2,
          pixels: detailPixels
        }
      }
    );

    expect(service.updateFrame(0, 0)).toBe(true);
    const base = records[0].uploads[0];
    const offset = 22 * 4;
    expect(base[offset]).toBeGreaterThan(
      base[offset + 1]
    );
    expect(base[offset + 1]).toBeGreaterThan(
      base[offset + 2]
    );

    service.destroy();
    field.destroy();
    resource.dispose();
  });

  it("destroys the first texture if creation of the second texture fails", () => {
    const { resource, field } = createField();
    const records: FakeTextureRecord[] = [];

    expect(
      () =>
        new OceanWetSandTextureService(
          {} as Engine,
          {} as PBRMaterial,
          field,
          { textureFactory: createTextureFactory(records, 1) }
        )
    ).toThrow(/synthetic texture creation failure/);
    expect(records).toHaveLength(1);
    expect(records[0].destroyCount).toBe(1);

    field.destroy();
    resource.dispose();
  });
});
