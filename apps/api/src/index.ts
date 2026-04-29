import { runMigrations } from "@repo/database";
import { createServer } from "./server";
import { log } from "@repo/logger";

const port = process.env.PORT || 3001;

runMigrations()
  .then(() => {
    log("Migrations complete.");
    const { server } = createServer();
    server.listen(port, () => {
      log(`api running on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
