/**
 * Garante buckets max-docs (privado) e max-public (público).
 * Uso: npx tsx scripts/ensure-storage-buckets.ts
 */
import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env", override: false });

import { createAdminClient } from "../src/lib/supabase/admin";
import {
  docsBucket,
  publicBucket,
} from "../src/lib/storage/object-store";

async function ensure(bucket: string, isPublic: boolean) {
  const admin = createAdminClient();
  const { data: list, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw listErr;
  if (list?.some((b) => b.name === bucket)) {
    console.log(`OK  ${bucket} (já existe)`);
    return;
  }
  const { error } = await admin.storage.createBucket(bucket, {
    public: isPublic,
    fileSizeLimit: isPublic ? 5 * 1024 * 1024 : 52_428_800,
    allowedMimeTypes: isPublic
      ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
      : undefined,
  });
  if (error) throw error;
  console.log(`CRIADO  ${bucket} (${isPublic ? "público" : "privado"})`);
}

async function main() {
  await ensure(docsBucket(), false);
  await ensure(publicBucket(), true);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
