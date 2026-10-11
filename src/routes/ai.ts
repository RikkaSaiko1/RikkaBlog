import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, ne } from "drizzle-orm";
import {
  AiChatSchema,
  AiCompletePostSchema,
  AiCompleteProjectSchema,
  AiFillFriendLinkSchema,
  AiGeneratePageSchema,
  AiPolishMomentSchema,
  AiPolishPageSchema,
} from "../../common/validators/ai.schema";
import { authMiddleware } from "../middleware/auth";
import { adminMiddleware } from "../middleware/admin";
import {
  chatWithConfig,
  completePostWithConfig,
  completeProjectWithConfig,
  generatePageWithConfig,
  listModelsWithConfig,
  makeUniqueSlug,
  polishFriendLinkWithConfig,
  polishMomentWithConfig,
  polishPageWithConfig,
} from "../services/ai";
import { fetchLinkMetadata, normalizeUrl } from "../services/linkMeta";
import { getSiteConfig } from "./siteConfig";
import type { Bindings } from "../types";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { pages, posts } from "../db/schema";

type Variables = {
  db: DrizzleD1Database<typeof schema>;
  user: typeof schema.users.$inferSelect;
};

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
app.use("/*", authMiddleware, adminMiddleware);

// 友链抓取环节的可读错误（链接不合法/内网受限/无法访问/非网页/过大/提取失败）→ 502
const LINK_META_ERROR_PREFIXES = [
  "链接格式不合法",
  "仅支持",
  "不允许访问内网地址",
  "无法访问目标网站",
  "目标网站",
  "未能从目标网页",
];

function aiError(error: unknown): { message: string; status: 500 | 502 | 503 } {
  const message = error instanceof Error ? error.message : "AI 调用失败";
  if (message === "AI 服务未配置 API Key") return { message, status: 503 };
  if (LINK_META_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))) return { message, status: 502 };
  if (message.startsWith("AI 服务调用失败") || message.startsWith("AI 服务返回非 JSON")) {
    return { message, status: 502 };
  }
  return { message, status: 500 };
}

function parseTags(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function getTaxonomy(db: DrizzleD1Database<typeof schema>) {
  const rows = await db.select({ category: posts.category, tags: posts.tags }).from(posts);
  return {
    categories: [...new Set(rows.map((row) => row.category?.trim()).filter((item): item is string => Boolean(item)))].sort(),
    tags: [...new Set(rows.flatMap((row) => parseTags(row.tags)).map((tag) => tag.trim()).filter(Boolean))].sort(),
  };
}

app.post("/chat", async (c) => {
  const parsed = AiChatSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    console.error("AI chat 参数校验失败:", JSON.stringify(parsed.error.issues));
    return c.json({ code: 400, message: "问答参数不合法" }, 400);
  }

  try {
    const config = await getSiteConfig(c.get("db"));
    const reply = await chatWithConfig(config.aiConfig, parsed.data.messages, parsed.data.context);
    return c.json({ reply });
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.post("/complete-post", async (c) => {
  const parsed = AiCompletePostSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    console.error("AI complete-post 参数校验失败:", JSON.stringify(parsed.error.issues));
    return c.json({ code: 400, message: "文章补全参数不合法" }, 400);
  }

  try {
    const db = c.get("db");
    const config = await getSiteConfig(db);
    const result = await completePostWithConfig(
      config.aiConfig,
      parsed.data.fields,
      parsed.data.context,
      await getTaxonomy(db),
    );

    if (result.slug) {
      result.slug = await makeUniqueSlug(result.slug, async (slug) => {
        const condition = parsed.data.postId
          ? and(eq(posts.slug, slug), ne(posts.id, parsed.data.postId))
          : eq(posts.slug, slug);
        return Boolean(await db.select({ id: posts.id }).from(posts).where(condition).get());
      });
    }
    return c.json(result);
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.post("/polish-moment", async (c) => {
  const parsed = AiPolishMomentSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ code: 400, message: "参数不合法" }, 400);

  try {
    const config = await getSiteConfig(c.get("db"));
    const contentMd = await polishMomentWithConfig(config.aiConfig, parsed.data.contentMd, parsed.data.mode);
    return c.json({ contentMd });
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.post("/complete-project", async (c) => {
  const parsed = AiCompleteProjectSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ code: 400, message: "参数不合法" }, 400);

  try {
    const config = await getSiteConfig(c.get("db"));
    const result = await completeProjectWithConfig(config.aiConfig, parsed.data.text);
    return c.json(result);
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.post("/polish-page", async (c) => {
  const parsed = AiPolishPageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ code: 400, message: "参数不合法" }, 400);

  try {
    const config = await getSiteConfig(c.get("db"));
    const result = await polishPageWithConfig(config.aiConfig, parsed.data.contentMd);
    return c.json(result);
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.post("/generate-page", async (c) => {
  const parsed = AiGeneratePageSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ code: 400, message: "参数不合法" }, 400);

  try {
    const db = c.get("db");
    const config = await getSiteConfig(db);
    const result = await generatePageWithConfig(config.aiConfig, parsed.data.title);

    result.slug = await makeUniqueSlug(result.slug, async (slug) => {
      return Boolean(await db.select({ id: pages.id }).from(pages).where(eq(pages.slug, slug)).get());
    });
    return c.json(result);
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.post("/fill-friend-link", async (c) => {
  const parsed = AiFillFriendLinkSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ code: 400, message: "参数不合法" }, 400);

  const url = normalizeUrl(parsed.data.url);
  if (!url) return c.json({ code: 400, message: "链接格式不合法" }, 400);

  try {
    // 本地开发环境放行 localhost 抓取（便于测试），生产环境保持 SSRF 防护
    const allowLocal = (c.env.APP_BASE_URL ?? "").includes("localhost");
    // 抓取目标站元信息；失败不阻断，降级为仅凭网址让 AI 整理
    const meta = await fetchLinkMetadata(url, { allowLocal }).catch((error) => {
      console.warn("友链目标站抓取失败，改为仅依据网址整理", error);
      return undefined;
    });
    const config = await getSiteConfig(c.get("db"));
    const result = await polishFriendLinkWithConfig(config.aiConfig, url, meta);
    return c.json(result);
  } catch (error) {
    const { message, status } = aiError(error);
    return c.json({ code: status, message }, status);
  }
});

app.get("/models", async (c) => {
  try {
    const config = await getSiteConfig(c.get("db"));
    const models = await listModelsWithConfig(config.aiConfig);
    return c.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取模型列表失败";
    const status = message === "AI 服务未配置 API Key" ? 503 : 502;
    return c.json({ code: status, message }, status);
  }
});

export default app;
