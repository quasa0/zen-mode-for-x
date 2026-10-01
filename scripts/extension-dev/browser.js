import { spawn, execFile } from "node:child_process";
import { EventEmitter, once } from "node:events";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const executables = {
  helium: "/Applications/Helium.app/Contents/MacOS/Helium",
  chrome: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
};

// Native CDP pipe transport. Source references are in README.md.
export class Browser extends EventEmitter {
  pending = new Map();
  sequence = 0;
  buffer = Buffer.alloc(0);
  pages = new Set();
  closing = false;
  detachedSessions = new Set();

  static async launch({ browser = "helium", profile, headless = true, logPath, automation = true, url = "about:blank" }) {
    if (!executables[browser]) throw new Error(`Unknown browser: ${browser}`);
    if (!automation && headless) throw new Error("Normal browser sessions require a visible window");
    await mkdir(profile, { recursive: true, mode: 0o700 });
    await mkdir(dirname(logPath), { recursive: true });
    const connection = new Browser();
    connection.automation = automation;
    connection.log = createWriteStream(logPath, { flags: "a", mode: 0o600 });
    connection.log.on("error", (error) => {
      connection.disconnected = error;
      connection.fail(error);
      connection.process?.kill("SIGTERM");
    });
    connection.pidPath = `${logPath}.pid`;
    const args = [
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...(automation
        ? ["--remote-debugging-pipe", ...(headless ? ["--headless=new"] : [])]
        : ["--disable-extensions", url]),
    ];
    connection.process = spawn(executables[browser], args, {
      stdio: automation ? ["ignore", "ignore", "pipe", "pipe", "pipe"] : ["ignore", "ignore", "pipe"],
    });
    const child = connection.process;
    connection.exited = new Promise((resolve) => { child.once("close", resolve); child.once("error", resolve); });
    child.stderr.pipe(connection.log);
    const disconnect = (error) => { connection.disconnected = error; connection.fail(error); };
    child.once("error", disconnect);
    child.once("exit", () => disconnect(new Error("Browser exited")));
    if (automation) {
      child.stdio[3].on("error", disconnect);
      child.stdio[4].on("error", disconnect);
      child.stdio[4].once("close", () => disconnect(new Error("CDP pipe closed")));
      child.stdio[4].on("data", (data) => connection.receive(data));
    }
    try {
      await once(child, "spawn");
      if (child.pid) await writeFile(connection.pidPath, String(child.pid), { mode: 0o600 });
      if (!automation) return connection;
      connection.version = await connection.send("Browser.getVersion");
      await connection.send("Extensions.getExtensions");
      return connection;
    } catch (error) {
      await connection.close();
      throw new Error(`${automation ? "Browser extension automation is unavailable" : "Browser launch failed"}: ${error.message}. See ${logPath}`);
    }
  }

  receive(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    let end;
    while ((end = this.buffer.indexOf(0)) !== -1) {
      const raw = this.buffer.subarray(0, end).toString("utf8");
      this.buffer = this.buffer.subarray(end + 1);
      if (!raw) continue;
      let message;
      try {
        message = JSON.parse(raw);
      } catch (error) {
        this.fail(error);
        return;
      }
      const call = this.pending.get(message.id);
      if (call) {
        this.pending.delete(message.id);
        clearTimeout(call.timer);
        if (message.error) call.reject(new Error(`${call.method}: ${message.error.message}`));
        else call.resolve(message.result);
      } else if (message.method) {
        if (message.method === "Target.detachedFromTarget") {
          this.detachedSessions.add(message.params.sessionId);
          this.fail(new Error("Browser target detached"), message.params.sessionId);
        }
        this.emit("event", message);
      }
    }
  }

  fail(error, sessionId) {
    for (const [id, call] of this.pending) {
      if (sessionId && call.sessionId !== sessionId) continue;
      clearTimeout(call.timer);
      this.pending.delete(id);
      call.reject(error);
    }
  }

  send(method, params = {}, sessionId, timeout = 15000) {
    if (!this.automation) return Promise.reject(new Error("This normal browser session has no CDP connection"));
    if (this.disconnected) return Promise.reject(this.disconnected);
    if (this.detachedSessions.has(sessionId)) return Promise.reject(new Error("Browser target detached"));
    if (this.process.exitCode !== null || this.process.signalCode !== null) {
      return Promise.reject(new Error("Browser is closed"));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeout);
      this.pending.set(id, { method, resolve, reject, timer, sessionId });
      this.process.stdio[3].write(JSON.stringify({ id, method, params, sessionId }) + "\0");
    });
  }

  async page(url = "about:blank") {
    const { targetId } = await this.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new Page(this, targetId, sessionId);
    this.pages.add(page);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Log.enable");
    await page.send("Network.enable");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
    });
    if (url !== "about:blank") await page.navigate(url);
    return page;
  }

  async close() {
    if (this.closePromise) return this.closePromise;
    this.closing = true;
    this.closePromise = (async () => {
      const child = this.process;
      if (!child) return;
      if (!child.pid) { this.log.end(); return; }
      const waitForExit = async (milliseconds) => {
        let timer;
        try {
          return await Promise.race([this.exited.then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), milliseconds); })]);
        } finally { clearTimeout(timer); }
      };
      // Record descendants before shutdown so a failed browser cannot leave helpers running.
      const descendants = [];
      try {
        const { stdout } = await execute("ps", ["-axo", "pid=,ppid="]);
        const rows = stdout.trim().split("\n").map((line) => line.trim().split(/\s+/).map(Number));
        const parents = new Set([child.pid]);
        let added;
        do {
          added = false;
          for (const [pid, ppid] of rows) {
            if (parents.has(ppid) && !parents.has(pid)) {
              descendants.push(pid);
              parents.add(pid);
              added = true;
            }
          }
        } while (added);
      } catch { /* The owned browser still receives shutdown signals when ps is unavailable. */ }
      let forcedShutdown = false;
      if (this.automation) {
        await this.send("Browser.close", {}, undefined, 2000).catch(() => {});
        await waitForExit(10000);
      } else if (child.exitCode === null && child.signalCode === null) {
        // On macOS, SIGINT calls Chromium's AttemptExit and flushes the profile.
        // SIGTERM calls SessionEnding and can discard pending cookie writes.
        // https://github.com/chromium/chromium/blob/154.0.8037.92/chrome/browser/chrome_browser_main_posix.cc
        child.kill("SIGINT");
        await waitForExit(10000);
      }
      if (child.exitCode === null && child.signalCode === null) {
        forcedShutdown = true;
        child.kill("SIGTERM");
        await waitForExit(1000);
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        // A helper can hold inherited pipes open after the browser exits.
        // Stop descendants before requiring the child close event.
        await waitForExit(1000);
      }
      for (const pid of descendants.reverse()) {
        try { process.kill(pid, "SIGTERM"); } catch { /* Already stopped. */ }
      }
      const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
      for (let attempt = 0; attempt < 10 && descendants.some(alive); attempt++) await delay(100);
      for (const pid of descendants.filter(alive)) {
        try { process.kill(pid, "SIGKILL"); } catch { /* Already stopped. */ }
      }
      for (let attempt = 0; attempt < 10 && descendants.some(alive); attempt++) await delay(100);
      if (descendants.some(alive)) throw new Error(`Browser helpers did not exit: ${descendants.filter(alive).join(", ")}`);
      if (child.exitCode === null && child.signalCode === null) throw new Error(`Browser did not exit: ${child.pid}`);
      if (!await waitForExit(1000)) {
        for (const stream of child.stdio) stream?.destroy?.();
        if (!await waitForExit(1000)) throw new Error("Browser pipes did not close after process cleanup");
      }
      this.fail(new Error("Browser closed"));
      this.log.end();
      await rm(this.pidPath, { force: true });
      if (forcedShutdown) throw new Error("Browser required a forced shutdown; recent profile changes may not have been saved");
    })();
    return this.closePromise;
  }
}

export class Page {
  errors = [];
  console = [];
  network = [];
  constructor(browser, targetId, sessionId) {
    this.browser = browser;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.listener = (event) => {
      if (event.sessionId !== this.sessionId) return;
      if (event.method === "Runtime.exceptionThrown") this.errors.push(event.params.exceptionDetails);
      if (event.method === "Runtime.consoleAPICalled") this.console.push(event.params);
      if (event.method === "Log.entryAdded" && event.params.entry.level === "error") this.errors.push(event.params.entry);
      if (event.method === "Network.responseReceived") {
        const { response, type } = event.params;
        const url = new URL(response.url);
        if (["http:", "https:", "chrome-extension:"].includes(url.protocol)) {
          const origin = url.protocol === "chrome-extension:" ? `chrome-extension://${url.host}` : url.origin;
          this.network.push({ url: origin + url.pathname, status: response.status, type });
        }
      }
      this.errors = this.errors.slice(-200);
      this.console = this.console.slice(-200);
      this.network = this.network.slice(-200);
    };
    browser.on("event", this.listener);
  }
  send(method, params = {}) { return this.browser.send(method, params, this.sessionId); }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async wait(expression, timeout = 15000) {
    const deadline = Date.now() + timeout;
    let lastError;
    while (Date.now() < deadline) {
      try { if (await this.evaluate(expression)) return; } catch (error) { lastError = error; }
      await delay(100);
    }
    throw new Error(`Page condition failed: ${expression}${lastError ? ` (${lastError.message})` : ""}`);
  }
  async navigate(url, attempt = 0) {
    const result = await this.send("Page.navigate", { url });
    // Installation can ask Chrome to reload an X tab while its first navigation is pending.
    if (result.errorText === "net::ERR_ABORTED" && attempt < 2) {
      await delay(100);
      return this.navigate(url, attempt + 1);
    }
    if (result.errorText) throw new Error(`Navigation failed: ${result.errorText}`);
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const { frameTree } = await this.send("Page.getFrameTree");
      if ((!result.loaderId || frameTree.frame.loaderId === result.loaderId) && await this.evaluate("document.readyState === 'complete'")) return;
      await delay(100);
    }
    throw new Error(`Navigation did not complete: ${url}`);
  }
  async screenshot(path) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    await writeFile(path, Buffer.from(data, "base64"), { mode: 0o600 });
  }
  async close() {
    this.browser.off("event", this.listener);
    this.browser.pages.delete(this);
    await this.browser.send("Target.closeTarget", { targetId: this.targetId }).catch(() => {});
  }
}
