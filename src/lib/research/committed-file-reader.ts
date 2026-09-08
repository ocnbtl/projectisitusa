import { execFileSync } from "node:child_process";
import path from "node:path";

export class CommittedFileReader {
  private readonly entries = new Map<string, Buffer>();
  private retainedBytes = 0;

  constructor(
    private readonly maximumBytes = 64 * 1024 * 1024,
    private readonly maximumEntryBytes = 8 * 1024 * 1024,
    private readonly maximumEntries = 512,
  ) {
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 0 ||
        !Number.isSafeInteger(maximumEntryBytes) || maximumEntryBytes < 0 ||
        !Number.isSafeInteger(maximumEntries) || maximumEntries < 1) {
      throw new Error("Committed file cache limits must be nonnegative integers.");
    }
  }

  read(repositoryRoot: string, commit: string, filePath: string): Buffer {
    if (!/^[a-f0-9]{40}$/u.test(commit)) {
      throw new Error("Committed file reads require an immutable full Git SHA.");
    }
    if (!filePath || filePath.includes("\0") || path.posix.isAbsolute(filePath) ||
        path.win32.isAbsolute(filePath) || filePath.split(/[\\/]/u).includes("..")) {
      throw new Error("Committed file reads require a safe repository-relative path.");
    }
    const root = path.resolve(repositoryRoot);
    const key = root + "\0" + commit + "\0" + filePath;
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      // Callers cannot mutate bytes reused by another validation.
      return Buffer.from(cached);
    }

    // Failed reads and mutable working-tree files are never cached.
    const bytes = execFileSync("git", ["-C", root, "show", commit + ":" + filePath], {
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    if (bytes.length <= this.maximumEntryBytes && bytes.length <= this.maximumBytes &&
        this.maximumBytes > 0) {
      while (this.entries.size && (this.retainedBytes + bytes.length > this.maximumBytes ||
             this.entries.size >= this.maximumEntries)) {
        const oldest = this.entries.keys().next().value!;
        this.retainedBytes -= this.entries.get(oldest)!.length;
        this.entries.delete(oldest);
      }
      this.entries.set(key, Buffer.from(bytes));
      this.retainedBytes += bytes.length;
    }
    return bytes;
  }
}
