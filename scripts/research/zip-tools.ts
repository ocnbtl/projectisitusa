import {
  execFileSync,
  spawn,
} from "node:child_process";

function archiveReadCommand(archivePath: string, entry: string) {
  return process.platform === "win32"
    ? { command: "tar", args: ["-xO", "-f", archivePath, entry] }
    : { command: "unzip", args: ["-p", archivePath, entry] };
}

export function createZipArchive(
  directory: string,
  archivePath: string,
  entries: string[],
) {
  if (process.platform === "win32") {
    execFileSync("tar", ["-a", "-c", "-f", archivePath, ...entries], {
      cwd: directory,
    });
    return;
  }
  execFileSync("zip", ["-q", archivePath, ...entries], { cwd: directory });
}

export function listZipEntries(archivePath: string) {
  const output = process.platform === "win32"
    ? execFileSync("tar", ["-t", "-f", archivePath], { encoding: "utf8" })
    : execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function readZipEntry(
  archivePath: string,
  entry: string,
  maxBuffer: number,
) {
  const { command, args } = archiveReadCommand(archivePath, entry);
  return execFileSync(command, args, { maxBuffer });
}

export function spawnZipEntry(
  archivePath: string,
  entry: string,
) {
  const { command, args } = archiveReadCommand(archivePath, entry);
  return spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
}
