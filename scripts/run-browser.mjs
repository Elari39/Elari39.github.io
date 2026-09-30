import { spawn } from "node:child_process";
import { mkdir, open } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4322,
  base = `http://127.0.0.1:${port}`;
await mkdir(path.join(root, ".assets-raw"), { recursive: true });
const log = await open(path.join(root, ".assets-raw/preview.log"), "w");
let server;
try {
  // Never accidentally validate an unrelated process already listening on this port.
  let occupied = false;
  try {
    await fetch(base, { signal: AbortSignal.timeout(500) });
    occupied = true;
  } catch {}
  if (occupied) throw new Error(`${base} 已被占用`);
  server = spawn(
    process.execPath,
    [
      "node_modules/astro/bin/astro.mjs",
      "preview",
      "--ignore-lock",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    { cwd: root, stdio: ["ignore", log.fd, log.fd], windowsHide: true },
  );
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("预览服务提前退出");
    try {
      if ((await fetch(base, { signal: AbortSignal.timeout(500) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error("预览启动超时");
  const child = spawn(
    process.execPath,
    ["scripts/verify-browser.mjs", "--base", base],
    { cwd: root, stdio: "inherit", windowsHide: true },
  );
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) process.exitCode = 1;
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise((resolve) => server.once("exit", resolve));
    server.kill();
    await exited;
  }
  await log.close();
}
