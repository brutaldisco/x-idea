import { loadLocalEnv } from "@/db/load-env";
import { applyMigration } from "@/db/migrate";
import { seed } from "@/db/seed";

loadLocalEnv();

const command = process.argv[2] ?? "migrate";

async function main() {
  if (command === "seed") {
    await seed();
    console.log("seed ok");
    return;
  }
  const result = await applyMigration();
  console.log(JSON.stringify(result));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
