/**
 * 集中化的SEO配置文件
 * 其他开发者只需要修改这一个文件即可完成所有SEO配置
 */

export interface SEOConfig {
  // 基础信息
  siteName: string;
  siteUrl: string;
  title: string;
  description: string;
  keywords: string[];
  author: string;
  language: string;

  // 社交媒体
  ogImage: string;
  twitterHandle?: string;

  // 品牌色彩
  themeColor: string;

  // 页面配置
  pages: {
    [path: string]: {
      title?: string;
      description?: string;
      keywords?: string[];
      changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
      priority?: number;
    };
  };
}

/**
 * 默认SEO配置
 * 🎯 用户只需要修改这个配置对象即可完成整站SEO设置
 */
export const seoConfig: SEOConfig = {
  // 🌟 基础网站信息（必须修改）
  siteName: "邪王真眼の支配者",
  siteUrl: "https://blog.926448.xyz",
  title: "邪王真眼の支配者",
  description: "RIKKA的个人博客，一个二次元开发者一枚呀~",
  keywords: [
    "RIKKA",
    "邪王真眼",
    "RikkaSaiko1"
  ],
  author: "RIKKA",
  language: "zh-CN",

  // 🎨 社交媒体和品牌
  ogImage: "",
  themeColor: "#8A2BE2",

  // 📄 页面级配置
  pages: {
    "/": {
      title: "RIKKA の庭 - 二次元重度依存者",
      description: "RIKKA的个人博客，记录全栈开发、部署与 AI 实践。",
      keywords: ["RIKKA", "个人博客", "全栈开发", "Cloudflare", "React", "Python", "Agent"],
      changefreq: "daily",
      priority: 1.0,
    },
    "/blog": {
      title: "文章归档 - RIKKA的小窝",
      description: "按月份浏览博客全部文章，并通过标签筛查内容。",
      keywords: ["博客", "文章归档", "标签", "月份归档"],
      changefreq: "daily",
      priority: 0.9,
    },
  },
};

/**
 * 生成页面的完整标题
 */
export function generatePageTitle(path: string): string {
  const pageConfig = seoConfig.pages[path];
  return pageConfig?.title || `${seoConfig.title} | ${seoConfig.siteName}`;
}

/**
 * 生成页面描述
 */
export function generatePageDescription(path: string): string {
  const pageConfig = seoConfig.pages[path];
  return pageConfig?.description || seoConfig.description;
}

/**
 * 生成页面关键词
 */
export function generatePageKeywords(path: string): string {
  const pageConfig = seoConfig.pages[path];
  const keywords = pageConfig?.keywords || seoConfig.keywords;
  return keywords.join(",");
}

/**
 * 生成完整的页面URL
 */
export function generatePageUrl(path: string): string {
  return `${seoConfig.siteUrl}${path === "/" ? "" : path}`;
}
