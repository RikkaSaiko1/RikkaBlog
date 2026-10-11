import { afterEach, describe, expect, it, vi } from "vitest";
import { AiChatSchema, AiCompletePostSchema } from "../../common/validators/ai.schema";
import {
  completePageWithConfig,
  completePostWithConfig,
  completeProjectWithConfig,
  generatePageWithConfig,
  listModelsWithConfig,
  makeUniqueSlug,
  modelsUrl,
  normalizeSlug,
  polishFriendLinkWithConfig,
  polishMomentWithConfig,
  slugifyTitle,
} from "./ai";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AI writing schemas", () => {
  const context = { title: "标题", slug: "", summary: "", category: "", tags: [], contentMd: "正文" };

  it("accepts up to 20 user and assistant messages", () => {
    const messages = Array.from({ length: 20 }, (_, index) => ({
      role: index % 2 ? ("assistant" as const) : ("user" as const),
      content: `消息 ${index}`,
    }));
    expect(AiChatSchema.safeParse({ messages, context }).success).toBe(true);
    expect(AiChatSchema.safeParse({ messages: [...messages, messages[0]], context }).success).toBe(false);
  });

  it("rejects oversized messages and empty post completion input", () => {
    expect(AiChatSchema.safeParse({ messages: [{ role: "user", content: "x".repeat(4001) }], context }).success).toBe(false);
    expect(
      AiCompletePostSchema.safeParse({
        fields: ["slug"],
        context: { ...context, title: "", contentMd: "" },
      }).success,
    ).toBe(false);
  });
});

describe("AI post completion", () => {
  it("normalizes ASCII slugs and adds a suffix when a slug exists", async () => {
    expect(normalizeSlug("  Hello, TypeScript World!  ")).toBe("hello-typescript-world");
    const used = new Set(["hello-world", "hello-world-2"]);
    await expect(makeUniqueSlug("Hello World", async (slug) => used.has(slug))).resolves.toBe("hello-world-3");
  });

  it("parses structured metadata and removes duplicate tags", async () => {
    const summary = "这是一段用于验证人工智能文章元信息补全能力的中文摘要，它会概括文章主题、主要内容和读者能够获得的信息，同时保持表达清晰、自然且足够完整，确保长度符合博客展示信息的要求。";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: `\`\`\`json\n${JSON.stringify({ titles: ["标题一", "标题一", "标题二"], slug: "AI Writing Tips", summary, category: "开发", tags: ["AI", "AI", "写作"] })}\n\`\`\``,
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await completePostWithConfig(
      { apiKey: "key", baseUrl: "https://example.com/v1", model: "model", maxTokens: 800, temperature: 0.5 },
      ["titles", "slug", "summary", "category", "tags"],
      { title: "标题", slug: "", summary: "", category: "", tags: [], contentMd: "正文" },
      { categories: ["开发"], tags: ["AI"] },
    );

    expect(result).toEqual({
      titles: ["标题一", "标题二"],
      slug: "ai-writing-tips",
      summary,
      category: "开发",
      tags: ["AI", "写作"],
    });
  });

  it("rejects malformed model output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "不是 JSON" } }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      completePostWithConfig(
        { apiKey: "key" },
        ["slug"],
        { title: "标题", slug: "", summary: "", category: "", tags: [], contentMd: "正文" },
        { categories: [], tags: [] },
      ),
    ).rejects.toThrow("格式无效");
  });
});

describe("AI moment polishing", () => {
  it("returns polished markdown and strips code fences", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "```markdown\n润色后的内容\n```" } }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(polishMomentWithConfig({ apiKey: "key" }, "原始内容", "expand")).resolves.toBe("润色后的内容");
  });
});

describe("AI project completion", () => {
  it("extracts project fields from freeform material and dedupes tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '好的，以下是结果：{"name":"RikkaBlog","description":"这是一个用于验证项目智能填充功能的中文项目描述，涵盖主要功能与技术栈。","tags":["TypeScript","TypeScript","Cloudflare"],"icon":"🚀","githubUrl":"https://github.com/rikka/rikka-blog"}',
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await completeProjectWithConfig(
      { apiKey: "key" },
      "RikkaBlog 项目资料：基于 Cloudflare Workers 的博客系统，仓库 https://github.com/rikka/rikka-blog",
    );
    expect(result.name).toBe("RikkaBlog");
    expect(result.description).toContain("中文项目描述");
    expect(result.tags).toEqual(["TypeScript", "Cloudflare"]);
    expect(result.icon).toBe("🚀");
    expect(result.githubUrl).toBe("https://github.com/rikka/rikka-blog");
  });

  it("unwraps fields nested under a project object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"project":{"name":"示例项目","description":"这是一个用于验证嵌套解包逻辑的中文项目描述，字段被包在 project 对象中。","tags":["Node.js"]}}',
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await completeProjectWithConfig({ apiKey: "key" }, "这是一个不含链接的项目资料文本");
    expect(result.name).toBe("示例项目");
    expect(result.tags).toEqual(["Node.js"]);
  });

  it("falls back to the GitHub owner avatar when the model omits the icon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url).includes("raw.githubusercontent.com")) {
          return new Response("# clash_config\n\nClash 配置管理工具。", { headers: { "Content-Type": "text/plain" } });
        }
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content:
                    '{"name":"clash_config","description":"这是一个 Clash 配置管理工具，支持订阅管理与规则整理，方便日常代理配置。","tags":["Clash","Config"]}',
                },
              },
            ],
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const result = await completeProjectWithConfig({ apiKey: "key" }, "https://github.com/RikkaSaiko1/clash_config");
    expect(result.icon).toBe("https://github.com/RikkaSaiko1.png");
    expect(result.githubUrl).toBe("https://github.com/RikkaSaiko1/clash_config");
  });
});

describe("AI page completion", () => {
  it("generates a title and normalized slug", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"友链登记说明","slug":"Friends Page"}' } }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(completePageWithConfig({ apiKey: "key" }, "页面正文内容")).resolves.toEqual({
      title: "友链登记说明",
      slug: "friends-page",
    });
  });
});

describe("AI page generation", () => {
  it("converts a Chinese title into a pinyin slug as fallback", () => {
    expect(slugifyTitle("交流")).toBe("jiaoliu");
    expect(slugifyTitle("关于本站")).toBe("guanyubenzhan");
  });

  it("falls back to a pinyin slug when the model omits the slug field", async () => {
    const contentMd = "# 交流\n\n这是一个内容足够长的正文示例，用于验证中文标题可以自动转换为拼音 slug 兜底。\n\n- 列表项一\n- 列表项二\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: `{"title":"交流","contentMd":${JSON.stringify(contentMd)}}` } }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const result = await generatePageWithConfig({ apiKey: "key" }, "交流");
    expect(result.slug).toBe("jiaoliu");
    expect(result.contentMd).toBe(contentMd.trim());
  });
  it("generates markdown content and a normalized slug from a title", async () => {
    const contentMd = "# 关于本站\n\n这是一个内容足够长的正文示例，用于验证 AI 页面生成功能可以正常解析并返回结果。\n\n- 列表项一\n- 列表项二\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: `{"slug":"About Site","contentMd":${JSON.stringify(contentMd)}}` } }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(generatePageWithConfig({ apiKey: "key" }, "关于本站")).resolves.toEqual({
      slug: "about-site",
      contentMd: contentMd.trim(),
    });
  });

  it("rejects when the model returns an invalid JSON object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "我无法完成这个请求" } }] }), {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    await expect(generatePageWithConfig({ apiKey: "key" }, "关于本站")).rejects.toThrow("AI 未能生成有效的页面内容，请重试");
  });
});

describe("AI friend link polishing", () => {
  it("fills friend link info from fetched metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"name":"示例站点","description":"一个内容丰富的中文技术博客，分享开发经验与生活记录。"}' } }],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await polishFriendLinkWithConfig(
      { apiKey: "key" },
      "https://example.com/",
      { title: "示例站点", description: "原始描述", siteName: "示例", favicon: "https://example.com/icon.png", url: "https://example.com/" },
    );
    expect(result.name).toBe("示例站点");
    expect(result.description).toContain("中文技术博客");
    expect(result.avatarUrl).toBe("https://example.com/icon.png");
  });

  it("still fills info from the url alone when fetch failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"name":"example","description":"一个由 AI 根据网址整理的通用中文站点简介，内容丰富。"}' } }],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await polishFriendLinkWithConfig({ apiKey: "key" }, "https://example.com/");
    expect(result.name).toBe("example");
    expect(result.description).toContain("站点简介");
    expect(result.avatarUrl).toBeUndefined();
  });

  it("falls back to raw metadata when the model keeps chatting instead of JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "我无法访问外部网页，你可以把网页内容贴给我，我再帮你整理。" } }],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const result = await polishFriendLinkWithConfig(
      { apiKey: "key" },
      "https://example.com/",
      { title: "示例站点", description: "一个示例描述", siteName: "示例站点", favicon: "https://example.com/icon.png", url: "https://example.com/" },
    );
    expect(result.name).toBe("示例站点");
    expect(result.description).toBe("一个示例描述");
    expect(result.avatarUrl).toBe("https://example.com/icon.png");
  });
});

describe("AI model listing", () => {
  it("builds a /models url from common base urls", () => {
    expect(modelsUrl("http://localhost:20128/v1")).toBe("http://localhost:20128/v1/models");
    expect(modelsUrl("https://api.openai.com/v1/")).toBe("https://api.openai.com/v1/models");
    expect(modelsUrl("https://gw.example.com/v1/chat/completions")).toBe("https://gw.example.com/v1/models");
    expect(modelsUrl("https://gw.example.com/v1/models")).toBe("https://gw.example.com/v1/models");
  });

  it("fetches and sorts model ids from the upstream", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ object: "list", data: [{ id: "zeta" }, { id: "alpha" }] }), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const models = await listModelsWithConfig({ apiKey: "k", baseUrl: "http://localhost:20128/v1" });
    expect(models).toEqual(["alpha", "zeta"]);
    const firstCall = fetchMock.mock.calls[0] as unknown as [unknown];
    expect(String(firstCall[0])).toBe("http://localhost:20128/v1/models");
  });

  it("throws a readable error when the upstream rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("forbidden", { status: 403 })));
    await expect(listModelsWithConfig({ apiKey: "bad" })).rejects.toThrow("获取模型列表失败: 403");
  });
});
