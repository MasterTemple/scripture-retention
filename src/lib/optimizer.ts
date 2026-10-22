import type { Verse } from "@/core/schedule";
import type { OptimizeRequest, OptimizeResponse } from "./optimizer.worker";

/** What fitting FSRS found: its parameters, and how many reviews (from how many verses) it learned from */
export interface Fitted {
  params: number[];
  reviews: number;
  verses: number;
}

/** FSRS's parameters fitted to the verses' reviews, in a worker (it takes a moment with many) */
export function optimizeFsrs(verses: Verse[]): Promise<Fitted> {
  const worker = new Worker(new URL("./optimizer.worker.ts", import.meta.url), { type: "module" });
  return new Promise<Fitted>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<OptimizeResponse>) => {
      const result = event.data;
      if (result.ok) resolve({ params: result.params, reviews: result.reviews, verses: result.verses });
      else reject(new Error(result.error));
    };
    worker.onerror = (event) => reject(new Error(event.message || "The optimizer couldn't start"));
    worker.postMessage({ verses } satisfies OptimizeRequest);
  }).finally(() => worker.terminate());
}
