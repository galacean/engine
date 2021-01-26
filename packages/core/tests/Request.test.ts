import { MultiExecutor, request } from "../src/asset/request";

describe("MultiExecute", () => {
  it("multiple execute function", () => {
    return expect(
      new Promise((resolve) => {
        let i = 0;
        const multiExec = new MultiExecutor(
          () => {
            i++;
            return Promise.resolve();
          },
          5,
          100
        );
        multiExec.start(() => {
          resolve(i);
        });
      })
    ).resolves.toEqual(5);
  });

  it("multiple execute function stop", () => {
    return expect(
      new Promise((resolve) => {
        let i = 0;
        const multiExec = new MultiExecutor(
          () => {
            i++;
            if (i > 2) {
              resolve(i);
              multiExec.stop();
            }
            return Promise.resolve();
          },
          5,
          100
        );
        multiExec.start(() => {
          resolve(i);
        });
      })
    ).resolves.toEqual(3);
  });
});

describe("request", () => {
  it("request image", () => {
    const pp = request<HTMLImageElement>(
      "https://gw.alipayobjects.com/mdn/rms_af43d2/afts/img/A*02jzTq1WcikAAAAAAAAAAABkARQnAQ",
      {
        type: "image",
        timeout: 300,
        retryCount: 1
      }
    ).then((res) => {
      return { width: res.width, height: res.height };
    });
    return expect(pp).rejects.toEqual(new Error("request https://gw.alipayobjects.com/mdn/rms_af43d2/afts/img/A*02jzTq1WcikAAAAAAAAAAABkARQnAQ timeout"));
  });

  // it("request bin", () => {
  //   let lastP = 0;
  //   const promise = request<HTMLImageElement>(
  //     "https://gw.alipayobjects.com/os/OasisHub/b73b0309-3227-4b24-849a-8ec010fc7f7f/48000126/0.8387082619152928.bin"
  //   )
  //     .onProgress((p) => {
  //       expect(p).toBeGreaterThan(lastP);
  //       lastP = p;
  //     })
  //     .then((res) => {
  //       return "success";
  //     })
  //     .catch((e) => {
  //       return "failed";
  //     });

  //   return expect(promise).resolves.toEqual("success");
  // });

  it("request timeout", () => {
    const url =
      "https://gw.alipayobjects.com/os/OasisHub/b73b0309-3227-4b24-849a-8ec010fc7f7f/48000126/0.8387082619152928.bin";
    const promise = request<HTMLImageElement>(url, {
      timeout: 10,
      retryCount: 1
    }).catch((e) => {
      return e;
    });
    return expect(promise).resolves.toEqual(new Error(`request timeout from: ${url}`));
  });

  it("request onerror", () => {
    const url =
      "https://gw.alipayobjects.com/os/OasisHub/b73b0309-3227-4b24-849a-8ec010fc7f7f/48000126/0.8387082619152928";
    const promise = request<HTMLImageElement>(url, {
      retryCount: 1,
      headers: {
        key: "value"
      }
    });
    return expect(promise).rejects.toEqual(new Error(`request failed from: ${url}`));
  });
});
