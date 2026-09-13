import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const BRIDGE = join(process.cwd(), "scripts", "local-printer-bridge.mjs");

/** A port nothing listens on right now (probed, not guessed). */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function runBridge(args: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [BRIDGE, ...args], {
      env: { ...process.env, ...env },
      timeout: 15000,
    });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk: Buffer) => { out += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, out }));
  });
}

describe("printer bridge startup", () => {
  it(
    "--doctor reports readiness without binding the port",
    async () => {
      const port = await freePort();
      const { code, out } = await runBridge(["--doctor"], { BAEBE_PRINTER_BRIDGE_PORT: String(port) });
      expect([0, 1]).toContain(code);
      expect(out).toMatch(/^(OK|FAIL|INFO)/m);
      expect(out).not.toMatch(/listen EADDRINUSE/);
      expect(out).toContain(`Port ${port} configured.`);
    },
    20000,
  );

  it(
    "--doctor fails closed on a garbage port",
    async () => {
      const { code, out } = await runBridge(["--doctor"], { BAEBE_PRINTER_BRIDGE_PORT: "abc" });
      expect(code).toBe(1);
      expect(out).toMatch(/not a valid port/);
    },
    20000,
  );

  it(
    "a second instance on a taken port exits with a plain message, not a stack",
    async () => {
      const port = await freePort();
      const first = spawn(process.execPath, [BRIDGE], {
        env: { ...process.env, BAEBE_PRINTER_BRIDGE_PORT: String(port) },
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("first instance never listened")), 10000);
          first.stdout.on("data", (chunk: Buffer) => {
            if (chunk.toString().includes("listening on")) {
              clearTimeout(timer);
              resolve();
            }
          });
          first.on("error", reject);
        });
        const second = await runBridge([], { BAEBE_PRINTER_BRIDGE_PORT: String(port) });
        expect(second.code).toBe(2);
        expect(second.out).toMatch(/already in use/);
        expect(second.out).not.toMatch(/at Server\.setupListenHandle/);
      } finally {
        first.kill("SIGTERM");
      }
    },
    20000,
  );
});
