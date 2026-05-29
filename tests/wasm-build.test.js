const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("Go WASM wrapper builds for browser use", () => {
  const workspace = path.resolve(__dirname, "..");
  const tempDir = mkdtempSync(path.join(tmpdir(), "mpln-wasm-"));

  try {
    const outPath = path.join(tempDir, "mpln.wasm");
    execFileSync("go", ["build", "-o", outPath, "./cmd/mplnwasm"], {
      cwd: workspace,
      env: {
        ...process.env,
        GOARCH: "wasm",
        GOOS: "js",
        GOCACHE: path.join(workspace, ".gocache"),
      },
      stdio: "pipe",
    });
    assert.ok(existsSync(outPath));
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
