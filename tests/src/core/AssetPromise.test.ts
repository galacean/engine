import { AssetPromise, IProgress } from "@galacean/engine-core";
import { expect } from "chai";

describe("Asset Promise test", function () {
  it("constructor", () => {
    const assetPromise = new AssetPromise((resolve) => {
      resolve();
    });
    expect(assetPromise).not.to.be.undefined;
  });

  it("resolve", async () => {
    const assetPromise = new AssetPromise((resolve) => {
      resolve(1);
    });
    const value = await assetPromise;
    expect(value).to.be.equal(1);
  });

  it("reject", async () => {
    const assetPromise = new AssetPromise((resolve, reject) => {
      reject(1);
    });
    try {
      await assetPromise;
    } catch (e) {
      expect(e).to.eq(1);
    }
  });

  it("then", async () => {
    const assetPromise = new AssetPromise<number>((resolve) => {
      resolve(1);
    });
    const value = await assetPromise
      .then((value) => {
        return value + 1;
      })
      .then((value) => {
        expect(value).to.eq(2);
        return value + 1;
      });

    expect(value).to.eq(3);
  });

  it("catch", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject) => {
      reject(1);
    });
    const value = await assetPromise.catch((reason) => reason + 1);
    expect(value).to.eq(2);
  });

  it("finally", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject) => {
      reject(1);
    })
      .finally(() => {
        expect(true).to.be.true;
      })
      .catch((reason) => reason + 1);
    const value = await assetPromise;
    expect(value).to.eq(2);
  });

  it("cancel", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject) => {
      setTimeout(() => {
        resolve(1);
      });
    });
    assetPromise.cancel();
    await assetPromise
      .then((result) => {
        expect(result).to.eq(222);
      })
      .catch((e) => {
        expect(e).to.eq("canceled");
      });
  });

  it("progress", async () => {
    const assetPromise = new AssetPromise<number>((resolve, reject, setProgress) => {
      let i = 0;
      const progress = {
        task: {
          loaded: i,
          total: 10
        }
      };
      let timeoutId = setInterval(() => {
        i++;
        progress.task.loaded = i;
        setProgress(progress);
        if (i === 10) {
          clearInterval(timeoutId);
          resolve(i);
        }
      }, 20);
    });

    let currentProgress: IProgress;
    assetPromise.onProgress((progress) => {
      currentProgress = progress;
    });

    await assetPromise.then((e) => {
      expect(currentProgress).to.eql({
        task: {
          loaded: 10,
          total: 10
        }
      });
      expect(e).to.eq(10);
    });
  });

  it("promise immediately", async () => {
    let currentProgress: IProgress;
    const assetPromise = new AssetPromise<number>((resolve, reject, setProgress) => {
      setProgress({
        task: {
          loaded: 10,
          total: 10
        }
      });
      resolve(1);
    });

    assetPromise.onProgress((progress) => {
      currentProgress = progress;
    });

    await assetPromise.then((e) => {
      expect(currentProgress).to.eql({
        task: {
          loaded: 10,
          total: 10
        }
      });
      expect(e).to.eq(1);
    });
  });

  it("promise all basic", async () => {
    const promises = [];
    for (let i = 0; i < 10; i++) {
      const promise = new Promise((resolve) => {
        resolve(null);
      });
      promises.push(promise);
    }
    const progress = {
      task: {
        loaded: 1,
        total: 10
      }
    };
    await AssetPromise.all(promises).onProgress((p) => {
      expect(p).to.eql(progress);
      progress.task.loaded++;
    });
  });

  it("promise all mixed", async () => {
    const promises = [];
    for (let i = 0; i < 2; i++) {
      const promise = new Promise((resolve) => {
        resolve(null);
      });
      promises.push(promise);
    }
    for (let i = 0; i < 2; i++) {
      promises.push(i);
    }

    const expects = [null, null, 0, 1];
    const progress = {
      task: {
        loaded: 1,
        total: 4
      }
    };

    await AssetPromise.all(promises)
      .onProgress((p) => {
        expect(p).to.eql(progress);
        progress.task.loaded++;
      })
      .then((value) => {
        expect(value).to.eql(expects);
      });

    await AssetPromise.all([]).then((value) => {
      expect(value.length).to.equal(0);
    });
  });
});
