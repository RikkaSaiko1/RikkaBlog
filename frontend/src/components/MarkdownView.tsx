import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Box } from "@mui/material";
import rehypeRaw from "rehype-raw";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { videoUrlToEmbed } from "../utils/videoEmbed";

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// react-markdown 默认会剥掉相对地址与 data: URL，导致 /api/uploads 图片和历史 base64 图在预览中不显示。
// 这里放行相对路径与仅图片类型的 data: URL，其余协议维持默认白名单行为。
const SAFE_PROTOCOL = /^(https?|ircs?|mailto|xmpp)$/i;
const DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp|avif|svg\+xml);/i;

function urlTransform(url: string) {
  const colon = url.indexOf(":");
  if (colon < 0) return url; // 相对路径，放行
  if (DATA_IMAGE.test(url)) return url;
  const slash = url.indexOf("/");
  const questionMark = url.indexOf("?");
  const numberSign = url.indexOf("#");
  if (
    (slash > -1 && colon > slash) ||
    (questionMark > -1 && colon > questionMark) ||
    (numberSign > -1 && colon > numberSign)
  ) {
    return url;
  }
  return SAFE_PROTOCOL.test(url.slice(0, colon)) ? url : "";
}

export function MarkdownView({ content }: { content: string }) {
  const decodedContent = decodeHtmlEntities(content);
  const [lightbox, setLightbox] = useState<{ src: string; alt?: string } | null>(null);

  // 灯箱打开时：Esc 关闭 + 锁定背景滚动
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [lightbox]);

  return (
    <Box
      sx={(theme) => ({
        lineHeight: 1.9,
        fontSize: "1rem",
        "& h1, & h2, & h3": { mt: 3, mb: 1.2, lineHeight: 1.3 },
        "& p": { my: 1.5 },
        "& a": { color: "primary.main" },
        "& img": { maxWidth: "100%", height: "auto", borderRadius: 2, verticalAlign: "middle" },
        "& ul, & ol": { pl: 3, my: 1.5 },
        "& code": {
          px: 0.5,
          py: 0.25,
          borderRadius: 0.5,
          bgcolor: theme.palette.mode === "light" ? "rgba(33, 56, 98, 0.09)" : "action.hover",
          color: "text.primary",
          fontFamily: "monospace",
        },
        "& pre": {
          p: 1.5,
          border: "1px solid",
          borderColor: theme.palette.mode === "light" ? "rgba(112, 137, 194, 0.28)" : "divider",
          borderRadius: 1,
          bgcolor: theme.palette.mode === "light" ? "#17213a" : "#101a2f",
          color: "#edf3ff",
          overflowX: "auto",
          boxShadow: theme.palette.mode === "light" ? "0 14px 34px rgba(34, 49, 87, 0.16)" : "none",
        },
        "& pre code": { p: 0, bgcolor: "transparent", color: "inherit" },
        "& blockquote": { borderLeft: "4px solid", borderColor: "divider", pl: 1.5, color: "text.secondary", m: 0 },
        "& table": { width: "100%", borderCollapse: "collapse", my: 2 },
        "& th, & td": { border: "1px solid", borderColor: "divider", p: 1 },
        "& td > div": { maxWidth: "100%" },
      })}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={urlTransform}
        components={{
          // 图片语法指向视频文件时渲染为播放器，其余保持 <img>
          img({ src, alt, ...props }) {
            if (src && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src)) {
              return (
                <Box
                  component="video"
                  src={src}
                  controls
                  sx={{ display: "block", maxWidth: "100%", height: "auto", borderRadius: 2, my: 2 }}
                />
              );
            }
            return (
              <img
                src={src}
                alt={alt}
                style={{ cursor: "zoom-in" }}
                onClick={(event) => {
                  // 图片被超链接包裹时保留链接跳转行为，不弹灯箱
                  if (event.currentTarget.closest("a")) return;
                  if (src) setLightbox({ src, alt: alt ?? undefined });
                }}
                {...props}
              />
            );
          },
          // 命中 YouTube / Bilibili 分享链接时直接渲染为播放器，其余链接保持原样
          a({ href, children, ...props }) {
            const embed = href ? videoUrlToEmbed(href) : null;
            if (embed) {
              return (
                <Box
                  component="iframe"
                  src={embed.src}
                  title={embed.title}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  sx={{
                    display: "block",
                    width: "100%",
                    aspectRatio: "16 / 9",
                    border: 0,
                    borderRadius: 2,
                    my: 2,
                    bgcolor: "action.hover",
                  }}
                />
              );
            }
            return (
              <a href={href} {...props}>
                {children}
              </a>
            );
          },
        }}
      >
        {decodedContent}
      </ReactMarkdown>
      {lightbox &&
        // Portal 到 body：祖先的 backdrop-filter 会成为 fixed 后代的包含块，
        // 导致遮罩相对文章卡片而非视口定位（图片跑到屏幕外）
        createPortal(
          <Box
            onClick={() => setLightbox(null)}
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: (t) => t.zIndex.tooltip + 10,
              bgcolor: "rgba(8, 12, 22, 0.88)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: { xs: 2, sm: 4 },
              cursor: "zoom-out",
            }}
          >
            <Box
              component="img"
              src={lightbox.src}
              alt={lightbox.alt ?? ""}
              sx={{
                maxWidth: "100%",
                maxHeight: "100%",
                borderRadius: 2,
                boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
              }}
            />
          </Box>,
          document.body,
        )}
    </Box>
  );
}
