import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({
  region: process.env.S3_REGION ?? "auto",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

function bucket(): string {
  if (!process.env.S3_BUCKET) throw new Error("S3_BUCKET is required");
  return process.env.S3_BUCKET;
}

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn },
  );
}

export async function headObject(key: string) {
  return s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Legacy JSON-key compatibility during attachment migration. */
export async function presignImages(
  keysJson: string | null,
  allowedPrefix?: string,
): Promise<string[]> {
  if (!keysJson) return [];

  let keys: string[] = [];
  try {
    keys = JSON.parse(keysJson);
  } catch {
    return [];
  }
  if (!Array.isArray(keys) || keys.length === 0) return [];

  const safeKeys = keys.filter(
    (key): key is string =>
      typeof key === "string" && (!allowedPrefix || key.startsWith(allowedPrefix)),
  );
  return Promise.all(safeKeys.map((key) => presignGet(key)));
}
