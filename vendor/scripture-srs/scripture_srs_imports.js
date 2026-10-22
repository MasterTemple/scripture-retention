import { WasmBindgenModule } from "@boltffi/runtime";
import { __wbg_set_wasm } from "./scripture_srs_bg.js";
import * as importedModule0 from "./scripture_srs_bg.js";
export const wasmBindgen = new WasmBindgenModule({
    ["./scripture_srs_bg.js"]: {
        ["__wbindgen_init_externref_table"]: importedModule0["__wbindgen_init_externref_table"],
    },
}, __wbg_set_wasm);
//# sourceMappingURL=scripture_srs_imports.js.map