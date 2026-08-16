// Load .env on the server. Next.js only injects env vars that are
// referenced via process.env.X at build time. Variables that are only
// read dynamically (e.g. inside route handlers) are not guaranteed to be
// in the runtime process.env, so we read the file directly and merge.
import { readFileSync, existsSync } from "fs";
import { join, dirname, resolve as resolvePath } from "path";

const ALREADY = Symbol.for("__HG_ENV_LOADED__");
const g = globalThis as unknown as { [k: symbol]: boolean };
if (!g[ALREADY]) {
  g[ALREADY] = true;

  function findEnvFile(): string | null {
    if (process.env.HG_ENV_FILE) {
      if (existsSync(process.env.HG_ENV_FILE)) return process.env.HG_ENV_FILE;
    }
    const candidates: string[] = [];
    // Walk up from cwd looking for a .env (capped at 10 levels)
    let dir = process.cwd();
    for (let i = 0; i < 10; i++) {
      candidates.push(join(dir, ".env"));
      candidates.push(join(dir, ".env.local"));
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return null;
  }

  const file = findEnvFile();
  if (file) {
    try {
      const content = readFileSync(file, "utf-8");
      for (const rawLine of content.split("\n")) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined || process.env[key] === "") {
          process.env[key] = value;
        }
      }
    } catch {
      // ignore
    }
  }
}
