#!/usr/bin/env node

import { createServer } from "node:http";
import { hostname, platform } from "node:os";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PORT = Number(process.env.BAEBE_PRINTER_BRIDGE_PORT || 3210);
const SERVICE = "baebe-boo-printer-bridge";
const VERSION = "1.0.0";
const DEFAULT_ORIGINS = [
  "https://baebe-boo.jtechinnovations.tech",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];
const allowedOrigins = new Set(
  (process.env.BAEBE_PRINTER_ALLOWED_ORIGINS || DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

function command(commandName, args, { input, env, timeoutMs = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(commandName, args, {
      env: { ...process.env, ...(env || {}) },
      stdio: [input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${commandName} timed out.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const result = {
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      };
      if (code !== 0) {
        reject(new Error(result.stderr.trim() || `${commandName} exited with code ${code ?? "unknown"}.`));
        return;
      }
      resolve(result);
    });
    if (input) child.stdin.end(input);
  });
}

function parsePosixPrinters(printerOutput, deviceOutput) {
  const devices = new Map();
  for (const line of deviceOutput.split("\n")) {
    const match = line.match(/^device for (.+?):\s*(.+)$/);
    if (match) devices.set(match[1].trim(), match[2].trim());
  }

  return printerOutput
    .split("\n")
    .map((line) => line.match(/^printer (.+?) is (.+?)\.\s*(.*)$/))
    .filter(Boolean)
    .map((match) => {
      const name = match[1].trim();
      const state = match[2].trim();
      const details = match[3].trim().toLowerCase();
      const device = devices.get(name) || null;
      const enabled = !details.includes("disabled");
      return { name, state, device, enabled, connected: Boolean(device) && enabled };
    });
}

async function listPosixPrinters() {
  const [{ stdout: printers }, { stdout: devices }] = await Promise.all([
    command("lpstat", ["-p"]),
    command("lpstat", ["-v"]),
  ]);
  return parsePosixPrinters(printers, devices);
}

async function listWindowsPrinters() {
  const script = "$ErrorActionPreference='Stop'; @(Get-Printer | Select-Object Name,PrinterStatus,WorkOffline,PortName) | ConvertTo-Json -Compress";
  const { stdout } = await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
  const rows = JSON.parse(stdout || "[]");
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map((row) => ({
    name: String(row.Name || ""),
    state: String(row.PrinterStatus || "Unknown"),
    device: row.PortName ? String(row.PortName) : null,
    enabled: !Boolean(row.WorkOffline),
    connected: !Boolean(row.WorkOffline),
  })).filter((row) => row.name);
}

async function listPrinters() {
  if (platform() === "win32") return listWindowsPrinters();
  return listPosixPrinters();
}

async function printPosix(printer, title, bytes) {
  const directory = await mkdtemp(join(tmpdir(), "baebe-boo-local-print-"));
  const filePath = join(directory, "job.bin");
  await writeFile(filePath, bytes);
  try {
    const { stdout } = await command("lp", ["-d", printer, "-o", "raw", "-o", "job-sheets=none", "-t", title, filePath]);
    return stdout.trim() || `local-${Date.now()}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function printWindows(printer, title, bytes) {
  const directory = await mkdtemp(join(tmpdir(), "baebe-boo-local-print-"));
  const filePath = join(directory, "job.bin");
  await writeFile(filePath, bytes);
  const script = `
$ErrorActionPreference = 'Stop'
$source = @'
using System;
using System.Runtime.InteropServices;
public static class BaebeRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern int StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static void Send(string printer, string title, byte[] bytes) {
    if (!OpenPrinter(printer, out var handle, IntPtr.Zero)) throw new Exception("Could not open the selected printer.");
    try {
      var info = new DOCINFO { pDocName = title, pDataType = "RAW" };
      if (StartDocPrinter(handle, 1, info) == 0 || StartPagePrinter(handle) == 0 || !WritePrinter(handle, bytes, bytes.Length, out var written) || written != bytes.Length) throw new Exception("The printer rejected the raw job.");
      EndPagePrinter(handle); EndDocPrinter(handle);
    } finally { ClosePrinter(handle); }
  }
}
'@
Add-Type $source
[BaebeRawPrinter]::Send($env:BAEBE_PRINTER, $env:BAEBE_TITLE, [IO.File]::ReadAllBytes($env:BAEBE_JOB_FILE))
`;
  try {
    await command("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script], {
      env: { BAEBE_PRINTER: printer, BAEBE_TITLE: title, BAEBE_JOB_FILE: filePath },
      timeoutMs: 15000,
    });
    return `local-${Date.now()}`;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function printJob(printer, title, bytes) {
  return platform() === "win32" ? printWindows(printer, title, bytes) : printPosix(printer, title, bytes);
}

function json(res, status, payload, origin) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin || "null",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Private-Network": "true",
    Vary: "Origin",
  });
  res.end(JSON.stringify(payload));
}

function originFor(req) {
  const origin = req.headers.origin || "";
  return !origin || allowedOrigins.has(origin) ? origin : null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      length += chunk.length;
      if (length > 12 * 1024 * 1024) {
        reject(new Error("Print job is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("Invalid JSON request.")); }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = originFor(req);
  if (origin === null) {
    json(res, 403, { message: "This website is not allowed to use the local printer connector." }, "null");
    return;
  }
  if (req.method === "OPTIONS") {
    json(res, 204, {}, origin);
    return;
  }

  try {
    if (req.method === "GET" && req.url === "/health") {
      json(res, 200, { service: SERVICE, version: VERSION, host: hostname(), platform: platform() }, origin);
      return;
    }
    if (req.method === "GET" && req.url === "/v1/printers") {
      json(res, 200, { service: SERVICE, version: VERSION, host: hostname(), platform: platform(), printers: await listPrinters() }, origin);
      return;
    }
    if (req.method === "POST" && req.url === "/v1/print") {
      const payload = await readJson(req);
      const printer = typeof payload.printer === "string" ? payload.printer.trim() : "";
      const title = typeof payload.title === "string" ? payload.title.trim().slice(0, 128) : "Baebe Boo print job";
      const jobBase64 = typeof payload.jobBase64 === "string" ? payload.jobBase64 : "";
      if (!printer || !jobBase64) {
        json(res, 400, { message: "A printer and print job are required." }, origin);
        return;
      }
      const printers = await listPrinters();
      const selected = printers.find((candidate) => candidate.name === printer && candidate.connected);
      if (!selected) {
        json(res, 409, { message: "That printer is not connected to this workstation. Refresh the local printer list." }, origin);
        return;
      }
      const jobId = await printJob(printer, title, Buffer.from(jobBase64, "base64"));
      json(res, 200, { printed: true, printer, jobId }, origin);
      return;
    }
    json(res, 404, { message: "Local printer connector route not found." }, origin);
  } catch (error) {
    json(res, 503, { message: error instanceof Error ? error.message : "The local printer connector failed." }, origin);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`${SERVICE} ${VERSION} listening on http://127.0.0.1:${PORT}`);
  console.log(`Allowed origins: ${[...allowedOrigins].join(", ")}`);
});
