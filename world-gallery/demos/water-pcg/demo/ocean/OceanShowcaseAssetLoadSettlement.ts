export interface OceanShowcaseDestroyableAsset {
  destroy(): void;
}

export interface OceanShowcaseAssetBundle<
  Pbr extends OceanShowcaseDestroyableAsset,
  Rock extends OceanShowcaseDestroyableAsset,
  Foam extends OceanShowcaseDestroyableAsset
> {
  readonly pbrTextureLibrary: Pbr;
  readonly coastalRockAsset: Rock;
  readonly foamDetailTextureLibrary: Foam | undefined;
}

/**
 * Waits for the complete parallel load set before rolling back every fulfilled
 * GPU asset. This avoids leaking a fast successful load when a sibling rejects.
 */
export async function settleOceanShowcaseAssetLoads<
  Pbr extends OceanShowcaseDestroyableAsset,
  Rock extends OceanShowcaseDestroyableAsset,
  Foam extends OceanShowcaseDestroyableAsset
>(
  pbrTextureLibrary: Promise<Pbr>,
  coastalRockAsset: Promise<Rock>,
  foamDetailTextureLibrary: Promise<Foam | undefined>
): Promise<OceanShowcaseAssetBundle<Pbr, Rock, Foam>> {
  const [pbrResult, rockResult, foamResult] =
    await Promise.allSettled([
      pbrTextureLibrary,
      coastalRockAsset,
      foamDetailTextureLibrary
    ]);
  if (
    pbrResult.status === "fulfilled" &&
    rockResult.status === "fulfilled" &&
    foamResult.status === "fulfilled"
  ) {
    return Object.freeze({
      pbrTextureLibrary: pbrResult.value,
      coastalRockAsset: rockResult.value,
      foamDetailTextureLibrary: foamResult.value
    });
  }

  const cleanupErrors: unknown[] = [];
  for (const result of [
    pbrResult,
    rockResult,
    foamResult
  ]) {
    if (
      result.status !== "fulfilled" ||
      result.value === undefined
    ) {
      continue;
    }
    try {
      result.value.destroy();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  const primaryFailure =
    pbrResult.status === "rejected"
      ? pbrResult.reason
      : rockResult.status === "rejected"
        ? rockResult.reason
        : foamResult.status === "rejected"
          ? foamResult.reason
          : new Error(
              "Ocean Showcase asset loading failed without a rejection."
            );
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [primaryFailure, ...cleanupErrors],
      "Ocean Showcase asset loading and rollback failed."
    );
  }
  throw primaryFailure;
}
