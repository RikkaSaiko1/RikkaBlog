import { Hono } from "hono";
import { authMiddleware } from "../middleware/auth";
import { adminMiddleware } from "../middleware/admin";
import type { Bindings } from "../types";

// 文章图片：POST 上传到 R2（仅管理员），GET 公开读取
const app = new Hono<{ Bindings: Bindings }>();

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};
const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

app.post("/image", authMiddleware, adminMiddleware, async (c) => {
  if (!c.env.IMAGES) return c.json({ success: false, message: "未配置 R2 存储桶（IMAGES）" }, 500);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ success: false, message: "缺少图片文件" }, 400);
  const ext = EXT_BY_MIME[file.type];
  if (!ext) return c.json({ success: false, message: "仅支持 png/jpg/gif/webp/avif/svg 图片" }, 400);
  if (file.size > MAX_IMAGE_SIZE) return c.json({ success: false, message: "图片不能超过 8MB" }, 400);

  const now = new Date();
  const key = `posts/${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${ext}`;
  await c.env.IMAGES.put(key, file, {
    httpMetadata: { contentType: file.type, cacheControl: IMMUTABLE_CACHE },
  });
  return c.json({ url: `/api/uploads/${key}` });
});

app.get("/:key{.+}", async (c) => {
  if (!c.env.IMAGES) return c.text("未配置 R2 存储桶（IMAGES）", 500);
  const key = c.req.param("key");
  if (!key.startsWith("posts/")) return c.text("Not found", 404);
  const object = await c.env.IMAGES.get(key);
  if (!object) return c.text("Not found", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", IMMUTABLE_CACHE);
  // SVG 可能内嵌脚本，同源直出有 XSS 风险，禁掉其内部的一切外部加载与脚本
  if (object.httpMetadata?.contentType === "image/svg+xml") headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");
  return new Response(object.body, { headers });
});

export default app;
