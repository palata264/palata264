import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const AUTHORS = new Set([
  "36427818-b713-44cf-9011-2e1ff0a42593",
  "9b0a0a33-4713-43b3-9948-6f41da5d9369"
]);

function getS3() {
  const required = ["CLOUD_TENANT_ID", "CLOUD_ACCESS_KEY_ID", "CLOUD_SECRET_ACCESS_KEY", "CLOUD_BUCKET"];
  for (const name of required) if (!process.env[name]) throw new Error(`Не задана переменная ${name}`);
  return new S3Client({
    region: "ru-central-1",
    endpoint: "https://s3.cloud.ru",
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: `${process.env.CLOUD_TENANT_ID}:${process.env.CLOUD_ACCESS_KEY_ID}`,
      secretAccessKey: process.env.CLOUD_SECRET_ACCESS_KEY
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  try {
    const key = String(req.query.key || "");
    const match = key.match(/^([0-9a-f-]{36})\/(puzzles|puzzles2)\/([a-zA-Z0-9._-]+)$/i);
    if (!match || !AUTHORS.has(match[1])) return res.status(400).json({ error: "Недопустимый ключ объекта." });
    const command = new GetObjectCommand({ Bucket: process.env.CLOUD_BUCKET, Key: key });
    const url = await getSignedUrl(getS3(), command, { expiresIn: 3600 });
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
    return res.status(200).json({ url });
  } catch (error) {
    console.error("cloud-read error", error);
    return res.status(500).json({ error: error.message || "Ошибка получения ссылки." });
  }
}
