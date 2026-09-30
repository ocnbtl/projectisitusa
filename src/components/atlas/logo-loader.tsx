import { NatureIcon, type NatureKind } from "./nature-icon";

const life: NatureKind[] = ["bird", "butterfly", "leaf", "mushroom"];

export function LogoLoader({ overlay = false, immediate = false }: { overlay?: boolean; immediate?: boolean }) {
  return <div className={`logo-loading ${overlay ? "is-overlay" : ""} ${immediate ? "is-ready" : ""}`} role="status">
    <div className="nature-loading" aria-hidden="true">{life.map(kind => <span className="nature-loading-icon" key={kind}><NatureIcon kind={kind} /></span>)}</div>
    <span className="sr-only">Loading page</span>
  </div>;
}
