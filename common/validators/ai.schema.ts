import { z } from "@hono/zod-openapi";

export const AiChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const AiPostContextSchema = z.object({
  title: z.string().max(200),
  slug: z.string().max(120),
  summary: z.string().max(500),
  category: z.string().max(80),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  contentMd: z.string().max(60000),
});

export const AiChatSchema = z.object({
  messages: z.array(AiChatMessageSchema).min(1).max(20),
  context: AiPostContextSchema,
});

export const AiCompletionFieldSchema = z.enum(["titles", "slug", "summary", "category", "tags"]);

export const AiCompletePostSchema = z
  .object({
    fields: z.array(AiCompletionFieldSchema).min(1).max(5),
    context: AiPostContextSchema,
    postId: z.string().min(1).optional(),
  })
  .refine((value) => Boolean(value.context.title.trim() || value.context.contentMd.trim()), {
    message: "标题和正文不能同时为空",
  });

export const AiCompletePostResponseSchema = z.object({
  titles: z.array(z.string()).optional(),
  slug: z.string().optional(),
  summary: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const AiPolishMomentSchema = z.object({
  contentMd: z.string().trim().min(1).max(60000),
  mode: z.enum(["polish", "expand", "condense"]).default("polish"),
});

export const AiCompleteProjectSchema = z.object({
  text: z.string().trim().min(1).max(8000),
});

export const AiPolishPageSchema = z.object({
  contentMd: z.string().trim().min(1).max(60000),
});

export const AiGeneratePageSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const AiFillFriendLinkSchema = z.object({
  url: z.string().trim().min(1).max(500),
});

export const AiCompleteProjectResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  icon: z.string().optional(),
  githubUrl: z.string().optional(),
});

export const AiPolishPageResponseSchema = z.object({
  contentMd: z.string(),
});

export const AiGeneratePageResponseSchema = z.object({
  slug: z.string(),
  contentMd: z.string(),
});

export const AiFillFriendLinkResponseSchema = z.object({
  name: z.string(),
  description: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

export type AiChatMessage = z.infer<typeof AiChatMessageSchema>;
export type AiPostContext = z.infer<typeof AiPostContextSchema>;
export type AiCompletionField = z.infer<typeof AiCompletionFieldSchema>;
export type AiCompletePostResponse = z.infer<typeof AiCompletePostResponseSchema>;
export type AiPolishMomentMode = z.infer<typeof AiPolishMomentSchema>["mode"];
export type AiCompleteProjectResponse = z.infer<typeof AiCompleteProjectResponseSchema>;
export type AiPolishPageResponse = z.infer<typeof AiPolishPageResponseSchema>;
export type AiGeneratePageResponse = z.infer<typeof AiGeneratePageResponseSchema>;
export type AiFillFriendLinkResponse = z.infer<typeof AiFillFriendLinkResponseSchema>;
