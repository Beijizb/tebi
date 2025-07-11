开发一个基于 Cloudflare Worker 的 Tebi 双账号上传负载均衡器
 * 角色 (Role):
   你是一位顶级的全栈开发者，对 Serverless 架构（特别是 Cloudflare Workers）和 API 集成有深入的理解。你精通 TypeScript，并且非常熟悉 S3 兼容的对象存储协议。你的代码不仅要能工作，还要安全、高效且易于维护。
 * 上下文 (Context):
   我希望实现一个文件上传的负载均衡方案。我的客户端是 PicGo 这款图床上传工具。我的后端是两个独立的 Tebi 对象存储账号（账号A 和 账号B）。
我的目标是：通过一个统一的自定义域名入口，让 PicGo 上传的文件能自动、轮流地保存到这两个不同的 Tebi 账号中，从而分摊存储和流量。
为此，我需要你开发一个 Cloudflare Worker 作为中间层的 API 服务。这个 Worker 将作为 PicGo 的“自定义 Web 图床”的上传目标。
 * 核心任务 (Execution Task):
   请为我编写一个完整的 Cloudflare Worker 脚本（使用 TypeScript），实现以下功能：
<!-- end list -->
 * 接收请求: Worker 需要能接收并处理来自 PicGo 的 POST 请求，请求的 Content-Type 为 multipart/form-data。
 * 解析文件: 从请求中正确解析出上传的文件数据（二进制内容）和原始文件名。
 * 负载均衡逻辑:
   * 实现一个简单的“轮询”（Round Robin）算法。你可以使用一个全局变量或 Cloudflare KV（如果可以，请优先考虑全局变量的简单实现）来记录上一次使用的是哪个账号，以便下一次请求使用另一个。
   * 每次请求都根据算法选择一个目标账号（账号A 或 账号B）。
 * 安全凭证管理:
   * Worker 需要从环境变量中安全地读取两个 Tebi 账号的凭证。请使用以下环境变量名称：
     * 账号A: TEBI_A_ACCESS_KEY_ID, TEBI_A_SECRET_ACCESS_KEY, TEBI_A_BUCKET, TEBI_A_ENDPOINT
     * 账号B: TEBI_B_ACCESS_KEY_ID, TEBI_B_SECRET_ACCESS_KEY, TEBI_B_BUCKET, TEBI_B_ENDPOINT
 * 上传到 Tebi:
   * 根据选择的账号，使用对应的凭证和 S3 客户端库，将文件上传到 Tebi 的指定 Bucket 中。
   * 为了避免文件名冲突，上传到 Tebi 的文件名（Key）应该是唯一的。请使用 时间戳毫秒-随机字符串(6位)_原始文件名 的格式，例如 1678886400123-abcdef_screenshot.png。
 * 构造并返回响应:
   * 上传成功后，必须返回一个 JSON 对象给 PicGo。
   * 这个 JSON 对象需要严格遵循 PicGo “自定义 Web 图床”的要求，其中必须包含一个名为 url 的字段，其值为文件上传后在 Tebi 上的公开访问 URL。
<!-- end list -->
 * 工具与约束 (Tools & Constraints):
<!-- end list -->
 * 语言: TypeScript。
 * S3 客户端: 请使用官方的 @aws-sdk/client-s3 库，它是现代且功能强大的选择。
 * 代码质量: 代码必须包含清晰的注释，特别是负载均衡逻辑、环境变量读取和 S3 上传部分。
 * 错误处理: 必须实现健壮的错误处理。如果文件上传到 Tebi 失败，需要向 PicGo 返回一个包含错误信息的 JSON 响应。
<!-- end list -->
 * 示例 (Example):
<!-- end list -->
 * 请求: PicGo 发送一个 POST 请求，multipart/form-data 中包含一个名为 file 的字段（这是 PicGo 自定义Web图床的默认字段名）。
 * Worker 逻辑: 假设上次用了账号 A，这次 Worker 会选择账号 B 的凭证，将文件上传到账号 B 的 Bucket。
 * 成功响应 (返回给 PicGo):
   {
   "success": true,
   "url": "https://s3.tebi.io/bucket-b/1678886400123-abcdef_screenshot.png"
   }
 * 失败响应 (返回给 PicGo):
   {
   "success": false,
   "message": "Upload to Tebi failed: [具体错误信息]"
   }
<!-- end list -->
 * 输出格式 (Output Format):
 * Cloudflare Worker 代码: 提供完整的 index.ts 文件内容，包含所有必要的 import、类型定义和实现逻辑。
 * PicGo 配置指南: 在代码之后，请提供一个清晰、分步的指南，告诉我如何在 PicGo 的“自定义 Web 图床”插件中进行配置，以使其与你编写的 Worker 协同工作。这个指南应包括：
   * 设定 API 地址 (应该填我的自定义域名)
   * 设定请求方式 (POST)
   * 设定文件字段名 (默认是 file，如果你的代码有改动请指出)
   * 设定 JSON 路径 (应该填 url)
   * 设定自定义请求头 (如果需要的话，例如用于身份验证的 Authorization 头)

---

## Repository Contents

This repository provides a Cloudflare Worker script (`index.ts`) implementing the Tebi load-balancing uploader and a PicGo configuration guide (`PICGO_GUIDE.md`).

## Web Front-end

A lightweight HTML page is included (`frontend.html`) providing a modern interface for uploading files and viewing basic statistics. Deploy the worker and visit its root URL to access the UI. It communicates with `/upload` for uploads and `/info` for statistics.

## High concurrency considerations

Instead of storing account state globally, the worker randomly selects the target account for each request, avoiding contention when handling many concurrent uploads. Basic in-memory counters keep track of the number of uploads for insight during runtime.
