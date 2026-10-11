/**
 * 友链目标站元信息抓取（非 AI 部分）。
 * 仅允许 http/https 公网地址，带超时与大小上限；仅供 admin 接口调用。
 */

export type LinkMetadata = {
  url?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_EXTRACT_CHARS = 300_000;

const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /\.localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[f[cd]/i,
];

export function isPrivateHost(hostname: string): boolean {
  return BLOCKED_HOST_PATTERNS.some((pattern) => pattern.test(hostname));
}

// 校验单个 URL 是否允许抓取（协议、端口、内网地址）；allowLocal 时跳过内网与端口限制
const FETCH_GUARD_ERRORS = ["仅支持 http/https 链接", "仅支持 80/443 端口的目标网站", "不允许访问内网地址"];

function assertFetchAllowed(url: URL, allowLocal?: boolean) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(FETCH_GUARD_ERRORS[0]);
  }
  // 生产环境仅允许 80/443 公网地址（SSRF 防护）；本地开发可通过 allowLocal 放行 localhost
  if (!allowLocal) {
    if (url.port && url.port !== "80" && url.port !== "443") {
      throw new Error(FETCH_GUARD_ERRORS[1]);
    }
    if (isPrivateHost(url.hostname)) {
      throw new Error(FETCH_GUARD_ERRORS[2]);
    }
  }
}

// 规范化链接：无协议时补 https://，非法或非 http(s) 返回 undefined
export function normalizeUrl(raw: string): string | undefined {
  const value = raw.trim();
  if (!value) return undefined;
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function firstMatch(html: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const value = stripTags(match[1]);
      if (value) return value;
    }
  }
  return undefined;
}

function extractMetadata(html: string, baseUrl: string): LinkMetadata {
  const title =
    firstMatch(html, [/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i, /<title[^>]*>([^<]+)<\/title>/i]) ?? undefined;
  const description =
    firstMatch(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]) ?? undefined;
  const image =
    firstMatch(html, [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i]) ?? undefined;
  const siteName =
    firstMatch(html, [/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i]) ?? undefined;

  const iconHref = firstMatch(html, [
    /<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
    /<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i,
  ]);
  const favicon = iconHref ? new URL(iconHref, baseUrl).toString() : new URL("/favicon.ico", baseUrl).toString();

  return { title, description, image, siteName, favicon };
}

export async function fetchLinkMetadata(
  rawUrl: string,
  options?: { allowLocal?: boolean },
): Promise<LinkMetadata> {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch {
    throw new Error("链接格式不合法");
  }

  assertFetchAllowed(url, options?.allowLocal);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Response | undefined;
  try {
    // 手动跟随重定向：每一跳都重新校验，防止公网站点通过 302 把请求重定向到内网地址（SSRF）
    let target = url;
    for (let hop = 0; hop < 5; hop += 1) {
      response = await fetch(target.toString(), {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      const location = response.status >= 301 && response.status <= 308 ? response.headers.get("location") : null;
      if (!location) break;
      let next: URL;
      try {
        next = new URL(location, target);
      } catch {
        throw new Error("目标网站重定向地址不合法");
      }
      assertFetchAllowed(next, options?.allowLocal);
      target = next;
    }
  } catch (error) {
    if (error instanceof Error && FETCH_GUARD_ERRORS.includes(error.message)) throw error;
    throw new Error("无法访问目标网站");
  } finally {
    clearTimeout(timer);
  }

  // 循环至少执行一次，正常路径下 response 必已赋值；此处仅为类型收窄
  if (!response) throw new Error("无法访问目标网站");

  if (!response.ok) {
    throw new Error(`目标网站返回了 ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
    throw new Error("目标网站不是网页");
  }

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new Error("目标网页内容过大");
  }

  const html = (await response.text()).slice(0, MAX_EXTRACT_CHARS);
  const finalUrl = response.url || url.toString();
  const metadata = extractMetadata(html, finalUrl);
  metadata.url = finalUrl;
  if (!metadata.title && !metadata.description && !metadata.siteName) {
    throw new Error("未能从目标网页提取到有效信息");
  }
  if (metadata.title && !metadata.siteName) {
    metadata.siteName = metadata.title.replace(/\s*[-–—|·].*$/, "").trim() || metadata.title;
  }
  return metadata;
}

// 从文本中解析 GitHub 仓库地址，返回 { owner, repo, url }
export function parseGithubRepo(raw: string): { owner: string; repo: string; url: string } | undefined {
  const match = raw.match(/https?:\/\/(?:www\.)?github\.com\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\/([a-z0-9._-]+)/i);
  if (!match) return undefined;
  const owner = match[1];
  // 去掉可能粘连的查询参数、锚点或多余路径
  const repo = match[2].split(/[?#/]/)[0];
  if (!repo) return undefined;
  return { owner, repo, url: `https://github.com/${owner}/${repo}` };
}

// 抓取 GitHub 仓库 README（依次尝试 HEAD/main/master），截取前 maxChars 字符
export async function fetchGithubReadme(rawUrl: string, maxChars = 4000): Promise<string | undefined> {
  const parsed = parseGithubRepo(rawUrl);
  if (!parsed) return undefined;

  const branches = ["HEAD", "main", "master"];
  for (const branch of branches) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/README.md`,
        { signal: controller.signal, headers: { Accept: "text/plain" } },
      );
      if (response.ok) {
        const text = (await response.text()).trim();
        if (text) return text.slice(0, maxChars);
      }
    } catch {
      // 尝试下一个分支
    } finally {
      clearTimeout(timer);
    }
  }
  return undefined;
}
