import { CATEGORY_NATURE, NatureIcon } from "./nature-icon";

const categories = ["wildlife", "plants", "insects", "fungi-diseases"] as const;

export function LogoLoader({ overlay = false, immediate = false }: { overlay?: boolean; immediate?: boolean }) {
  return <div className={`logo-loading ${overlay ? "is-overlay" : ""} ${immediate ? "is-ready" : ""}`} role="status">
    <div className="nature-loading" aria-hidden="true">
      {categories.map(category => (
        <span className={`nature-loading-icon category-${category}`} key={category}>
          <NatureIcon kind={CATEGORY_NATURE[category]} width={26} height={26} />
        </span>
      ))}
    </div>
    <span className="sr-only">Loading page</span>
  </div>;
}
