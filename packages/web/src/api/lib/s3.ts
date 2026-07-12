import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

export async function presignGet(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }),
    { expiresIn },
  );
}

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
