import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Windows PowerShell 5.1 decodes a BOM-less script using the system ANSI code
 * page. A UTF-8 em dash then becomes U+201D (a closing quote to the PowerShell
 * parser), which once broke the whole installer with
 * "Unexpected token 'aborting'". Till scripts must stay pure ASCII forever.
 */
describe("till scripts stay ASCII-only", () => {
  const files = [
    "packages/printer-bridge/install-windows.ps1",
    "packages/printer-bridge/baebe-bridge.cmd",
    "packages/printer-bridge/SETUP-TILL-PRINTER.cmd",
    "packages/printer-bridge/baebe-bridge.sh",
    "packages/printer-bridge/install-linux.sh",
    "packages/printer-bridge/drivers.json",
  ];

  for (const file of files) {
    it(`${file} contains only ASCII`, () => {
      const content = readFileSync(join(process.cwd(), file), "utf8");
      // eslint-disable-next-line no-control-regex
      const bad = content.match(/[^\x00-\x7F]/g);
      expect(bad, `${file} has non-ASCII chars: ${JSON.stringify(bad?.slice(0, 5))}`).toBeNull();
    });
  }
});
