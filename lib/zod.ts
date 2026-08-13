import { z } from "zod";

// Keep schema validation compatible with the production no-unsafe-eval CSP.
z.config({ jitless: true });

export { z };
