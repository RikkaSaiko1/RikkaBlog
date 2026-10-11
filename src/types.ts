export type Bindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  IMAGES: R2Bucket;
  NODE_ENV: "development" | "production" | "test";
  VITE_PORT: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  APP_BASE_URL: string;
  QWEATHER_KEY?: string;
  CF_ACCOUNT_ID?: string;
  CF_API_TOKEN?: string;
};
