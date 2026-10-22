import {
  execFileSync,
  spawn,
} from "node:child_process";
import { once } from "node:events";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { parse, type Options } from "csv-parse";

export type ArchiveLimits = { maxDecodedBytes?: number; maxRecordBytes?: number; timeoutMs?: number };

// Streaming backpressure alone does not bound a CSV field or an expanding archive.
export async function* boundedZipRecords(archivePath:string, entry:string, options:Options,
  onBytes?:(chunk:Buffer)=>void, limits:ArchiveLimits={}) {
  const maxDecodedBytes=limits.maxDecodedBytes??64*1024**3;
  const maxRecordBytes=limits.maxRecordBytes??1024**2;
  const timeoutMs=limits.timeoutMs??60*60*1000;
  if (![maxDecodedBytes,maxRecordBytes,timeoutMs].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error("Invalid archive processing budget.");
  const deadline=performance.now()+timeoutMs;
  const child=spawnZipEntry(archivePath,entry);
  const closed=once(child,"close") as Promise<[number|null,NodeJS.Signals|null]>;
  closed.catch(()=>undefined);
  let stderr="", decoded=0, physicalLineBytes=0, failure:Error|undefined;
  child.stderr.on("data",(chunk:Buffer)=>{stderr=(stderr+chunk.toString("utf8")).slice(0,16384);});
  const parser=parse({...options,max_record_size:maxRecordBytes});
  child.on("error",error=>parser.destroy(error));
  const budget=new Transform({transform(chunk:Buffer,_encoding,done){
    if(performance.now()>=deadline){done(new Error("Archive processing deadline exceeded."));return;}
    decoded+=chunk.length;
    if(decoded>maxDecodedBytes){done(new Error("Archive decoded-byte budget exceeded."));return;}
    // csv-parse excludes empty fields/delimiters from max_record_size. Bound raw
    // physical lines before parsing too, so delimiter-only rows cannot grow its
    // field array without limit. Quoted multiline fields retain the parser cap.
    for(const byte of chunk){
      if(byte===10||byte===13){physicalLineBytes=0;continue;}
      if(++physicalLineBytes>maxRecordBytes){done(new Error("Archive raw record size budget exceeded."));return;}
    }
    try{onBytes?.(chunk);done(null,chunk);}catch(error){done(error as Error);}
  }});
  const timer=setTimeout(()=>parser.destroy(new Error("Archive processing deadline exceeded.")),timeoutMs);
  timer.unref();
  const pumping=pipeline(child.stdout,budget,parser).catch(error=>{failure=error;parser.destroy(error);});
  try {
    for await(const record of parser) {
      if(performance.now()>=deadline)throw new Error("Archive processing deadline exceeded.");
      yield record;
    }
    await pumping;
    if(failure)throw failure;
    const [code,signal]=await closed;
    if(code!==0)throw new Error(`Archive extraction failed (${code??signal}): ${stderr.trim()}`);
  } finally {
    clearTimeout(timer);
    parser.destroy();budget.destroy();child.stdout.destroy();
    if(child.exitCode===null&&child.signalCode===null)child.kill("SIGTERM");
    const force=setTimeout(()=>{if(child.exitCode===null&&child.signalCode===null)child.kill("SIGKILL");},1000);
    force.unref();
    await closed.catch(()=>undefined);clearTimeout(force);await pumping;
  }
}

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
