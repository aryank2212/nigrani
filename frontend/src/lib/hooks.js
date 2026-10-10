import { useEffect, useMemo, useState } from "react";
import { useDb, now as storeNow } from "./store.js";
import { enrich } from "./enrich.js";
import { MIN } from "./time.js";

// Current simulated time; re-renders every 30s and whenever the demo clock is advanced.
export function useNow() {
  const db = useDb();
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((x) => x + 1), 30_000);
    return () => clearInterval(i);
  }, []);
  return Date.now() + db.settings.clockOffset;
}

export function useIncidents() {
  const db = useDb();
  const now = useNow();
  const bucket = Math.floor(now / MIN);
  return useMemo(() => db.incidents.map((i) => enrich(i, db, storeNow())), [db, bucket]);
}

export const useIncident = (id) => useIncidents().find((i) => i.id === id) ?? null;

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | Nigrani` : "Nigrani | Pollution complaints that can't be ignored";
  }, [title]);
}
