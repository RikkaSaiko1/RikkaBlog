import { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, sql } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { posts } from "../db/schema";
import type { Bindings } from "../types";

type Variables = {
  db: DrizzleD1Database<typeof schema>;
};

const app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();

// 列表响应字段：正文 contentMd 只在详情接口返回，避免列表把全文塞进响应拖慢加载
function postListDto(post: typeof posts.$inferSelect) {
  return {
    id: post.id,
    authorId: post.authorId,
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    cover: post.cover,
    tags: post.tags,
    category: post.category,
    readingTime: post.readingTime,
    viewCount: post.viewCount,
    frontmatter: post.frontmatter,
    status: post.status,
    publishedAt: post.publishedAt ? post.publishedAt.toISOString() : null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

app.get("/", async (c) => {
  const db = c.get("db");
  const page = Math.max(1, Number(c.req.query("page") || "1"));
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") || "10")));

  const rows = await db
    .select()
    .from(posts)
    .where(eq(posts.status, "published"))
    .orderBy(desc(posts.publishedAt), desc(posts.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const totalRow = await db
    .select({ count: sql<number>`count(*)`, totalViews: sql<number>`coalesce(sum(${posts.viewCount}), 0)` })
    .from(posts)
    .where(eq(posts.status, "published"))
    .get();

  return c.json({
    items: rows.map(postListDto),
    pagination: {
      page,
      pageSize,
      total: Number(totalRow?.count ?? 0),
      totalViews: Number(totalRow?.totalViews ?? 0),
    },
  });
});

app.get("/:slug", async (c) => {
  const db = c.get("db");
  const slug = c.req.param("slug");

  const post = await db
    .select()
    .from(posts)
    .where(and(eq(posts.slug, slug), eq(posts.status, "published")))
    .get();

  if (!post) {
    return c.json({ code: 404, message: "文章不存在" }, 404);
  }

  const [viewedPost] = await db
    .update(posts)
    .set({ viewCount: sql`${posts.viewCount} + 1` })
    .where(eq(posts.id, post.id))
    .returning({ viewCount: posts.viewCount });

  return c.json({
    ...postListDto(post),
    contentMd: post.contentMd,
    viewCount: viewedPost?.viewCount ?? post.viewCount + 1,
  });
});

export default app;
