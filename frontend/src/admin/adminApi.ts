import { fetchWithAuth } from "../hooks/useAuth";
import { SiteConfig } from "../config/siteConfig";

export type Status = "draft" | "published";

export type AdminStats = {
  posts: number;
  moments: number;
  projects: number;
  pages: number;
  friendLinks: number;
  comments: number;
  users: number;
};

export type AdminAnalytics = {
  days: Array<{ date: string; count: number }>;
  total: number;
};

export type AdminActivityItem = {
  type: "post" | "comment" | "moment" | "friend";
  text: string;
  date: string;
};

export type AdminUsage = {
  configured: boolean;
  workers?: { requests24h: number; errors24h: number; requests30d: number };
  r2?: { operations30d: number; storageBytes: number; objectCount: number };
  limits: {
    workersFreeRequestsPerDay: number;
    workersFreeRequestsPerMonth: number;
    r2FreeStorageBytes: number;
  };
};

export type ListResponse<T> = {
  items: T[];
  pagination?: { page: number; pageSize: number; total: number };
};

export type AdminPost = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  cover: string | null;
  tags: string[];
  category: string | null;
  contentMd: string;
  viewCount: number;
  status: Status;
  publishedAt: string | null;
  updatedAt: string;
};

export type PostTaxonomy = {
  categories: string[];
  tags: string[];
};

export type AiChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AiPostContext = {
  title: string;
  slug: string;
  summary: string;
  category: string;
  tags: string[];
  contentMd: string;
};

export type AiCompletionField = "titles" | "slug" | "summary" | "category" | "tags";

export type AiCompletePostResponse = {
  titles?: string[];
  slug?: string;
  summary?: string;
  category?: string;
  tags?: string[];
};

export type AiPolishMomentMode = "polish" | "expand" | "condense";

export type AiCompleteProjectResponse = {
  name: string;
  description: string;
  tags: string[];
  icon?: string;
  githubUrl?: string;
};

export type AiCompletePageResponse = {
  title: string;
  slug: string;
};

export type AiFillFriendLinkResponse = {
  name: string;
  description: string;
  avatarUrl?: string | null;
};

export type AdminMoment = {
  id: string;
  slug: string;
  contentMd: string;
  location: string | null;
  images: string[];
  status: Status;
  publishedAt: string | null;
  updatedAt: string;
};

export type AdminProject = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  githubUrl: string | null;
  tags: string[];
  sortOrder: number;
  status: Status;
  updatedAt: string;
};

export type AdminPageItem = {
  id: string;
  slug: string;
  title: string;
  contentMd: string;
  status: Status;
  updatedAt: string;
};

export type AdminFriendLink = {
  id: string;
  name: string;
  description: string | null;
  url: string;
  avatarUrl: string | null;
  sortOrder: number;
  status: Status;
  updatedAt: string;
};

export type AdminNavItem = {
  id: string;
  label: string;
  path: string;
  sortOrder: number;
  status: "enabled" | "disabled";
  updatedAt: string;
};

export type AdminCommentItem = {
  id: string;
  content: string;
  status: "visible" | "hidden";
  username: string;
  postTitle: string;
  createdAt: string;
};

export type AdminUser = {
  id: string;
  username: string;
  email: string | null;
  role: "user" | "admin";
  status: "active" | "banned";
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(url, init);
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(data?.message || "请求失败");
  }
  return response.json() as Promise<T>;
}

function json(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export const adminApi = {
  stats: () => request<AdminStats>("/api/admin/stats"),
  analytics: () => request<AdminAnalytics>("/api/admin/analytics"),
  activity: () => request<{ items: AdminActivityItem[] }>("/api/admin/activity"),
  usage: () => request<AdminUsage>("/api/admin/usage"),
  siteConfig: () => request<SiteConfig>("/api/admin/site-config"),
  updateSiteConfig: (body: SiteConfig) => request<SiteConfig>("/api/admin/site-config", json("PUT", body)),
  posts: () => request<ListResponse<AdminPost>>("/api/admin/posts?page=1&pageSize=100"),
  postTaxonomy: () => request<PostTaxonomy>("/api/admin/post-taxonomy"),
  post: async (id: string) => {
    const data = await request<ListResponse<AdminPost>>("/api/admin/posts?page=1&pageSize=100");
    const post = data.items.find((item) => item.id === id);
    if (!post) throw new Error("文章不存在");
    return post;
  },
  createPost: (body: Omit<AdminPost, "id" | "publishedAt" | "updatedAt" | "viewCount">) => request<AdminPost>("/api/admin/posts", json("POST", body)),
  updatePost: (id: string, body: Partial<Omit<AdminPost, "id" | "publishedAt" | "updatedAt" | "viewCount">>) => request<AdminPost>(`/api/admin/posts/${id}`, json("PATCH", body)),
  deletePost: (id: string) => request<{ success: true }>(`/api/admin/posts/${id}`, { method: "DELETE" }),
  aiChat: (messages: AiChatMessage[], context: AiPostContext) =>
    request<{ reply: string }>("/api/ai/chat", json("POST", { messages, context })),
  completePost: (fields: AiCompletionField[], context: AiPostContext, postId?: string) =>
    request<AiCompletePostResponse>("/api/ai/complete-post", json("POST", { fields, context, postId })),
  aiPolishMoment: (contentMd: string, mode: AiPolishMomentMode) =>
    request<{ contentMd: string }>("/api/ai/polish-moment", json("POST", { contentMd, mode })),
  aiCompleteProject: (text: string) =>
    request<AiCompleteProjectResponse>("/api/ai/complete-project", json("POST", { text })),
  aiCompletePage: (contentMd: string, pageId?: string) =>
    request<AiCompletePageResponse>("/api/ai/complete-page", json("POST", { contentMd, pageId })),
  aiGeneratePage: (title: string) =>
    request<{ slug: string; contentMd: string }>("/api/ai/generate-page", json("POST", { title })),
  aiFillFriendLink: (url: string) =>
    request<AiFillFriendLinkResponse>("/api/ai/fill-friend-link", json("POST", { url })),
  aiModels: () => request<{ models: string[] }>("/api/ai/models"),
  // 上传文章图片到 R2：FormData 不手动设 Content-Type，让浏览器自动带 boundary
  uploadImage: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ url: string }>("/api/uploads/image", { method: "POST", body: form });
  },
  moments: () => request<ListResponse<AdminMoment>>("/api/admin/moments"),
  createMoment: (body: Omit<AdminMoment, "id" | "publishedAt" | "updatedAt">) => request<AdminMoment>("/api/admin/moments", json("POST", body)),
  updateMoment: (id: string, body: Partial<Omit<AdminMoment, "id" | "publishedAt" | "updatedAt">>) => request<AdminMoment>(`/api/admin/moments/${id}`, json("PATCH", body)),
  deleteMoment: (id: string) => request<{ success: true }>(`/api/admin/moments/${id}`, { method: "DELETE" }),
  projects: () => request<ListResponse<AdminProject>>("/api/admin/projects"),
  createProject: (body: Omit<AdminProject, "id" | "updatedAt">) => request<AdminProject>("/api/admin/projects", json("POST", body)),
  updateProject: (id: string, body: Partial<Omit<AdminProject, "id" | "updatedAt">>) => request<AdminProject>(`/api/admin/projects/${id}`, json("PATCH", body)),
  deleteProject: (id: string) => request<{ success: true }>(`/api/admin/projects/${id}`, { method: "DELETE" }),
  pages: () => request<ListResponse<AdminPageItem>>("/api/admin/pages"),
  createPage: (body: Omit<AdminPageItem, "id" | "updatedAt">) => request<AdminPageItem>("/api/admin/pages", json("POST", body)),
  updatePage: (id: string, body: Partial<Omit<AdminPageItem, "id" | "updatedAt">>) => request<AdminPageItem>(`/api/admin/pages/${id}`, json("PATCH", body)),
  deletePage: (id: string) => request<{ success: true }>(`/api/admin/pages/${id}`, { method: "DELETE" }),
  friendLinks: () => request<ListResponse<AdminFriendLink>>("/api/admin/friend-links"),
  createFriendLink: (body: Omit<AdminFriendLink, "id" | "updatedAt">) => request<AdminFriendLink>("/api/admin/friend-links", json("POST", body)),
  updateFriendLink: (id: string, body: Partial<Omit<AdminFriendLink, "id" | "updatedAt">>) => request<AdminFriendLink>(`/api/admin/friend-links/${id}`, json("PATCH", body)),
  deleteFriendLink: (id: string) => request<{ success: true }>(`/api/admin/friend-links/${id}`, { method: "DELETE" }),
  navItems: () => request<ListResponse<AdminNavItem>>("/api/admin/nav-items"),
  createNavItem: (body: Omit<AdminNavItem, "id" | "updatedAt">) => request<AdminNavItem>("/api/admin/nav-items", json("POST", body)),
  updateNavItem: (id: string, body: Partial<Omit<AdminNavItem, "id" | "updatedAt">>) => request<AdminNavItem>(`/api/admin/nav-items/${id}`, json("PATCH", body)),
  reorderNavItems: (ids: string[]) => request<{ success: true }>("/api/admin/nav-items/reorder", json("PATCH", { ids })),
  deleteNavItem: (id: string) => request<{ success: true }>(`/api/admin/nav-items/${id}`, { method: "DELETE" }),
  comments: () => request<ListResponse<AdminCommentItem>>("/api/admin/comments?page=1&pageSize=100"),
  updateComment: (id: string, status: "visible" | "hidden") => request<AdminCommentItem>(`/api/admin/comments/${id}`, json("PATCH", { status })),
  users: () => request<ListResponse<AdminUser>>("/api/admin/users?page=1&pageSize=100"),
  updateUserRole: (id: string, role: "user" | "admin") => request<AdminUser>(`/api/admin/users/${id}/role`, json("PATCH", { role })),
  updateUserStatus: (id: string, status: "active" | "banned") => request<AdminUser>(`/api/admin/users/${id}/status`, json("PATCH", { status })),
};

export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function joinLines(values: string[] | null | undefined): string {
  return (values ?? []).join("\n");
}
