import Image from "next/image";

export function LogoLoader({ overlay = false, immediate = false }: { overlay?: boolean; immediate?: boolean }) {
  return <div className={`logo-loading ${overlay ? "is-overlay" : ""} ${immediate ? "is-ready" : ""}`} role="status" aria-label="Loading page">
    <Image src="/isitusa-logo.png" width={76} height={74} alt="" priority />
    <span className="sr-only">Loading page</span>
  </div>;
}
