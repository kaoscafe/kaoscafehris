import app from "./app.js";
import { env } from "./config/env.js";
import { startScheduler } from "./lib/scheduler.js";

app.listen(env.port, () => {
  console.log(`Server running on port ${env.port} [${env.nodeEnv}]`);
  startScheduler();
});
