/** Yield bounded scene preparation as a task, without nested timer clamping.
 * Each yield owns both ports, including when posting fails. */
export function yieldSeedWorldPreparationTask(): Promise<void> {
  if (typeof MessageChannel === "undefined") return new Promise((resolve) => setTimeout(resolve, 0));
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const close = () => {
      channel.port1.close();
      channel.port2.close();
    };
    channel.port1.onmessage = () => {
      close();
      resolve();
    };
    try {
      channel.port2.postMessage(null);
    } catch (error) {
      close();
      reject(error);
    }
  });
}
