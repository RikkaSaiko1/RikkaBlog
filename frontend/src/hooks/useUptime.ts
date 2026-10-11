import { useEffect, useMemo, useState } from "react";

// 宽松解析用户填写的日期：ISO、"2026-10-11 00:00:00"（空格分隔）、"2026/10/11" 等
function parseBuildDate(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return Number.NaN;
  const direct = new Date(trimmed).getTime();
  if (!Number.isNaN(direct)) return direct;
  const normalized = new Date(trimmed.replace(" ", "T")).getTime();
  return normalized;
}

// 运行时长起点：优先用站点配置的建站时间；未填或无法解析时，回退到本次构建（CF 部署）时刻
export function resolveUptimeStart(buildDate: string): number {
  const parsed = parseBuildDate(buildDate || "");
  if (!Number.isNaN(parsed)) return parsed;
  const built = new Date(__BUILD_TIME__).getTime();
  return Number.isNaN(built) ? Date.now() : built;
}

export function formatUptime(start: number, now: number = Date.now()): string {
  const elapsed = Math.max(0, now - start);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  return `${Math.floor(elapsed / day)}天 ${Math.floor((elapsed % day) / hour)}小时 ${Math.floor((elapsed % hour) / minute)}分 ${Math.floor((elapsed % minute) / 1000)}秒`;
}

// 每秒跳动的运行时长
export function useUptime(buildDate: string): string {
  const start = useMemo(() => resolveUptimeStart(buildDate), [buildDate]);
  const [uptime, setUptime] = useState(() => formatUptime(start));

  useEffect(() => {
    const update = () => setUptime(formatUptime(start));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [start]);

  return uptime;
}
