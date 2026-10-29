// Cloudflare R2 (S3 API) uploads, ported from mapfox's s3Client

import "server-only";

import { randomUUID } from "node:crypto";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.S3_REGION || "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY || "",
    secretAccessKey: process.env.S3_SECRET_KEY || "",
  },
});

function uniqueFilename(originalFilename: string) {
  const extension = originalFilename.split(".").pop();
  const name = originalFilename
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9-_]/g, "_");
  return `${name}_${Date.now()}_${randomUUID().slice(0, 8)}.${extension}`;
}

// Uploads a file and returns its public URL
export async function uploadImage(file: File, keyPrefix: string) {
  const bucket = process.env.S3_BUCKET_NAME;
  if (!bucket) throw new Error("S3_BUCKET_NAME is not configured");

  const key = `${keyPrefix}/${uniqueFilename(file.name)}`;
  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: Buffer.from(await file.arrayBuffer()),
      ContentType: file.type,
    }),
  );

  const publicBase = (
    process.env.S3_PUBLIC_URL ||
    process.env.S3_ENDPOINT ||
    ""
  ).replace(/\/$/, "");
  return `${publicBase}/${key}`;
}
