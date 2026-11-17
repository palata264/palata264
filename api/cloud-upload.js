import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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

async function verifyAuthor(req) {
  const authorization = req.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  if (!process.env.TATNET_URL || !process.env.TATNET_ANON_KEY) throw new Error("Не заданы TATNET_URL и TATNET_ANON_KEY");
  const response = await fetch(`${process.env.TATNET_URL.replace(/\/$/, "")}/auth/v1/user`, {
    headers: {
      apikey: process.env.TATNET_ANON_KEY,
      Authorization: authorization
    }
  });
  if (!response.ok) return null;
  const user = await response.json();
  return user?.id && AUTHORS.has(user.id) ? user : null;
}

function safeName(value) {
  const name = String(value || "file").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return name || "file";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const user = await verifyAuthor(req);
    if (!user) return res.status(401).json({ error: "Нужен вход под аккаунтом автора." });

    const { folder, fileName, contentType } = req.body || {};
    if (!["puzzles", "puzzles2"].includes(folder)) return res.status(400).json({ error: "Недопустимый раздел." });
    const type = String(contentType || "application/octet-stream").slice(0, 150);
    const key = `${user.id}/${folder}/${crypto.randomUUID()}_${safeName(fileName)}`;
    const command = new PutObjectCommand({
      Bucket: process.env.CLOUD_BUCKET,
      Key: key,
      ContentType: type
    });
    const uploadUrl = await getSignedUrl(getS3(), command, { expiresIn: 600 });
    return res.status(200).json({ uploadUrl, objectKey: key });
  } catch (error) {
    console.error("cloud-upload error", error);
    return res.status(500).json({ error: error.message || "Ошибка подготовки загрузки." });
  }
}
