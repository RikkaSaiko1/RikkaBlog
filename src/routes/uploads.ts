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

// 读取放行媒体类型对象（图片 + 视频），其余 key 一律 404
const MEDIA_KEY = /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i;

// 解析 Range 头：仅支持单段 bytes=start-[end] 格式
function parseRange(header: string): { offset: number; length?: number } | null {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const start = Number(match[1]);
  if (!Number.isSafeInteger(start)) return null;
  if (match[2] === "") return { offset: start };
  const end = Number(match[2]);
  if (!Number.isSafeInteger(end) || end < start) return null;
  return { offset: start, length: end - start + 1 };
}

app.get("/:key{.+}", async (c) => {
  if (!c.env.IMAGES) return c.text("未配置 R2 存储桶（IMAGES）", 500);
  const key = c.req.param("key");
  if (!MEDIA_KEY.test(key)) return c.text("Not found", 404);

  // 视频拖动进度条与 Safari 播放依赖 Range 分段响应（206）
  const rangeHeader = c.req.header("Range");
  const range = rangeHeader ? parseRange(rangeHeader) : null;

  let object: R2ObjectBody | null;
  try {
    object = (range ? await c.env.IMAGES.get(key, { range }) : await c.env.IMAGES.get(key)) as R2ObjectBody | null;
  } catch {
    // R2 对超出文件大小的 range 会抛错
    return new Response(null, { status: 416, headers: { "content-range": `bytes */0` } });
  }
  if (!object) return c.text("Not found", 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", IMMUTABLE_CACHE);
  headers.set("accept-ranges", "bytes");
  // SVG 可能内嵌脚本，同源直出有 XSS 风险，禁掉其内部的一切外部加载与脚本
  if (object.httpMetadata?.contentType === "image/svg+xml") headers.set("content-security-policy", "default-src 'none'; style-src 'unsafe-inline'");

  const rangeInfo = object.range as { offset?: number; length?: number } | undefined;
  if (range && rangeInfo && typeof rangeInfo.offset === "number") {
    const offset = rangeInfo.offset;
    const length = rangeInfo.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { headers, status: 206 });
  }
  return new Response(object.body, { headers });
});

export default app;
