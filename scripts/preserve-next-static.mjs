import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nextStaticDir = join(repoRoot, ".next", "static");
const archiveDir = join(repoRoot, ".next-static-archive");
const command = process.argv[2];

function copyMissingFiles(fromDir, toDir) {
  if (!existsSync(fromDir)) return 0;
  let copied = 0;
  const stack = [fromDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) continue;

    for (const entry of readdirSync(currentDir)) {
      const source = join(currentDir, entry);
      const destination = join(toDir, relative(fromDir, source));
      const stats = statSync(source);

      if (stats.isDirectory()) {
        stack.push(source);
        continue;
      }

      if (existsSync(destination)) continue;
      mkdirSync(dirname(destination), { recursive: true });
      cpSync(source, destination);
      copied += 1;
    }
  }

  return copied;
}

if (command === "snapshot") {
  rmSync(archiveDir, { recursive: true, force: true });
  if (existsSync(nextStaticDir)) {
    cpSync(nextStaticDir, archiveDir, { recursive: true });
    console.log("Preserved existing .next/static assets for this build.");
  }
  process.exit(0);
}

if (command === "restore") {
  const copied = copyMissingFiles(archiveDir, nextStaticDir);
  if (copied > 0) {
    console.log(`Restored ${copied} previous .next/static asset(s) missing from the new build.`);
  }
  process.exit(0);
}

console.error("Usage: node scripts/preserve-next-static.mjs <snapshot|restore>");
process.exit(1);
