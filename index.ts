import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cloudflare Worker for uploading files to Tebi with round-robin load balancing between two accounts.
 *
 * Environment variables expected by this Worker:
 * - TEBI_A_ACCESS_KEY_ID
 * - TEBI_A_SECRET_ACCESS_KEY
 * - TEBI_A_BUCKET
 * - TEBI_A_ENDPOINT
 * - TEBI_B_ACCESS_KEY_ID
 * - TEBI_B_SECRET_ACCESS_KEY
 * - TEBI_B_BUCKET
 * - TEBI_B_ENDPOINT
 */

interface Env {
  TEBI_A_ACCESS_KEY_ID: string;
  TEBI_A_SECRET_ACCESS_KEY: string;
  TEBI_A_BUCKET: string;
  TEBI_A_ENDPOINT: string;
  TEBI_B_ACCESS_KEY_ID: string;
  TEBI_B_SECRET_ACCESS_KEY: string;
  TEBI_B_BUCKET: string;
  TEBI_B_ENDPOINT: string;
}

// Global flag used for simple round-robin selection
let useAccountA = true;

/**
 * Upload the provided file to Tebi using the specified account credentials.
 * Returns the public URL of the uploaded object.
 */
async function uploadFile(
  file: File,
  account: { accessKeyId: string; secretAccessKey: string; bucket: string; endpoint: string }
): Promise<string> {
  const client = new S3Client({
    region: "us-east-1",
    credentials: {
      accessKeyId: account.accessKeyId,
      secretAccessKey: account.secretAccessKey,
    },
    endpoint: account.endpoint,
    forcePathStyle: true, // Tebi uses path-style URLs like https://s3.tebi.io/bucket/key
  });

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}_${file.name}`;

  await client.send(
    new PutObjectCommand({
      Bucket: account.bucket,
      Key: key,
      Body: await file.arrayBuffer(),
      ContentType: file.type || "application/octet-stream",
    })
  );

  // Construct public URL of uploaded file
  const trimmed = account.endpoint.replace(/\/$/, "");
  return `${trimmed}/${account.bucket}/${key}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, message: "Method Not Allowed" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response(
          JSON.stringify({ success: false, message: "File field not found" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Determine which account to use
      const account = useAccountA
        ? {
            accessKeyId: env.TEBI_A_ACCESS_KEY_ID,
            secretAccessKey: env.TEBI_A_SECRET_ACCESS_KEY,
            bucket: env.TEBI_A_BUCKET,
            endpoint: env.TEBI_A_ENDPOINT,
          }
        : {
            accessKeyId: env.TEBI_B_ACCESS_KEY_ID,
            secretAccessKey: env.TEBI_B_SECRET_ACCESS_KEY,
            bucket: env.TEBI_B_BUCKET,
            endpoint: env.TEBI_B_ENDPOINT,
          };

      // Toggle for next request
      useAccountA = !useAccountA;

      const url = await uploadFile(file, account);

      return new Response(JSON.stringify({ success: true, url }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ success: false, message: `Upload to Tebi failed: ${err.message || err}` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
