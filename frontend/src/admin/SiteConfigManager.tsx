import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, joinLines, splitLines } from "./adminApi";
import { StateBlock } from "./AdminPrimitives";
import { defaultSiteConfig, normalizeSiteConfig, SiteConfig } from "../config/siteConfig";

type FormState = Omit<SiteConfig, "bgImages" | "footerBadges"> & {
  bgImagesText: string;
  footerBadgesText: string;
};

function toForm(config: SiteConfig): FormState {
  return {
    ...config,
    bgImagesText: joinLines(config.bgImages),
    footerBadgesText: JSON.stringify(config.footerBadges, null, 2),
  };
}

function fromForm(form: FormState): SiteConfig {
  let footerBadges: SiteConfig["footerBadges"] = [];
  try {
    const parsed = JSON.parse(form.footerBadgesText) as SiteConfig["footerBadges"];
    footerBadges = Array.isArray(parsed) ? parsed : [];
  } catch {
    footerBadges = [];
  }
  return normalizeSiteConfig({ ...form, bgImages: splitLines(form.bgImagesText), footerBadges });
}

// 把存储的日期值转为 datetime-local 控件可显示的格式；无法解析时返回空串（控件显示未选择）
function toDateTimeLocal(value: string): string {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";
  const parsed = new Date(trimmed.includes("T") && trimmed.length <= 16 ? trimmed : trimmed.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function Section({
  index,
  title,
  description,
  children,
}: {
  index: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="form-card">
      <header><span>{index}</span><div><h2>{title}</h2><p>{description}</p></div></header>
      <div className="form-grid">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  full,
  help,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
  help?: string;
}) {
  return (
    <label className={`field${full ? " full" : ""}`}>
      <span>{label}</span>
      {children}
      {help && <small className="field-help">{help}</small>}
    </label>
  );
}

// 模型选择：输入框可手动填写（同时作为筛选关键词过滤列表），▾ 展开固定在输入框正下方的自定义下拉。
// 面板用 position: fixed 定位，逃出 .form-card 的 overflow: hidden 裁剪，且不受原生下拉的系统样式/弹出方向影响。
function ModelPicker(props: {
  label: string;
  help?: string;
  value: string;
  onChange: (value: string) => void;
  models: string[];
  fetched: boolean;
}) {
  const [open, setOpen] = useState(false);
  // 过滤词与输入框值分离：输入框保存已选模型名，过滤词仅在面板打开后实际输入时生效，
  // 否则打开面板会被当前完整模型名过滤成只剩一项
  const [filter, setFilter] = useState("");
  const [panelPos, setPanelPos] = useState({ left: 0, top: 0, width: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const openPanel = () => {
    if (!props.models.length || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setPanelPos({ left: rect.left, top: rect.bottom + 6, width: rect.width });
    setFilter("");
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const inPanel = (target: EventTarget | null) =>
      target instanceof Node &&
      ((wrapRef.current && wrapRef.current.contains(target)) ||
        (panelRef.current && panelRef.current.contains(target)));
    // 面板已渲染到 body 下（Portal），点选选项/拖面板滚动条都不算「点外部」
    const onMouseDown = (event: MouseEvent) => {
      if (inPanel(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    // 捕获阶段监听页面滚动以保持面板贴合输入框，但忽略面板自身的内部滚动，否则列表滚不动
    const onScroll = (event: Event) => {
      if (inPanel(event.target)) return;
      setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const keyword = filter.trim().toLowerCase();
  const filtered = keyword ? props.models.filter((m) => m.toLowerCase().includes(keyword)) : props.models;

  return (
    <Field label={props.label} help={props.help}>
      <div className="model-picker" ref={wrapRef}>
        <input
          ref={inputRef}
          value={props.value}
          onChange={(e) => { props.onChange(e.target.value); setFilter(e.target.value); }}
          onFocus={openPanel}
          onClick={openPanel}
          placeholder="手动输入（可过滤列表），或点右侧 ▾ 选择"
        />
        <button
          type="button"
          className="model-picker-toggle"
          disabled={props.models.length === 0}
          aria-label="展开模型列表"
          title={props.fetched ? "展开模型列表" : "请先点击「获取模型列表」"}
          onClick={() => (open ? setOpen(false) : openPanel())}
        >
          {open ? "▴" : "▾"}
        </button>
        {open &&
          createPortal(
            <div
              ref={panelRef}
              className="model-picker-panel"
              style={{ left: panelPos.left, top: panelPos.top, width: panelPos.width }}
              onMouseDown={(e) => e.preventDefault()}
            >
              {filtered.length === 0 && <div className="model-picker-empty">没有匹配的模型</div>}
              {filtered.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`model-picker-option${m === props.value ? " active" : ""}`}
                  onMouseDown={() => { props.onChange(m); setOpen(false); }}
                >
                  {m}
                </button>
              ))}
            </div>,
            document.body,
          )}
      </div>
    </Field>
  );
}

export function SiteConfigManager() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin", "site-config"], queryFn: adminApi.siteConfig });
  const [form, setForm] = useState<FormState>(() => toForm(defaultSiteConfig));
  const [footerBadgesError, setFooterBadgesError] = useState("");
  // 模型列表：点击「获取模型列表」时才请求上游 /v1/models
  const modelsQuery = useQuery({ queryKey: ["admin", "ai-models"], queryFn: adminApi.aiModels, enabled: false, retry: false });
  const modelOptions = modelsQuery.data?.models ?? [];

  useEffect(() => {
    if (query.data) setForm(toForm(normalizeSiteConfig(query.data)));
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: adminApi.updateSiteConfig,
    onSuccess: async (data) => {
      setForm(toForm(normalizeSiteConfig(data)));
      await queryClient.invalidateQueries({ queryKey: ["admin", "site-config"] });
    },
  });

  const canSave = useMemo(() => Boolean(form.title.trim() && form.authorName.trim()), [form]);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const updateSocial = (key: keyof SiteConfig["social"], value: string) =>
    setForm((current) => ({ ...current, social: { ...current.social, [key]: value } }));

  const save = () => {
    try {
      const payload = fromForm(form);
      if (!payload.footerBadges.length && form.footerBadgesText.trim() !== "[]") JSON.parse(form.footerBadgesText);
      setFooterBadgesError("");
      mutation.mutate(payload);
    } catch {
      setFooterBadgesError("页脚徽章必须是合法 JSON 数组");
    }
  };

  const error = query.error || mutation.error;
  return (
    <>
      <div className="config-intro">
        <div className="config-preview">
          <span className="admin-brand-mark">{form.authorName.slice(0, 1) || "运"}</span>
          <p><strong>{form.navTitle} <i>{form.navSuffix}</i> {form.navAfter}</strong><small>{form.bio}</small></p>
        </div>
        <p>修改内容会影响前台展示。API 密钥等敏感配置在保存后不会再次明文显示。</p>
      </div>
      <StateBlock loading={query.isLoading} />
      {error && <div className="admin-state-block error">{error instanceof Error ? error.message : "加载失败"}</div>}
      {mutation.isSuccess && <div className="admin-state-block success">站点配置已保存，前台刷新后生效。</div>}
      <div className="config-save-row">
        <button className="button primary" type="button" disabled={!canSave || mutation.isPending} onClick={save}>✓ 保存配置</button>
      </div>

      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <Section index="01" title="基础信息" description="站点名称、作者身份和公共简介。">
          <Field label="站点标题"><input value={form.title} onChange={(e) => update("title", e.target.value)} /></Field>
          <Field label="Favicon URL"><input value={form.faviconUrl} onChange={(e) => update("faviconUrl", e.target.value)} /></Field>
          <Field label="作者名称"><input value={form.authorName} onChange={(e) => update("authorName", e.target.value)} /></Field>
          <Field label="头像 URL"><input value={form.avatarUrl} onChange={(e) => update("avatarUrl", e.target.value)} /></Field>
          <Field label="简介" full><textarea rows={3} value={form.bio} onChange={(e) => update("bio", e.target.value)} /></Field>
        </Section>

        <Section index="02" title="导航品牌与外观" description="控制顶部品牌组合和前台背景图片。">
          <Field label="导航前缀"><input value={form.navTitle} onChange={(e) => update("navTitle", e.target.value)} /></Field>
          <Field label="连接符"><input value={form.navSuffix} onChange={(e) => update("navSuffix", e.target.value)} /></Field>
          <Field label="导航后缀"><input value={form.navAfter} onChange={(e) => update("navAfter", e.target.value)} /></Field>
          <Field label="背景图片 URL（一行一个）" full><textarea rows={4} value={form.bgImagesText} onChange={(e) => update("bgImagesText", e.target.value)} /></Field>
          <Field label="默认文章封面 URL" full><input value={form.defaultPostCover} onChange={(e) => update("defaultPostCover", e.target.value)} /></Field>
        </Section>

        <Section index="03" title="社交链接" description="留空的项目不会在前台显示。">
          <Field label="GitHub"><input value={form.social.github} onChange={(e) => updateSocial("github", e.target.value)} /></Field>
          <Field label="Demo"><input value={form.social.demo} onChange={(e) => updateSocial("demo", e.target.value)} /></Field>
          <Field label="Gitee"><input value={form.social.gitee} onChange={(e) => updateSocial("gitee", e.target.value)} /></Field>
          <Field label="Google"><input value={form.social.google} onChange={(e) => updateSocial("google", e.target.value)} /></Field>
          <Field label="邮箱"><input type="email" value={form.social.email} onChange={(e) => updateSocial("email", e.target.value)} /></Field>
          <Field label="QQ"><input value={form.social.qq} onChange={(e) => updateSocial("qq", e.target.value)} /></Field>
          <Field label="微信"><input value={form.social.wechat} onChange={(e) => updateSocial("wechat", e.target.value)} /></Field>
        </Section>

        <Section index="04" title="功能配置" description="建站时间、页脚徽章与页脚固定文案。">
          <Field label="建站时间" help="留空则从本次部署（构建）时刻起算；选择日期后从该时刻累计运行时长。"><input type="datetime-local" value={toDateTimeLocal(form.buildDate)} onChange={(e) => update("buildDate", e.target.value)} /></Field>
          <Field label="运行时长文案（前缀）" help="只填固定文案，运行时长会自动拼接在后面。"><input value={form.uptimeLabel} onChange={(e) => update("uptimeLabel", e.target.value)} /></Field>
          <Field label="版权后缀（Built with …）"><input value={form.footerBuiltWith} onChange={(e) => update("footerBuiltWith", e.target.value)} /></Field>
          <Field label="页脚徽章 JSON" full help={footerBadgesError || "请输入合法 JSON 数组，保存前会进行格式检查。"}>
            <textarea rows={5} value={form.footerBadgesText} onChange={(e) => update("footerBadgesText", e.target.value)} />
          </Field>
        </Section>

        <Section index="05" title="AI 配置" description="用于文章编辑器内的写作助手。">
          <Field label="API Key" help="仅在服务端加密保存。"><input type="password" value={form.aiConfig.apiKey} onChange={(e) => update("aiConfig", { ...form.aiConfig, apiKey: e.target.value })} /></Field>
          <Field label="Base URL"><input value={form.aiConfig.baseUrl} onChange={(e) => update("aiConfig", { ...form.aiConfig, baseUrl: e.target.value })} /></Field>
          <div className="model-fetch-row">
            <button className="button" type="button" disabled={modelsQuery.isFetching} onClick={() => void modelsQuery.refetch()}>
              {modelsQuery.isFetching ? "获取中…" : modelsQuery.data !== undefined ? "刷新列表" : "获取模型列表"}
            </button>
            {modelsQuery.error instanceof Error ? (
              <small className="error">获取失败：{modelsQuery.error.message}</small>
            ) : modelsQuery.data ? (
              <small>已获取 {modelsQuery.data.models.length} 个模型，点击输入框右侧 ▾ 下拉选择，或直接手动填写。</small>
            ) : (
              <small>从上游拉取可用模型列表，下方两个模型选择框共用。</small>
            )}
          </div>
          <ModelPicker
            label="模型"
            help="日常写作与补全使用的主模型。"
            value={form.aiConfig.model}
            onChange={(model) => update("aiConfig", { ...form.aiConfig, model })}
            models={modelOptions}
            fetched={modelsQuery.data !== undefined}
          />
          <ModelPicker
            label="视觉模型（可选）"
            help="仅用于「图片→Markdown」识别；留空则使用主模型。显式配置后跳过能力校验。列表与上方共用。"
            value={form.aiConfig.visionModel}
            onChange={(visionModel) => update("aiConfig", { ...form.aiConfig, visionModel })}
            models={modelOptions}
            fetched={modelsQuery.data !== undefined}
          />
          <Field label="Max Tokens"><input type="number" value={form.aiConfig.maxTokens} onChange={(e) => update("aiConfig", { ...form.aiConfig, maxTokens: Number(e.target.value) })} /></Field>
          <Field label="Temperature"><input type="number" step="0.1" value={form.aiConfig.temperature} onChange={(e) => update("aiConfig", { ...form.aiConfig, temperature: Number(e.target.value) })} /></Field>
          <Field label="系统提示词" full><textarea rows={5} value={form.aiConfig.systemPrompt} onChange={(e) => update("aiConfig", { ...form.aiConfig, systemPrompt: e.target.value })} /></Field>
        </Section>

        <Section index="06" title="备案与友链申请" description="配置页脚备案信息和前台申请说明。">
          <Field label="备案信息">
            <select value={form.icpConfig ? "enabled" : "disabled"} onChange={(e) => update("icpConfig", e.target.value === "enabled" ? { name: "", link: "" } : null)}>
              <option value="disabled">不显示</option><option value="enabled">显示</option>
            </select>
          </Field>
          {form.icpConfig && <>
            <Field label="备案名称"><input value={form.icpConfig.name} onChange={(e) => update("icpConfig", { ...form.icpConfig!, name: e.target.value })} /></Field>
            <Field label="备案链接" full><input value={form.icpConfig.link} onChange={(e) => update("icpConfig", { ...form.icpConfig!, link: e.target.value })} /></Field>
          </>}
          <Field label="友链申请格式" full><textarea rows={6} value={form.friendLinkApplyFormat} onChange={(e) => update("friendLinkApplyFormat", e.target.value)} /></Field>
        </Section>

        <Section index="07" title="首页首屏文案" description="首页 Hero 区的大标题、角色和引导语。">
          <Field label="眉题（eyebrow）"><input value={form.heroEyebrow} onChange={(e) => update("heroEyebrow", e.target.value)} /></Field>
          <Field label="角色说明"><input value={form.heroRole} onChange={(e) => update("heroRole", e.target.value)} /></Field>
          <Field label="大标题" full help="用 *内容* 表示高亮（斜体），用换行表示换行，例如：人生苦短，↵我用 *Python*。"><textarea rows={2} value={form.heroTitle} onChange={(e) => update("heroTitle", e.target.value)} /></Field>
          <Field label="引导语" full help="显示在「嗨，我是〔名字〕。」之后。"><textarea rows={2} value={form.heroLead} onChange={(e) => update("heroLead", e.target.value)} /></Field>
        </Section>
      </form>
    </>
  );
}
