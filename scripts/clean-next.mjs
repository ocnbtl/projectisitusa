import { existsSync, rmSync } from "node:fs";
import path from "node:path";

const nextDir = path.join(process.cwd(), ".next");

if (existsSync(nextDir)) {
  rmSync(nextDir, { recursive: true, force: true });
  console.log("Cleared .next cache");
} else {
  console.log(".next cache not present");
}
