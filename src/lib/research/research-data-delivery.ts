export interface ResearchDataDelivery {
  schemaVersion: 2;
  mode: "github" | "r2";
  github: {
    repository: "ocnbtl/projectisitusa";
    rootPath: "public/generated/research";
  };
  r2: {
    origin: string;
    pointerPath: "current.json";
  };
}

export function validateResearchDataDelivery(value: unknown): ResearchDataDelivery {
  if (!value || typeof value !== "object") {
    throw new Error("Research data delivery configuration must be an object.");
  }
  const delivery = value as ResearchDataDelivery;
  if (
    delivery.schemaVersion !== 2 ||
    !["github", "r2"].includes(delivery.mode) ||
    delivery.github?.repository !== "ocnbtl/projectisitusa" ||
    delivery.github?.rootPath !== "public/generated/research" ||
    typeof delivery.r2?.origin !== "string" ||
    delivery.r2?.pointerPath !== "current.json"
  ) {
    throw new Error("Research data delivery configuration has an invalid identity.");
  }
  const origin = new URL(delivery.r2.origin);
  if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("Research data R2 origin must be an HTTPS origin without a path, query, or fragment.");
  }
  return delivery;
}
