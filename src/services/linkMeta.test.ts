import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLinkMetadata, isPrivateHost, normalizeUrl } from "./linkMeta";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isPrivateHost", () => {
  it("blocks loopback and private ranges", () => {
    for (const host of [
      "localhost",
      "api.localhost",
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.10.1",
      "0.0.0.0",
      "[::1]",
      "[fd00::1]",
    ]) {
      expect(isPrivateHost(host)).toBe(true);
    }
  });

  it("allows public hosts", () => {
    for (const host of ["example.com", "8.8.8.8", "172.32.0.1", "blog.example.cn"]) {
      expect(isPrivateHost(host)).toBe(false);
    }
  });
});

describe("normalizeUrl", () => {
  it("adds the protocol and rejects non-http targets", () => {
    expect(normalizeUrl("www.example.com")).toBe("https://www.example.com/");
    expect(normalizeUrl("example.com/path")).toBe("https://example.com/path");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com/");
    expect(normalizeUrl("javascript:alert(1)")).toBeUndefined();
    expect(normalizeUrl("not a url")).toBeUndefined();
    expect(normalizeUrl("  ")).toBeUndefined();
  });
});

describe("fetchLinkMetadata", () => {
  const html = (body: string) => new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });

  it("rejects invalid urls, private hosts and non-standard ports", async () => {
    await expect(fetchLinkMetadata("not a url")).rejects.toThrow("链接格式不合法");
    await expect(fetchLinkMetadata("http://127.0.0.1")).rejects.toThrow("不允许访问内网地址");
    await expect(fetchLinkMetadata("http://example.com:8080")).rejects.toThrow("仅支持 80/443 端口");
  });

  it("extracts open graph metadata and resolves the favicon", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        html(
          '<html><head><meta property="og:title" content="示例博客"><meta property="og:description" content="一个示例站点"><link rel="apple-touch-icon" href="/icon.png"></head><body>内容</body></html>',
        ),
      ),
    );

    const meta = await fetchLinkMetadata("example.com");
    expect(meta.title).toBe("示例博客");
    expect(meta.description).toBe("一个示例站点");
    expect(meta.siteName).toBe("示例博客");
    expect(meta.favicon).toBe("https://example.com/icon.png");
  });

  it("fails with readable errors for non-web targets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "Content-Type": "application/json" } })));
    await expect(fetchLinkMetadata("example.com")).rejects.toThrow("目标网站不是网页");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404, headers: { "Content-Type": "text/html" } })),
    );
    await expect(fetchLinkMetadata("example.com")).rejects.toThrow("目标网站返回了 404");

    vi.stubGlobal("fetch", vi.fn(async () => html("<html><head></head><body><p>无元信息</p></body></html>")));
    await expect(fetchLinkMetadata("example.com")).rejects.toThrow("未能从目标网页提取到有效信息");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );
    await expect(fetchLinkMetadata("example.com")).rejects.toThrow("无法访问目标网站");
  });
});
