import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { adminApi } from "./adminApi";
import { useSiteConfig } from "../context/SiteConfigProvider";

const statConfig: Array<{
  key: keyof Awaited<ReturnType<typeof adminApi.stats>>;
  label: string;
  trend: string;
  icon: string;
  color: string;
}> = [
  { key: "posts", label: "文章", trend: "+12%", icon: "¶", color: "#6de4e0" },
  { key: "moments", label: "瞬间", trend: "+4", icon: "◌", color: "#ff8fae" },
  { key: "projects", label: "项目", trend: "+1", icon: "◇", color: "#a99cff" },
  { key: "pages", label: "页面", trend: "0", icon: "□", color: "#8ee7a8" },
  { key: "friendLinks", label: "友链", trend: "+2", icon: "∞", color: "#f5a7cf" },
  { key: "comments", label: "评论", trend: "+18%", icon: "⊙", color: "#8ca9ff" },
  { key: "users", label: "用户", trend: "+9%", icon: "♙", color: "#b8c2d8" },
];

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

const activityMeta: Record<string, { label: string; icon: string }> = {
  post: { label: "发布文章", icon: "¶" },
  comment: { label: "收到评论", icon: "⊙" },
  moment: { label: "更新瞬间", icon: "◌" },
  friend: { label: "友链申请", icon: "∞" },
};

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 2 * day) return "昨天";
  return new Date(iso).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function UsageBar({ label, used, limit, display }: { label: string; used: number; limit: number; display: string }) {
  const percent = limit > 0 ? Math.min(100, Math.max(used / limit * 100, used > 0 ? 1 : 0)) : 0;
  const level = percent >= 90 ? "danger" : percent >= 70 ? "warn" : "ok";
  return (
    <div className="usage-item">
      <div className="usage-item-head">
        <span>{label}</span>
        <strong>{display}</strong>
      </div>
      <div className="usage-track">
        <i className={`usage-fill ${level}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const siteConfig = useSiteConfig();
  const query = useQuery({ queryKey: ["admin", "stats"], queryFn: adminApi.stats });
  const analyticsQuery = useQuery({ queryKey: ["admin", "analytics"], queryFn: adminApi.analytics });
  const activityQuery = useQuery({ queryKey: ["admin", "activity"], queryFn: adminApi.activity });
  const usageQuery = useQuery({ queryKey: ["admin", "usage"], queryFn: adminApi.usage, refetchInterval: 5 * 60 * 1000 });
  const analytics = analyticsQuery.data;
  const usage = usageQuery.data;
  const maxCount = Math.max(1, ...(analytics?.days.map((day) => day.count) ?? [1]));

  return (
    <>
      <section className="admin-welcome">
        <div>
          <span className="eyebrow">GOOD EVENING, {siteConfig.authorName.toUpperCase()}</span>
          <h2>今晚也留下一点什么吧。</h2>
          <p>站点运行稳定，内容数据库与边缘节点已经就绪。可以从一篇文章或一条瞬间开始。</p>
        </div>
        <div className="quick-actions">
          <button type="button" onClick={() => navigate("/admin/posts/new")}>
            <b>＋</b>
            <span>
              写文章<small>打开 Markdown 编辑器</small>
            </span>
          </button>
          <a href="/admin#moments">
            <b>◌</b>
            <span>
              发瞬间<small>记录此刻的想法</small>
            </span>
          </a>
          <a href="/admin#comments">
            <b>⊙</b>
            <span>
              审评论<small>查看等待处理的内容</small>
            </span>
          </a>
        </div>
      </section>

      {query.isLoading ? (
        <div className="empty-state">
          <div className="loader" />
          <strong>正在同步数据</strong>
        </div>
      ) : (
        <div className="stat-grid">
          {statConfig.map((item) => (
            <article className="stat-card" style={{ "--stat-color": item.color } as React.CSSProperties} key={item.key}>
              <div className="stat-card-top">
                <span className="stat-icon">{item.icon}</span>
                <span className="stat-trend">{item.trend}</span>
              </div>
              <strong>{(query.data?.[item.key] ?? 0).toLocaleString("zh-CN")}</strong>
              <small>{item.label}总数</small>
              <a href={`/admin#${item.key === "friendLinks" ? "friends" : item.key}`}>管理 {item.label} →</a>
            </article>
          ))}
        </div>
      )}

      <div className="dashboard-grid">
        <section className="admin-panel analytics-panel">
          <header>
            <div>
              <span className="eyebrow">TRAFFIC</span>
              <h2>近 7 天访问</h2>
            </div>
            <strong>
              {(analytics?.total ?? 0).toLocaleString("zh-CN")} <small>PV</small>
            </strong>
          </header>
          {analyticsQuery.isLoading ? (
            <div className="empty-state">
              <div className="loader" />
              <strong>正在统计</strong>
            </div>
          ) : (
            <div className="bar-chart" aria-label="近七天访问趋势">
              {(analytics?.days ?? []).map((day, index) => {
                const isToday = index === (analytics?.days.length ?? 0) - 1;
                const label = isToday ? "今天" : weekdayLabels[new Date(`${day.date}T00:00:00`).getDay()];
                const height = Math.max(4, Math.round((day.count / maxCount) * 100));
                return (
                  <div key={day.date}>
                    <span className={isToday ? "active" : undefined} style={{ height: `${height}%` }}>
                      <i>{day.count}</i>
                    </span>
                    <small>{label}</small>
                  </div>
                );
              })}
            </div>
          )}
        </section>
        <section className="admin-panel activity-panel">
          <header>
            <div>
              <span className="eyebrow">ACTIVITY</span>
              <h2>最近动态</h2>
            </div>
            <a href="/admin#posts">查看全部 →</a>
          </header>
          <div className="activity-list">
            {activityQuery.isLoading ? (
              <div className="empty-state">
                <div className="loader" />
                <strong>正在加载动态</strong>
              </div>
            ) : (activityQuery.data?.items.length ? activityQuery.data.items : []).map((item, index) => (
              <div key={`${item.type}-${item.date}-${index}`}>
                <span className="activity-icon">{activityMeta[item.type]?.icon}</span>
                <p>
                  <strong>{activityMeta[item.type]?.label}</strong>
                  {item.text}
                  <small>{relativeTime(item.date)}</small>
                </p>
              </div>
            ))}
            {!activityQuery.isLoading && !activityQuery.data?.items.length && (
              <div className="empty-state">
                <strong>暂无动态</strong>
                <small>发布文章、收到评论或友链申请后会出现在这里</small>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="system-card">
        <div>
          <span className="eyebrow">SYSTEM STATUS</span>
          <h2>
            <i /> 工作台就绪
          </h2>
          <p>内容数据库、对象存储与边缘节点同步正常。所有管理操作将直接作用于站点真实数据。</p>
          <div className="system-usage">
            {usageQuery.isLoading ? (
              <div className="usage-empty">正在查询 Cloudflare 用量…</div>
            ) : usage?.configured && usage.workers && usage.r2 ? (
              <>
                <UsageBar
                  label="Workers 请求 · 今日"
                  used={usage.workers.requests24h}
                  limit={usage.limits.workersFreeRequestsPerDay}
                  display={`${usage.workers.requests24h.toLocaleString("zh-CN")} / 10 万`}
                />
                <UsageBar
                  label="Workers 请求 · 本月"
                  used={usage.workers.requests30d}
                  limit={usage.limits.workersFreeRequestsPerMonth}
                  display={`${usage.workers.requests30d.toLocaleString("zh-CN")} / 300 万`}
                />
                <UsageBar
                  label="R2 存储"
                  used={usage.r2.storageBytes}
                  limit={usage.limits.r2FreeStorageBytes}
                  display={`${formatBytes(usage.r2.storageBytes)} / 10 GB`}
                />
                <UsageBar
                  label="R2 操作 · 本月"
                  used={usage.r2.operations30d}
                  limit={1_000_000}
                  display={`${usage.r2.operations30d.toLocaleString("zh-CN")} / 100 万`}
                />
              </>
            ) : (
              <div className="usage-empty">
                未配置 Cloudflare 凭据，无法读取用量。请在 <code>.dev.vars</code> 或 <code>wrangler secret</code> 中设置 <code>CF_ACCOUNT_ID</code> 与 <code>CF_API_TOKEN</code>。
              </div>
            )}
          </div>
        </div>
        <div className="system-meta">
          <div>
            <span>VERSION</span>
            <strong>2.4.0</strong>
          </div>
          <div>
            <span>UPDATED</span>
            <strong>刚刚</strong>
          </div>
          <div>
            <span>DATABASE</span>
            <strong>D1 · HEALTHY</strong>
          </div>
          <div>
            <span>REGION</span>
            <strong>APAC</strong>
          </div>
        </div>
      </section>
    </>
  );
}
