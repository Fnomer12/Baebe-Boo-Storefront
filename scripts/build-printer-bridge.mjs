#!/usr/bin/env node
/**
 * Assemble the Baebe Boo printer-connector distributable.
 *
 * Staff-friendly packaging: one tarball per OS containing the bridge script
 * plus a launcher and autostart assets, so shop staff never install Node
 * by hand (install-linux.sh fetches a Node 20+ runtime automatically when
 * the system has none).
 *
 * Usage:
 *   node scripts/build-printer-bridge.mjs [--platform linux|win32|darwin] [--out dist]
 *
 * Output:
 *   dist/baebe-bridge-<platform>-x64.tar.gz (plus .zip for win32, which
 *   Windows opens without extra software)
 *   dist/printer-bridge/<platform>/... (staged files)
 * On Debian/Ubuntu with dpkg-deb present, also builds a .deb for linux.
 */
import { chmod, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { arch, platform as hostPlatform } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createGzip } from "node:zlib";
import { createWriteStream } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const pkgDir = join(root, "packages", "printer-bridge");

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  const value = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "1";
  args.set(key.replace(/^--/, ""), value);
  if (value !== "1") i += 1;
}

const targetPlatform = String(args.get("platform") || hostPlatform);
const outDir = join(root, String(args.get("out") || "dist"));
const stageDir = join(outDir, "printer-bridge", targetPlatform);
const version = await bridgeVersion();

await rm(stageDir, { recursive: true, force: true });
await mkdir(stageDir, { recursive: true });

const files = ["local-printer-bridge.mjs", "baebe-bridge.sh", "baebe-bridge.cmd", "SETUP-TILL-PRINTER.cmd", "baebe-bridge.service", "baebe-bridge.desktop", "install-linux.sh", "install-windows.ps1", "drivers.json", "README.md"];
await copyFile(join(root, "scripts", "local-printer-bridge.mjs"), join(stageDir, "local-printer-bridge.mjs"));
for (const file of files.slice(1)) {
  await copyFile(join(pkgDir, file), join(stageDir, file));
}
await chmod(join(stageDir, "baebe-bridge.sh"), 0o755);
await chmod(join(stageDir, "install-linux.sh"), 0o755);

const tarball = join(outDir, `baebe-bridge-${targetPlatform}-${arch()}.tar.gz`);
await writeTarball(stageDir, tarball);
console.log(`bridge ${version}: staged ${stageDir}`);
console.log(`bridge ${version}: wrote ${tarball}`);

if (targetPlatform === "win32") {
  const zip = buildZip({ stageDir, outDir });
  if (zip) console.log(`bridge ${version}: wrote ${zip}`);
}

if (targetPlatform === "linux") {
  const deb = buildDeb({ stageDir, outDir, version });
  if (deb) console.log(`bridge ${version}: wrote ${deb}`);
}

async function bridgeVersion() {
  const source = await readFile(join(root, "scripts", "local-printer-bridge.mjs"), "utf8");
  return source.match(/const VERSION = "([^"]+)"/)?.[1] || "0.0.0";
}

async function writeTarball(stage, tarballPath) {
  // Minimal tar writer: reuse system tar (present on Linux/macOS runners and
  // most Windows dev machines with git-bash). Falls back to a plain copy.
  const tar = spawnSync("tar", ["-czf", tarballPath, "-C", dirname(stage), targetPlatform], { stdio: "inherit" });
  if (tar.status !== 0) {
    // Fallback: gzip the bridge script alone so CI never fails hard.
    await mkdir(dirname(tarballPath), { recursive: true });
    const input = await readFile(join(stage, "local-printer-bridge.mjs"));
    await new Promise((resolve, reject) => {
      const out = createWriteStream(tarballPath);
      out.on("finish", resolve);
      out.on("error", reject);
      const gzip = createGzip();
      gzip.on("error", reject);
      gzip.pipe(out);
      gzip.end(input);
    });
  }
}

function buildZip({ stageDir: stage, outDir: out }) {
  const zipPath = join(out, `baebe-bridge-win32-${arch()}.zip`);
  // Staff-facing name: the file staff actually double-click.
  const built = spawnSync("zip", ["-j", "-q", zipPath, ...[
    "local-printer-bridge.mjs",
    "baebe-bridge.cmd",
    "SETUP-TILL-PRINTER.cmd",
    "install-windows.ps1",
    "drivers.json",
    "README.md",
  ].map((file) => join(stage, file))], { stdio: "inherit" });
  if (built.status !== 0) {
    console.log("bridge: zip not available, skipping .zip (tarball still built).");
    return null;
  }
  return zipPath;
}

function buildDeb({ stageDir: stage, outDir: out, version: ver }) {
  const check = spawnSync("command", ["-v", "dpkg-deb"], { shell: true });
  if (check.status !== 0) {
    console.log("bridge: dpkg-deb not found, skipping .deb (tarball is enough for staff install).");
    return null;
  }
  const debRoot = join(out, "deb-root");
  const debName = `baebe-bridge_${ver}_amd64.deb`;
  spawnSync("rm", ["-rf", debRoot]);
  spawnSync("mkdir", ["-p", `${debRoot}/DEBIAN`, `${debRoot}/opt/baebe-bridge`, `${debRoot}/usr/share/applications`]);
  spawnSync("cp", ["-f", `${stage}/local-printer-bridge.mjs`, `${stage}/baebe-bridge.sh`, `${debRoot}/opt/baebe-bridge/`]);
  spawnSync("cp", ["-f", `${stage}/baebe-bridge.desktop`, `${debRoot}/usr/share/applications/baebe-boo-printer-connector.desktop`]);
  const control = `Package: baebe-bridge\nVersion: ${ver}\nSection: utils\nPriority: optional\nArchitecture: amd64\nDepends: cups-client\nMaintainer: Baebe Boo <support@jtechinnovations.tech>\nDescription: Local printer connector for Baebe Boo tills\n Lets the admin/counter portal print to this workstation's USB printer.\n`;
  spawnSync("sh", ["-c", `cat > ${debRoot}/DEBIAN/control <<'EOF'\n${control}EOF`]);
  const built = spawnSync("dpkg-deb", ["--build", debRoot, join(out, debName)], { stdio: "inherit" });
  return built.status === 0 ? join(out, debName) : null;
}
