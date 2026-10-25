import { permanentRedirect } from "next/navigation";

/** Preserve existing bookmarks while keeping all support options together. */
export default function Page() { permanentRedirect("/support#help-for-free"); }
