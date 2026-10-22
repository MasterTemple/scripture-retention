
import init from "./scripture_srs.js";
export * from "./scripture_srs.js";
export { default as init } from "./scripture_srs.js";
export const initialized = (async () => {
  const response = await fetch(new URL("./scripture_srs_bg.wasm", import.meta.url));
  await init(response);
})();
