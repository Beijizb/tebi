import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Common headers for JSON responses with CORS enabled
function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(JSON.stringify(body), { ...init, headers });
}

// Handle CORS preflight requests
function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * Enhanced Cloudflare Worker for uploading files to Tebi with basic load
 * balancing and a small web UI. Designed to handle many concurrent
 * requests by avoiding global state when selecting the upload account.
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

interface Account {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
}

let cachedAccounts: { A: Account; B: Account } | null = null;

function getAccounts(env: Env): { A: Account; B: Account } {
  if (!cachedAccounts) {
    cachedAccounts = {
      A: {
        accessKeyId: env.TEBI_A_ACCESS_KEY_ID,
        secretAccessKey: env.TEBI_A_SECRET_ACCESS_KEY,
        bucket: env.TEBI_A_BUCKET,
        endpoint: env.TEBI_A_ENDPOINT,
      },
      B: {
        accessKeyId: env.TEBI_B_ACCESS_KEY_ID,
        secretAccessKey: env.TEBI_B_SECRET_ACCESS_KEY,
        bucket: env.TEBI_B_BUCKET,
        endpoint: env.TEBI_B_ENDPOINT,
      },
    };
  }
  return cachedAccounts;
}

// Simple in-memory stats. These reset when the Worker restarts but
// provide basic insight during runtime.
const stats = {
  byAccountA: 0,
  byAccountB: 0,
  total: 0,
};

const html = await (async () => {
  const decoder = new TextDecoder();
  const data = await fetch(new URL('./frontend.html', import.meta.url)).then(r => r.arrayBuffer());
  return decoder.decode(data);
})();

/**
 * Upload the provided file to Tebi using the specified account credentials.
 * Returns the public URL of the uploaded object.
 */
async function uploadFile(file: File, account: Account): Promise<string> {
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

function chooseAccount(env: Env): { account: Account; name: "A" | "B" } {
  const { A, B } = getAccounts(env);
  // Use random selection to avoid contention between concurrent requests
  const useA = Math.random() < 0.5;
  if (useA) {
    return { account: A, name: "A" };
  }
  return { account: B, name: "B" };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    // Serve the simple web UI
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Return upload statistics
    if (request.method === "GET" && url.pathname === "/info") {
      return jsonResponse(stats);
    }

    // File upload endpoint
    if (request.method === "POST" && url.pathname === "/upload") {
      try {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof File)) {
          return jsonResponse(
            { success: false, message: "File field not found" },
            { status: 400 }
          );
        }

        const { account, name } = chooseAccount(env);
        const url = await uploadFile(file, account);

        if (name === "A") stats.byAccountA++; else stats.byAccountB++;
        stats.total++;

        return jsonResponse({ success: true, url });
      } catch (err: any) {
        return jsonResponse(
          { success: false, message: `Upload to Tebi failed: ${err.message || err}` },
          { status: 500 }
        );
      }
    }

    return jsonResponse({ success: false, message: "Not Found" }, { status: 404 });
  },
};
