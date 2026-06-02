import { existsSync } from "node:fs";
import { join } from "node:path";

const generatedDir = join(process.cwd(), "src", "generated", "prisma");
const requiredEngine = join(
  generatedDir,
  "libquery_engine-rhel-openssl-3.0.x.so.node",
);

if (!existsSync(requiredEngine)) {
  console.error(
    [
      "Prisma generated client is missing the Vercel Linux query engine.",
      `Expected: ${requiredEngine}`,
      'Run "prisma generate" with binaryTargets including "rhel-openssl-3.0.x".',
    ].join("\n"),
  );
  process.exit(1);
}
