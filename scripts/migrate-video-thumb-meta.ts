import { migrateThumbSidecarsInDir } from "../src/lib/video-bmff-node";

async function main(): Promise<void> {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error(
      "usage: tsx scripts/migrate-video-thumb-meta.ts <library-dir>...",
    );
    process.exit(1);
  }

  let failed = 0;
  for (const root of roots) {
    const results = await migrateThumbSidecarsInDir(root, (message) => {
      console.log(message);
    });
    if (results.length === 0) {
      console.log(`${root}: sidecars 0`);
      continue;
    }
    for (const result of results) {
      if (result.action === "embedded") {
        console.log(
          `embedded ${result.seconds} ${result.mode} ${result.videoPath}`,
        );
        continue;
      }
      console.log(`${result.action} ${result.reason} ${result.videoPath}`);
      if (result.action === "kept-sidecar") {
        failed += 1;
      }
    }
  }

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
