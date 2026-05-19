import app from "./app.js";
import { env } from "./config/env.js";
import { startScheduler } from "./lib/scheduler.js";
import { runYearlyAnniversary } from "./scripts/run-yearly-anniversary.js";

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
  startScheduler();
  runYearlyAnniversary()
    .then(() => console.log("[startup] Yearly anniversary check complete."))
    .catch((err) => console.error("[startup] Yearly anniversary check failed:", err));
});
