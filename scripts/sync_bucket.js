#!/usr/bin/env node
/**
 * ============================================================================
 * INTERFELLAS ASSET SYNC SCRIPT TO RAILWAY OBJECT STORAGE (ZERO-DEPENDENCY)
 * ============================================================================
 * Scans public/assets/ and uploads 3D models (.glb) directly to the Railway
 * S3-compatible bucket using the pure Node.js standard library.
 *
 * Usage:
 *   node scripts/sync_bucket.js
 */

const fs = require("fs");
const path = require("path");
const storage = require("../server/storage");

async function main() {
  console.log("==================================================================");
  console.log("🚀 INTERFELLAS 3D ASSET SYNC TO RAILWAY OBJECT STORAGE");
  console.log("==================================================================");

  if (!storage.isConfigured()) {
    console.error("❌ Storage is not configured in this environment.");
    console.error("Required Environment Variables:");
    console.error("  AWS_ENDPOINT_URL       e.g. https://t3.storageapi.dev");
    console.error("  AWS_S3_BUCKET_NAME     e.g. assets-fx35o85hyld5gfkxyw");
    console.error("  AWS_DEFAULT_REGION     e.g. auto");
    console.error("  AWS_ACCESS_KEY_ID      (configured automatically on Railway)");
    console.error("  AWS_SECRET_ACCESS_KEY  (configured automatically on Railway)");
    console.log("\n💡 Note: In Railway production, these are injected automatically via ${{assets.*}} references.");
    process.exit(1);
  }

  console.log(`Endpoint: ${storage.endpoint}`);
  console.log(`Bucket:   ${storage.bucket}`);
  console.log(`Region:   ${storage.region}\n`);

  const assetsDir = path.join(__dirname, "../public/assets");
  if (!fs.existsSync(assetsDir)) {
    console.error(`❌ Assets directory not found at: ${assetsDir}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(assetsDir).filter((file) => file.endsWith(".glb"));
  console.log(`Found ${allFiles.length} 3D .glb model file(s) to synchronize:\n`);

  let uploadedCount = 0;
  let totalBytes = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filename = allFiles[i];
    const filePath = path.join(assetsDir, filename);
    const stats = fs.statSync(filePath);
    const mbSize = (stats.size / (1024 * 1024)).toFixed(2);
    const key = `assets/${filename}`;

    process.stdout.write(`[${i + 1}/${allFiles.length}] Uploading ${filename} (${mbSize} MB)... `);

    try {
      const buffer = fs.readFileSync(filePath);
      await storage.putObject(key, buffer, "model/gltf-binary");
      uploadedCount++;
      totalBytes += stats.size;
      console.log("✅ OK");
    } catch (err) {
      console.log(`❌ FAILED: ${err.message}`);
    }
  }

  const totalMB = (totalBytes / (1024 * 1024)).toFixed(2);
  console.log("\n==================================================================");
  console.log(`🎉 Sync Complete! Successfully uploaded ${uploadedCount}/${allFiles.length} models (${totalMB} MB)`);
  console.log("==================================================================");
}

main().catch((err) => {
  console.error("Fatal sync error:", err);
  process.exit(1);
});
