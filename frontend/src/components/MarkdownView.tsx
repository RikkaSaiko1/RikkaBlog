import { useEffect, useRef, useState } from "react";
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

const lightboxBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid rgba(219, 228, 245, 0.28)",
  borderRadius: 8,
  background: "rgba(219, 228, 245, 0.1)",
  color: "#dbe4f5",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1,
  cursor: "pointer",
  padding: 0,
};

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
  // 灯箱缩放与平移状态
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const draggingRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  const movedRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const lightboxRef = useRef<HTMLDivElement | null>(null);
  // 多指手势：记录所有按下的指针，用于区分单指拖动与双指捏合缩放
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ startDist: number; startScale: number } | null>(null);

  const resetLightboxTransform = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  // 灯箱打开时：Esc 关闭 + 锁定背景滚动 + 滚轮缩放
  useEffect(() => {
    if (!lightbox) return;
    resetLightboxTransform();
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

  // 滚轮缩放：passive:false 才能 preventDefault，避免触控板捏合时触发页面缩放
  useEffect(() => {
    if (!lightbox) return;
    const node = lightboxRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setScale((prev) => {
        const next = prev * (event.deltaY < 0 ? 1.15 : 1 / 1.15);
        const clamped = Math.min(6, Math.max(1, next));
        if (clamped === 1) setOffset({ x: 0, y: 0 });
        return clamped;
      });
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
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
          <div
            ref={lightboxRef}
            onClick={() => setLightbox(null)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1300,
              background: "rgba(8, 12, 22, 0.88)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "clamp(8px, 3vw, 32px)",
              cursor: scale > 1 ? "grab" : "zoom-out",
              overflow: "hidden",
              touchAction: "none",
            }}
          >
            <img
              src={lightbox.src}
              alt={lightbox.alt ?? ""}
              draggable={false}
              onClick={(event) => {
                // 放大状态下点击图片不关闭；刚拖动过也不关闭
                if (scale > 1 || movedRef.current) {
                  event.stopPropagation();
                  movedRef.current = false;
                  return;
                }
                setLightbox(null);
              }}
              onPointerDown={(event) => {
                pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                // 合成事件或异常场景下 setPointerCapture 可能抛错，避免中断手势逻辑
                try {
                  event.currentTarget.setPointerCapture(event.pointerId);
                } catch {
                  /* ignore */
                }
                if (pointersRef.current.size === 1) {
                  // 单指：放大后拖动
                  if (scale <= 1) return;
                  event.stopPropagation();
                  draggingRef.current = { startX: event.clientX, startY: event.clientY, baseX: offset.x, baseY: offset.y };
                  setDragging(true);
                } else if (pointersRef.current.size === 2) {
                  // 双指：捏合缩放，取消拖动
                  event.stopPropagation();
                  draggingRef.current = null;
                  setDragging(false);
                  const [a, b] = [...pointersRef.current.values()];
                  pinchRef.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startScale: scale };
                }
              }}
              onPointerMove={(event) => {
                if (!pointersRef.current.has(event.pointerId)) return;
                pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                const pinch = pinchRef.current;
                if (pinch && pointersRef.current.size >= 2) {
                  const [a, b] = [...pointersRef.current.values()];
                  const dist = Math.hypot(a.x - b.x, a.y - b.y);
                  if (pinch.startDist > 0) {
                    const next = Math.min(6, Math.max(1, pinch.startScale * (dist / pinch.startDist)));
                    movedRef.current = true;
                    setScale(next);
                    if (next === 1) setOffset({ x: 0, y: 0 });
                  }
                  return;
                }
                const drag = draggingRef.current;
                if (!drag) return;
                const dx = event.clientX - drag.startX;
                const dy = event.clientY - drag.startY;
                if (Math.abs(dx) + Math.abs(dy) > 4) movedRef.current = true;
                setOffset({ x: drag.baseX + dx, y: drag.baseY + dy });
              }}
              onPointerUp={(event) => {
                pointersRef.current.delete(event.pointerId);
                if (pointersRef.current.size < 2) pinchRef.current = null;
                if (pointersRef.current.size === 0) {
                  draggingRef.current = null;
                  setDragging(false);
                }
              }}
              onPointerCancel={(event) => {
                pointersRef.current.delete(event.pointerId);
                if (pointersRef.current.size < 2) pinchRef.current = null;
                draggingRef.current = null;
                setDragging(false);
              }}
              style={{
                maxWidth: "100%",
                maxHeight: "100%",
                borderRadius: 16,
                boxShadow: "0 24px 80px rgba(0, 0, 0, 0.5)",
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                transition: dragging ? "none" : "transform 120ms ease-out",
                cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-out",
                userSelect: "none",
              }}
            />
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "absolute",
                bottom: 18,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 14px",
                borderRadius: 999,
                background: "rgba(16, 24, 46, 0.72)",
                backdropFilter: "blur(8px)",
                color: "#dbe4f5",
                font: "700 12px/1.4 system-ui, sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(1, scale / 1.3);
                  setScale(next);
                  if (next === 1) setOffset({ x: 0, y: 0 });
                }}
                style={lightboxBtnStyle}
                aria-label="缩小"
              >
                −
              </button>
              <span style={{ minWidth: 44, textAlign: "center" }}>{Math.round(scale * 100)}%</span>
              <button
                type="button"
                onClick={() => setScale(Math.min(6, scale * 1.3))}
                style={lightboxBtnStyle}
                aria-label="放大"
              >
                ＋
              </button>
              <span style={{ opacity: 0.55 }}>滚轮/双指缩放 · 放大后可拖动</span>
            </div>
          </div>,
          document.body,
        )}
    </Box>
  );
}
