import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSiteConfig } from "../context/SiteConfigProvider";

// 不填 → 以当前时间（页面加载时刻）为起点；填了 → 按填写的日期计算
function resolveUptimeStart(buildDate: string) {
  const trimmed = (buildDate || "").trim();
  const parsed = trimmed ? new Date(trimmed).getTime() : Number.NaN;
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function formatUptime(start: number) {
  const elapsed = Math.max(0, Date.now() - start);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  return `${Math.floor(elapsed / day)}天 ${Math.floor((elapsed % day) / hour)}小时 ${Math.floor((elapsed % hour) / minute)}分 ${Math.floor((elapsed % minute) / 1000)}秒`;
}

export function Footer() {
  const siteConfig = useSiteConfig();
  const location = useLocation();
  const [time, setTime] = useState("00:00:00");
  const start = useMemo(() => resolveUptimeStart(siteConfig.buildDate), [siteConfig.buildDate]);
  const [uptime, setUptime] = useState(() => formatUptime(start));

  useEffect(() => {
    const update = () => {
      setTime(
        new Date().toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      );
      setUptime(formatUptime(start));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [start]);

  return (
    <footer className="legacy-footer-wrap">
      {location.pathname === "/" && (
        <section className="site-status-strip" aria-label="站点运行状态">
          <time className="footer-clock">{time}</time>
          <div className="footer-status-main">
            <strong><i />{siteConfig.uptimeLabel}<span>{uptime}</span></strong>
            <div className="footer-badges">
              {siteConfig.footerBadges.map((badge) => (
                <span key={badge.name}>{badge.name}</span>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="legacy-footer-bar">
        <small>© {new Date().getFullYear()} {siteConfig.title}. {siteConfig.footerBuiltWith}</small>
        <nav aria-label="页脚链接">
          {siteConfig.social.github && (
            <a href={siteConfig.social.github} target="_blank" rel="noopener noreferrer">GitHub</a>
          )}
          {siteConfig.social.demo && (
            <a href={siteConfig.social.demo} target="_blank" rel="noopener noreferrer">Demo</a>
          )}
          <a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer">Cloudflare</a>
          {siteConfig.icpConfig && (
            <a href={siteConfig.icpConfig.link} target="_blank" rel="noopener noreferrer">{siteConfig.icpConfig.name}</a>
          )}
        </nav>
      </div>
    </footer>
  );
}
