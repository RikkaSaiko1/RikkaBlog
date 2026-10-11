import { useQuery } from "@tanstack/react-query";
import { MarkdownView } from "../components/MarkdownView";
import { contentApi } from "../services/content";

const fallbackAbout = `## 关于页还没有内容

这里是「关于」页面。目前还没有发布任何内容，所以显示这份设置指引。

### 如何自定义这里的内容

1. 进入管理后台：点击页面右上角头像，或访问 \`/admin\`
2. 打开左侧菜单的 **「页面」**
3. 新建一个页面，**Slug 必须填写 \`about\`**
4. 在 Markdown 正文里写上你想展示的介绍
5. 状态选择 **「已发布」** 并保存
6. 回到本页面刷新，你写的内容就会替换这份指引

> 提示：只要发布了 slug 为 \`about\` 的页面，本指引会自动消失。`;

export function AboutPage() {
  const query = useQuery({ queryKey: ["page", "about"], queryFn: () => contentApi.page("about") });

  return (
    <div className="page-shell reading markdown-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">ABOUT / 关于</span>
          <h1>关于</h1>
        </div>
      </header>
      <article className="article-body markdown-page-card">
        {query.isLoading ? <div className="loader" /> : <MarkdownView content={query.data?.contentMd || fallbackAbout} />}
      </article>
    </div>
  );
}
