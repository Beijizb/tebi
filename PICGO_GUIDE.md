# PicGo Custom Web Uploader Configuration

Use the following steps to connect PicGo with the Cloudflare Worker defined in `index.ts`.

1. **API URL**: set to your Worker domain, e.g. `https://upload.example.com/`.
2. **Request Method**: `POST`.
3. **File Field Name**: `file` (default value used by the Worker).
4. **JSON Path**: `url`.
5. **Custom Headers**: add any headers you require (e.g., `Authorization`) or leave blank.

After saving these settings, PicGo will send uploads to the Worker, which stores files in your Tebi buckets with automatic round-robin load balancing.
