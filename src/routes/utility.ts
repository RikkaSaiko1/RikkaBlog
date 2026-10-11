import { OpenAPIHono } from "@hono/zod-openapi";
import type { Bindings } from "../types";

const app = new OpenAPIHono<{ Bindings: Bindings }>();

// 天气查询内存缓存：公开接口直通和风天气会消耗配额，同一城市 5 分钟内复用结果
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000;
const WEATHER_FETCH_TIMEOUT_MS = 10_000;
const weatherCache = new Map<string, { data: Record<string, unknown>; expiresAt: number }>();

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

app.get("/weather", async (c) => {
  const key = c.env.QWEATHER_KEY;
  const location = c.req.query("location") || c.req.query("city");
  if (!location) return c.json({ code: 400, message: "location 不能为空" }, 400);
  if (!key) return c.json({ code: 503, message: "天气密钥未配置" }, 503);

  const cached = weatherCache.get(location);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.data);
  }

  try {
    const lookup = await fetchWithTimeout(
      `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(location)}&key=${key}`,
    );
    if (!lookup.ok) return c.json({ code: lookup.status, message: "城市查询失败" }, 502);
    const lookupData = (await lookup.json()) as { location?: Array<{ id: string; name: string }> };
    const id = lookupData.location?.[0]?.id;
    if (!id) return c.json({ code: 404, message: "城市不存在" }, 404);

    const weather = await fetchWithTimeout(`https://devapi.qweather.com/v7/weather/now?location=${id}&key=${key}`);
    if (!weather.ok) return c.json({ code: weather.status, message: "天气查询失败" }, 502);
    const weatherData = (await weather.json()) as Record<string, unknown>;
    weatherCache.set(location, { data: weatherData, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS });
    // 缓存只保留最近 50 个城市，避免长期驻留内存
    if (weatherCache.size > 50) {
      const oldest = weatherCache.keys().next().value;
      if (oldest !== undefined) weatherCache.delete(oldest);
    }
    return c.json(weatherData);
  } catch {
    return c.json({ code: 502, message: "天气请求失败" }, 502);
  }
});

export default app;
