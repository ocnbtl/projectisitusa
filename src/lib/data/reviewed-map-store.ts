"use client";

import { useEffect, useState } from "react";
import { applicationResearchSnapshot, fetchApplicationResearchJson } from "@/lib/research/application-research-fetch";

export interface ReviewedMapData {
  schemaVersion: 1;
  sourceCommit: string;
  asOf: string;
  speciesIds: string[];
  countyLabels: Record<string, { name: string; stateCode: string }>;
  occurrenceByCounty: Record<string, number[]>;
  temporalExceptions: Record<string, Record<string, {
    historicalOccurrenceStatus?: string;
    currentDeterminationStatus?: string;
    conflict: boolean;
  }>>;
}
export function validateReviewedMapData(value: unknown): ReviewedMapData {
  if (!value || typeof value !== "object") throw new Error("Invalid reviewed map dataset.");
  const data = value as ReviewedMapData;
  if (data.schemaVersion !== 1 || data.sourceCommit !== applicationResearchSnapshot.sourceCommit ||
      data.asOf !== applicationResearchSnapshot.asOf || !Array.isArray(data.speciesIds) ||
      data.speciesIds.some(id => typeof id !== "string" || !id) ||
      new Set(data.speciesIds).size !== data.speciesIds.length ||
      !data.occurrenceByCounty || Object.keys(data.occurrenceByCounty).length !== 3144 ||
      !data.countyLabels || Object.keys(data.countyLabels).length !== 3144 ||
      !data.temporalExceptions || typeof data.temporalExceptions !== "object") {
    throw new Error("Reviewed map dataset identity or geography is invalid.");
  }
  for (const [fips, ordinals] of Object.entries(data.occurrenceByCounty)) {
    const label = data.countyLabels[fips];
    if (!/^\d{5}$/u.test(fips) || !label || typeof label.name !== "string" || !/^[A-Z]{2}$/u.test(label.stateCode) ||
        !Array.isArray(ordinals) || ordinals.some((ordinal, i) => !Number.isSafeInteger(ordinal) ||
          ordinal < 0 || ordinal >= data.speciesIds.length || (i > 0 && ordinal <= ordinals[i - 1]))) {
      throw new Error("Reviewed map county membership is invalid.");
    }
  }
  return data;
}
let mapPromise: Promise<ReviewedMapData> | null = null;
let cachedMap: ReviewedMapData | null = null;
function load() {
  if (cachedMap) return Promise.resolve(cachedMap);
  if (!mapPromise) {
    mapPromise = fetchApplicationResearchJson("map-index.json").then(validateReviewedMapData).then(value => {
      cachedMap = value; return value;
    }).catch(error => { mapPromise = null; throw error; });
  }
  return mapPromise;
}
export function useReviewedMapData() {
  const [data, setData] = useState<ReviewedMapData | null>(cachedMap);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    load().then(value => { if (!cancelled) setData(value); })
      .catch(() => { if (!cancelled) setError("The reviewed occurrence snapshot could not load. Try again."); });
    return () => { cancelled = true; };
  }, [attempt]);
  return { data, error, retry: () => setAttempt(value => value + 1) };
}
