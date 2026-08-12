import { useEffect, useState } from "react";
import { api, type DimensionCopy } from "./api";

let cached: DimensionCopy[] | null = null;
let inFlight: Promise<DimensionCopy[]> | null = null;

async function loadDimensions(): Promise<DimensionCopy[]> {
  if (cached) return cached;
  if (!inFlight) {
    inFlight = api.getDimensions().then((res) => {
      cached = res.dimensions;
      return cached;
    });
  }
  return inFlight;
}

/** Dimension label/low/high text — fetched once from GET /dimensions and cached for the session (it's static content, not per-user data). */
export function useDimensions(): DimensionCopy[] {
  const [dimensions, setDimensions] = useState<DimensionCopy[]>(cached ?? []);

  useEffect(() => {
    let cancelled = false;
    loadDimensions().then((d) => {
      if (!cancelled) setDimensions(d);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return dimensions;
}
