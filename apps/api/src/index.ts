import { runMigrations } from "@repo/database";
import { createServer } from "./server";

const port = process.env.PORT || 3001;

runMigrations()
  .then(async () => {
    console.log("Migrations complete.");
    const { server, matchEngine, soloEngine } = createServer();
    await Promise.all([matchEngine.restore(), soloEngine.restore()]);
    server.listen(port, () => {
      console.log(`api running on ${port}`);
    });
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });

