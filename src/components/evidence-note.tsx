import { readableSourceNote } from "@/lib/ui/research-copy";

export function EvidenceNote({ note }: { note: string }) {
  if (!note) return null;
  const readable = readableSourceNote(note);
  return <div className="evidence-source-note"><p>{readable}</p>{readable !== note && <details className="research-record-details"><summary>Original research note</summary><p>{note}</p></details>}</div>;
}
