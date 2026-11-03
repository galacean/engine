import { isWaterSceneMutationSafe } from "@galacean/engine-water/water/runtime/index";

/** Never clear an earlier unsafe publication just because a later operation is safe. */
export async function runSeedWorldAppearanceMutation<T>(
  operation: () => Promise<T>,
  markUnsafe: () => void
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isWaterSceneMutationSafe(error)) {
      markUnsafe();
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${message}。世界保存已暂停，以免覆盖已有存档；请重新加载已保存的世界，或重新生成世界。`, {
        cause: error
      });
    }
    throw error;
  }
}
