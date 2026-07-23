import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, test } from "node:test";
import {
  AcceptanceError,
  W3CWebDriverClient,
  WebDriverProtocolError,
  classifyRunError,
  createPublicTarget,
  createRequestedCapabilities,
  deriveOverallStatus,
  exitCodeForStatus,
  redactForReport,
  sha256
} from "./water-optics-p1-safari-device-acceptance.mjs";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : undefined;
}

describe("Safari W3C client without Safari", () => {
  let server;
  let endpoint;
  const requests = [];

  before(async () => {
    server = createServer(async (request, response) => {
      const body = await readJson(request);
      requests.push({ method: request.method, url: request.url, body });
      response.setHeader("content-type", "application/json");
      if (request.method === "GET" && request.url === "/status") {
        response.end(JSON.stringify({ value: { ready: true } }));
      } else if (request.method === "POST" && request.url === "/session") {
        response.end(JSON.stringify({ value: { sessionId: "mock-session", capabilities: { browserName: "safari" } } }));
      } else if (request.method === "GET" && request.url === "/session/mock-session/window/rect") {
        response.end(JSON.stringify({ value: { x: 0, y: 0, width: 1280, height: 720 } }));
      } else if (request.method === "POST" && request.url === "/session/mock-session/execute/sync") {
        response.end(JSON.stringify({ value: { echoedArgs: body.args } }));
      } else if (request.method === "POST" && request.url === "/session/mock-session/execute/async") {
        response.end(JSON.stringify({ value: { ok: true, value: body.args } }));
      } else if (request.method === "GET" && request.url === "/session/mock-session/screenshot") {
        response.end(JSON.stringify({ value: Buffer.from("89504e470d0a1a0a00", "hex").toString("base64") }));
      } else if (request.method === "POST" && request.url === "/session/protocol-error") {
        response.statusCode = 500;
        response.end(
          JSON.stringify({ value: { error: "session not created", message: "Allow Remote Automation is disabled." } })
        );
      } else {
        response.end(JSON.stringify({ value: null }));
      }
    });
    await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    endpoint = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise((resolveClose, rejectClose) =>
      server.close((error) => (error ? rejectClose(error) : resolveClose()))
    );
  });

  test("implements session, script, screenshot, and cleanup commands", async () => {
    const client = new W3CWebDriverClient(endpoint);
    assert.deepEqual(await client.status(), { ready: true });
    const session = await client.createSession({ alwaysMatch: { browserName: "safari" }, firstMatch: [{}] });
    assert.equal(session.sessionId, "mock-session");
    await client.setTimeouts({ script: 1_000 });
    await client.setWindowRect({ width: 1280, height: 720 });
    assert.deepEqual(await client.getWindowRect(), { x: 0, y: 0, width: 1280, height: 720 });
    await client.navigate("http://example.test/");
    assert.deepEqual(await client.execute("return arguments[0];", [42]), { echoedArgs: [42] });
    assert.deepEqual(await client.executeAsync("arguments[1](arguments[0]);", ["ok"]), {
      ok: true,
      value: ["ok"]
    });
    assert.equal(
      Buffer.from(await client.screenshot(), "base64")
        .subarray(0, 8)
        .toString("hex"),
      "89504e470d0a1a0a"
    );
    await client.deleteSession();
    assert.equal(requests.at(-1).method, "DELETE");
    assert.equal(requests.at(-1).url, "/session/mock-session");
  });

  test("maps W3C protocol failures without depending on Safari", async () => {
    const client = new W3CWebDriverClient(endpoint);
    await assert.rejects(
      () => client.request("POST", "/session/protocol-error", {}, "Create Safari session"),
      (error) => {
        assert(error instanceof WebDriverProtocolError);
        assert.equal(error.errorCode, "session not created");
        assert.match(error.message, /Allow Remote Automation is disabled/);
        return true;
      }
    );
  });
});

describe("Safari device capability and result policy", () => {
  test("supports macOS, simulator, and physical-device capability shapes", () => {
    const mac = createRequestedCapabilities({ kind: "macos", platformVersion: "", udid: "" });
    assert.equal(mac.alwaysMatch.platformName, "macOS");
    assert.equal(mac.alwaysMatch["safari:deviceUDID"], undefined);

    const simulator = createRequestedCapabilities({
      kind: "ios-simulator",
      platformVersion: "18.0",
      deviceType: "iPhone",
      deviceName: "iPhone 16 Pro",
      udid: "simulator-udid"
    });
    assert.equal(simulator.alwaysMatch.platformName, "iOS");
    assert.equal(simulator.alwaysMatch["safari:useSimulator"], true);
    assert.equal(simulator.alwaysMatch["safari:deviceUDID"], "simulator-udid");

    const device = createRequestedCapabilities({
      kind: "ios-device",
      platformVersion: "18.0",
      deviceType: "iPhone",
      deviceName: "Test iPhone",
      udid: "private-device-udid"
    });
    assert.equal(device.alwaysMatch["safari:useSimulator"], false);
    assert.equal(device.alwaysMatch["safari:deviceUDID"], "private-device-udid");
    const publicTarget = createPublicTarget({
      kind: "ios-device",
      platformVersion: "18.0",
      deviceType: "iPhone",
      deviceName: "Test iPhone",
      udid: "private-device-udid"
    });
    assert.equal(publicTarget.udidSha256, sha256("private-device-udid"));
    assert.equal(JSON.stringify(publicTarget).includes("private-device-udid"), false);
    const sanitized = redactForReport({ target: publicTarget, sessionCapabilities: device.alwaysMatch }, [
      "private-device-udid"
    ]);
    assert.equal(sanitized.target.udidSha256, sha256("private-device-udid"));
    assert.equal(sanitized.sessionCapabilities["safari:deviceUDIDSha256"], sha256("private-device-udid"));
    assert.equal(JSON.stringify(sanitized).includes("private-device-udid"), false);
  });

  test("keeps blocked, failed, incomplete, and passed outcomes distinct", () => {
    assert.deepEqual(classifyRunError(new Error("Allow Remote Automation is disabled.")), {
      status: "blocked",
      reason: "platform-environment-blocked"
    });
    assert.deepEqual(classifyRunError(new AcceptanceError("semantic mismatch"), { sessionCreated: true }), {
      status: "failed",
      reason: "acceptance-failed"
    });
    assert.deepEqual(
      classifyRunError(new WebDriverProtocolError("connection lost"), {
        sessionCreated: true,
        evidenceProduced: true
      }),
      { status: "incomplete", reason: "webdriver-disconnected-after-evidence" }
    );
    assert.equal(deriveOverallStatus([{ status: "passed" }, { status: "passed" }]), "passed");
    assert.equal(deriveOverallStatus([{ status: "passed" }, { status: "blocked" }]), "incomplete");
    assert.equal(deriveOverallStatus([{ status: "failed" }]), "failed");
    assert.equal(deriveOverallStatus([], [{ reason: "webdriver-unavailable" }]), "blocked");
    assert.deepEqual(["passed", "failed", "blocked", "incomplete"].map(exitCodeForStatus), [0, 1, 2, 2]);
  });
});
