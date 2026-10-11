import type { Bindings } from "../types";

export type UsageResponse = {
  configured: boolean;
  workers?: { requests24h: number; errors24h: number; requests30d: number };
  r2?: { operations30d: number; storageBytes: number; objectCount: number };
  limits: {
    workersFreeRequestsPerDay: number;
    workersFreeRequestsPerMonth: number;
    r2FreeStorageBytes: number;
  };
};

const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const CACHE_TTL_MS = 5 * 60 * 1000;

// 用量数据变化缓慢，5 分钟缓存避免频繁消耗 Cloudflare API 配额
let cache: { data: UsageResponse; expiresAt: number } | null = null;

export async function getUsage(bindings: Bindings): Promise<UsageResponse> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const accountId = bindings.CF_ACCOUNT_ID;
  const apiToken = bindings.CF_API_TOKEN;
  const limits = {
    workersFreeRequestsPerDay: 100_000,
    workersFreeRequestsPerMonth: 3_000_000,
    r2FreeStorageBytes: 10 * 1024 * 1024 * 1024,
  };

  if (!accountId || !apiToken) {
    return { configured: false, limits };
  }

  const now = new Date();
  const start24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const start30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = `query SiteUsage {
    viewer {
      accounts(filter: { accountTag: "${accountId}" }) {
        workers24h: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: "${start24}" }) {
          sum { requests errors }
        }
        workers30d: workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: "${start30}" }) {
          sum { requests }
        }
        r2Ops30d: r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: "${start30}" }) {
          sum { requests }
        }
        r2Storage: r2StorageAdaptiveGroups(limit: 1, filter: { datetime_geq: "${start30}" }) {
          max { payloadSize objectCount }
        }
      }
    }
  }`;

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    throw new Error(`Cloudflare API ${response.status}`);
  }

  const payload = (await response.json()) as {
    errors?: Array<{ message: string }>;
    data?: {
      viewer?: {
        accounts?: Array<{
          workers24h?: Array<{ sum?: { requests?: number; errors?: number } }>;
          workers30d?: Array<{ sum?: { requests?: number } }>;
          r2Ops30d?: Array<{ sum?: { requests?: number } }>;
          r2Storage?: Array<{ max?: { payloadSize?: number; objectCount?: number } }>;
        }>;
      };
    };
  };

  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message || "Cloudflare 用量查询失败");
  }

  const account = payload.data?.viewer?.accounts?.[0];
  const data: UsageResponse = {
    configured: true,
    workers: {
      requests24h: Number(account?.workers24h?.[0]?.sum?.requests ?? 0),
      errors24h: Number(account?.workers24h?.[0]?.sum?.errors ?? 0),
      requests30d: Number(account?.workers30d?.[0]?.sum?.requests ?? 0),
    },
    r2: {
      operations30d: Number(account?.r2Ops30d?.[0]?.sum?.requests ?? 0),
      storageBytes: Number(account?.r2Storage?.[0]?.max?.payloadSize ?? 0),
      objectCount: Number(account?.r2Storage?.[0]?.max?.objectCount ?? 0),
    },
    limits,
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
