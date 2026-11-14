import {sampleSeedWorldHeight,type SeedWorldFields} from "@galacean/engine-world-planning/runtime/SeedWorldFields";

type HeightFields=Pick<SeedWorldFields,"sizeMetres"|"worldOrigin"|"heightDecode"|"heightSamples"|"heightResolution"|"surfaceHeights">;
export interface SeedWorldHeightSnapshot {
  version:1;
  fields:HeightFields;
}

/** Detached canonical geometry for one building batch. Copy live arrays once into
 * transferable storage; never transfer live world buffers or resample the surface.
 */
export function snapshotSeedWorldHeight(fields:HeightFields):SeedWorldHeightSnapshot {
  const snapshot:SeedWorldHeightSnapshot={version:1,fields:{sizeMetres:fields.sizeMetres,
    worldOrigin:fields.worldOrigin&&[...fields.worldOrigin],heightDecode:fields.heightDecode&&{...fields.heightDecode},
    heightSamples:fields.heightSamples.slice(),heightResolution:fields.heightResolution,
    surfaceHeights:fields.surfaceHeights?.slice()}};
  validate(snapshot);
  return snapshot;
}

/** Only snapshot-owned buffers are returned; each snapshot can be sent once. */
export function seedWorldHeightTransferables(snapshot:SeedWorldHeightSnapshot):ArrayBuffer[] {
  const fields=snapshot.fields;
  return [...new Set([fields.heightSamples.buffer,
    ...(fields.surfaceHeights?[fields.surfaceHeights.buffer]:[])])] as ArrayBuffer[];
}

function validate(snapshot:SeedWorldHeightSnapshot) {
  const fields=snapshot.fields;
  if(snapshot.version!==1||!Number.isFinite(fields.sizeMetres)||fields.sizeMetres<=0
    ||!Number.isSafeInteger(fields.heightResolution)||fields.heightResolution<1
    ||!(fields.heightSamples instanceof Uint16Array)
    ||fields.heightSamples.length!==fields.heightResolution**2
    ||(fields.surfaceHeights&&(!(fields.surfaceHeights instanceof Float32Array)||fields.surfaceHeights.length!==fields.heightResolution**2))
    ||(fields.worldOrigin&&(fields.worldOrigin.length!==2||!fields.worldOrigin.every(Number.isFinite)))
    ||(fields.heightDecode&&(!Number.isFinite(fields.heightDecode.offset)||!Number.isFinite(fields.heightDecode.scale))))
    throw Error("Invalid Seed height snapshot");

}

/** @internal Worker ownership boundary: received storage is already detached
 * from the host. Keep it private to this sampler and do not copy it a second time.
 */
export function groundFromOwnedSeedWorldHeight(snapshot:SeedWorldHeightSnapshot) {
  validate(snapshot);
  const background=snapshot.fields;
  return (x:number,z:number)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z))return NaN;
    return sampleSeedWorldHeight(background,x,z)??NaN;
  };
}

/** Independently owned public sampler. Later writes to the supplied snapshot
 * cannot change contact heights; the worker uses the explicit ownership boundary above.
 */
export function groundFromSeedWorldHeight(snapshot:SeedWorldHeightSnapshot) {
  return groundFromOwnedSeedWorldHeight(structuredClone(snapshot));
}
