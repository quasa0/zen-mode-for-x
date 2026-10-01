function homeEndpoint(value) {
  if (!value.startsWith("https://api.x.com/") && !value.startsWith("https://x.com/i/api/")) return null;
  const url = new URL(value);
  let path;
  if (url.origin === "https://api.x.com") path = url.pathname;
  else if (url.origin === "https://x.com" && url.pathname.startsWith("/i/api/")) path = url.pathname.slice("/i/api".length);
  const operation = path?.match(/^\/graphql\/[^/]+\/(Home(?:Latest)?Timeline)$/)?.[1];
  return operation ? { path, operation, url: url.origin + url.pathname } : null;
}

function validateHomeBody(result, phase) {
  const limit = 16 * 1024 * 1024;
  const size = result.base64Encoded ? Math.floor(result.body.length * 3 / 4) : Buffer.byteLength(result.body, "utf8");
  if (size > limit) throw new Error(`${phase} Home response exceeded the 16 MiB validation limit`);
  const body = result.base64Encoded ? Buffer.from(result.body, "base64") : Buffer.from(result.body, "utf8");
  let payload;
  try { payload = JSON.parse(body.toString("utf8")); }
  catch { throw new Error(`${phase} Home response was not valid JSON`); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error(`${phase} Home response was not a GraphQL object`);
  if (payload.error != null || payload.errors != null && (!Array.isArray(payload.errors) || payload.errors.length)) {
    throw new Error(`${phase} Home response contained GraphQL errors; its body was not replayed`);
  }
  if (!payload.data || typeof payload.data !== "object" || Array.isArray(payload.data)) throw new Error(`${phase} Home response had no GraphQL data`);
  const pending = [{ value: payload.data, depth: 0 }];
  for (let index = 0; index < pending.length; index++) {
    const { value, depth } = pending[index];
    if (Array.isArray(value.instructions)) return body;
    if (depth === 8) continue;
    for (const child of Object.values(value)) {
      if (!child || typeof child !== "object") continue;
      if (pending.length === 512) throw new Error(`${phase} Home response exceeded the timeline validation traversal limit`);
      pending.push({ value: child, depth: depth + 1 });
    }
  }
  throw new Error(`${phase} Home response had no timeline instructions`);
}

// CDP Response interception exposes the real status before fulfillment.
// https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Fetch.pdl
export class HomeFeedComparison {
  constructor(page) {
    this.page = page;
    this.mode = "idle";
    this.jobs = new Set();
    this.paused = new Set();
    this.responses = [];
    this.unsupportedEndpoints = new Set();
    this.sharedStatusIds = [];
    this.replayCount = 0;
    this.listener = (event) => {
      if (event.sessionId !== page.sessionId) return;
      const { method, params } = event;
      if (this.mode === "record" && method === "Network.responseReceived" && params.type !== "Preflight") {
        const endpoint = homeEndpoint(params.response.url);
        if (endpoint && params.response.status === 200 && !this.recordRequest) this.recordRequest = { requestId: params.requestId, endpoint };
      }
      if (this.mode === "record" && params.requestId === this.recordRequest?.requestId) {
        if (method === "Network.loadingFailed") this.error ??= new Error("The baseline Home feed response failed to finish loading");
        if (method === "Network.loadingFinished" && !this.recordTask) {
          this.recordTask = this.readBody().catch((error) => { this.error ??= error; });
          this.track(this.recordTask);
        }
      }
      if (method === "Fetch.requestPaused") {
        const request = {
          requestId: params.requestId, url: params.request.url, method: params.request.method,
          type: params.resourceType, status: params.responseStatusCode, error: params.responseErrorReason
        };
        this.paused.add(request.requestId);
        this.track(this.handlePaused(request).catch((error) => { this.error ??= error; }));
      }
    };
  }

  track(job) {
    this.jobs.add(job);
    job.finally(() => this.jobs.delete(job));
  }

  record() {
    if (this.mode !== "idle") throw new Error("Home feed recording has already started");
    this.mode = "record";
    this.page.browser.on("event", this.listener);
  }

  async readBody() {
    const result = await this.page.send("Network.getResponseBody", { requestId: this.recordRequest.requestId });
    const body = validateHomeBody(result, "Baseline");
    this.recorded = { ...this.recordRequest.endpoint, body: body.toString("base64") };
  }

  async ready({ signal } = {}) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      if (signal?.aborted) throw new Error("Home feed recording was stopped");
      if (this.error) throw this.error;
      if (this.recorded) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("No completed successful Home feed response was recorded for deterministic comparison");
  }

  async replay() {
    if (!this.recorded) throw new Error("Record the baseline Home feed before enabling replay");
    this.mode = "replay";
    this.fetchEnabled = true;
    const patterns = ["https://api.x.com/graphql/", "https://x.com/i/api/graphql/"].flatMap((prefix) =>
      ["HomeTimeline", "HomeLatestTimeline"].map((operation) => ({ urlPattern: `${prefix}*/${operation}*`, requestStage: "Response" })));
    await this.page.send("Fetch.enable", { patterns });
  }

  async handlePaused(request) {
    const endpoint = homeEndpoint(request.url);
    let observation;
    try {
      if (this.incompleteBodyRead) return;
      if (this.mode === "replay" && endpoint && request.type !== "Preflight" && request.method !== "OPTIONS") {
        observation = { endpoint: endpoint.url, operation: endpoint.operation, status: request.status ?? null, replayed: false };
        this.responses.push(observation);
        if (endpoint.path !== this.recorded.path) this.unsupportedEndpoints.add(endpoint.url);
        if (endpoint.path === this.recorded.path && request.status === 200 && !request.error && !this.replayAttempted) {
          this.replayAttempted = true;
          let result;
          try { result = await this.page.send("Fetch.getResponseBody", { requestId: request.requestId }); }
          catch (error) {
            this.incompleteBodyRead = true;
            throw new Error(`Could not finish reading the real Home response: ${error.message}`, { cause: error });
          }
          try { validateHomeBody(result, "Real enabled"); observation.bodyValidated = true; }
          catch (error) {
            observation.validationError = error.message;
            this.error ??= error;
            await this.page.send("Fetch.continueRequest", { requestId: request.requestId });
            this.paused.delete(request.requestId);
            return;
          }
          if (this.mode !== "replay") {
            await this.page.send("Fetch.continueRequest", { requestId: request.requestId });
            this.paused.delete(request.requestId);
            return;
          }
          await this.page.send("Fetch.fulfillRequest", {
            requestId: request.requestId, responseCode: request.status, body: this.recorded.body,
            responseHeaders: [
              { name: "Content-Type", value: "application/json; charset=utf-8" },
              { name: "Access-Control-Allow-Origin", value: "https://x.com" },
              { name: "Access-Control-Allow-Credentials", value: "true" }
            ]
          });
          observation.replayed = true;
          this.replayCount++;
          this.paused.delete(request.requestId);
          return;
        }
      }
      await this.page.send("Fetch.continueRequest", { requestId: request.requestId });
      this.paused.delete(request.requestId);
    } catch (error) {
      if (observation) observation.validationError ??= error.message;
      if (!this.incompleteBodyRead) {
        try {
          await this.page.send("Fetch.continueRequest", { requestId: request.requestId });
          this.paused.delete(request.requestId);
        } catch { /* stop() releases any request that remains paused. */ }
      }
      throw new Error(`Home feed response handling failed${observation ? ` for ${observation.endpoint}` : ""}: ${error.message}`, { cause: error });
    }
  }

  compare(baseline, enabled) {
    const ids = new Set(baseline.posts.map((post) => post.statusId).filter(Boolean));
    this.sharedStatusIds = [...new Set(enabled.posts.map((post) => post.statusId).filter((id) => id && ids.has(id)))];
    let reason;
    if (this.error) reason = this.error.message;
    else if (this.unsupportedEndpoints.size) reason = "Home feed endpoint changed between captures, including a possible Following tab switch";
    else if (this.replayCount !== 1) reason = "The enabled Home feed did not replay one real successful response";
    else if (baseline.postCount && enabled.postCount && !this.sharedStatusIds.length) reason = "Nonempty Home captures contain no shared post status IDs";
    if (reason) {
      const error = new Error(`Deterministic Home feed comparison failed: ${reason}`);
      error.feedComparison = this.report();
      throw error;
    }
  }

  report() {
    return {
      recordedEndpoint: this.recorded?.url, recordedOperation: this.recorded?.operation,
      replayedEndpoint: this.responses.find((response) => response.replayed)?.endpoint,
      replayCount: this.replayCount, responses: this.responses.map((response) => ({ ...response })),
      unsupportedEndpoints: [...this.unsupportedEndpoints], sharedStatusIds: [...this.sharedStatusIds],
      failure: this.error?.message
    };
  }

  async stop() {
    if (this.mode === "stopped" && !this.fetchEnabled && !this.paused.size) return;
    this.mode = "stopping";
    const failures = [];
    try {
      await Promise.allSettled([...this.jobs]);
      if (this.incompleteBodyRead) {
        // CDP forbids changing interception before response-body retrieval finishes.
        // Close the owned inspection target when retrieval failed or timed out.
        try {
          const { success } = await this.page.browser.send("Target.closeTarget", { targetId: this.page.targetId });
          if (!success) throw new Error("The inspection target did not close after response-body retrieval failed");
          this.fetchEnabled = false;
          this.paused.clear();
        } catch (error) { failures.push(error); }
      } else {
        for (const requestId of this.paused) {
          try { await this.page.send("Fetch.continueRequest", { requestId }); this.paused.delete(requestId); }
          catch (error) { failures.push(error); }
        }
        if (this.fetchEnabled) {
          try { await this.page.send("Fetch.disable"); this.fetchEnabled = false; this.paused.clear(); }
          catch (error) { failures.push(error); }
        }
      }
      await Promise.allSettled([...this.jobs]);
    } finally {
      this.page.browser.off("event", this.listener);
      this.recorded = this.recorded && { ...this.recorded, body: undefined };
      this.mode = "stopped";
    }
    if (failures.length) throw new AggregateError(failures, "Could not release Home feed response interception");
  }
}
