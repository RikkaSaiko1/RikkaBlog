// 把 YouTube / Bilibili 分享链接解析为可嵌入播放器的信息，供 Markdown 渲染时自动转成播放器
export type VideoEmbed = {
  provider: "youtube" | "bilibili";
  id: string;
  src: string;
  title: string;
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{6,20}$/;
const PATH_ID = /^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{6,20})(?:\/|$)/;
const BILIBILI_VIDEO = /\/video\/(BV[0-9A-Za-z]{10}|av\d+)/i;

function youtubeEmbed(id: string): VideoEmbed {
  return {
    provider: "youtube",
    id,
    src: `https://www.youtube.com/embed/${id}`,
    title: "YouTube 视频",
  };
}

function bilibiliEmbed(videoId: string): VideoEmbed {
  const param = /^bv/i.test(videoId) ? `bvid=${videoId}` : `aid=${videoId.replace(/^av/i, "")}`;
  return {
    provider: "bilibili",
    id: videoId,
    src: `https://player.bilibili.com/player.html?${param}&page=1&autoplay=0&high_quality=1&danmaku=0`,
    title: "Bilibili 视频",
  };
}

export function videoUrlToEmbed(raw: string): VideoEmbed | null {
  const value = raw.trim();
  if (!value) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  // 归一化主机名：去掉 www. 与 m. 前缀，兼容移动端分享链接
  const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return YOUTUBE_ID.test(id) ? youtubeEmbed(id) : null;
  }

  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const queryId = url.searchParams.get("v");
    if (queryId && YOUTUBE_ID.test(queryId)) return youtubeEmbed(queryId);
    const matched = url.pathname.match(PATH_ID);
    return matched ? youtubeEmbed(matched[1]) : null;
  }

  if (host === "bilibili.com" || host === "player.bilibili.com") {
    const matched = url.pathname.match(BILIBILI_VIDEO);
    return matched ? bilibiliEmbed(matched[1]) : null;
  }

  return null;
}
