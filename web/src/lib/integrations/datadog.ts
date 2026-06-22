export interface DatadogConfig {
  apiKey: string;
  appKey: string;
  site: string;
  service: string;
  iosService: string;
  androidService: string;
}

export interface DatadogMetrics {
  http: {
    errorRate: number;
    avgLatency: number;
    maxLatency: number;
    apdex: number;
    requestVolume: number;
  };
  graphql: {
    errorRate: number;
    avgLatency: number;
    apdex: number;
    requestVolume: number;
    errorCount: number;
  };
  grpc: {
    errorRate: number;
    avgLatency: number;
    apdex: number;
    requestVolume: number;
  };
  app: {
    errorCount: number;
    dbDisconnects: number;
  };
  mobile: {
    iosCrashFreeRate: number | null;
    androidCrashFreeRate: number | null;
  };
  overall: {
    errorRate: number;
    apdex: number;
    avgLatency: number;
    totalRequests: number;
  };
}

interface DatadogQueryResponse {
  series?: Array<{
    pointlist: Array<[number, number | null]>;
    metric: string;
    aggr?: string;
  }>;
  status?: string;
  error?: string;
}

async function query(
  config: DatadogConfig,
  from: number,
  to: number,
  q: string,
): Promise<number | null> {
  const url = new URL(`https://api.${config.site}/api/v1/query`);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  url.searchParams.set("query", q);

  const res = await fetch(url.toString(), {
    headers: {
      "DD-API-KEY": config.apiKey,
      "DD-APPLICATION-KEY": config.appKey,
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as DatadogQueryResponse;
  if (!data.series?.length) return null;

  const points = data.series[0].pointlist.filter(
    (p): p is [number, number] => p[1] !== null,
  );
  if (points.length === 0) return null;

  return points.reduce((sum, p) => sum + p[1], 0) / points.length;
}

async function querySum(
  config: DatadogConfig,
  from: number,
  to: number,
  q: string,
): Promise<number> {
  const url = new URL(`https://api.${config.site}/api/v1/query`);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  url.searchParams.set("query", q);

  const res = await fetch(url.toString(), {
    headers: {
      "DD-API-KEY": config.apiKey,
      "DD-APPLICATION-KEY": config.appKey,
    },
  });

  if (!res.ok) return 0;

  const data = (await res.json()) as DatadogQueryResponse;
  if (!data.series?.length) return 0;

  return data.series[0].pointlist
    .filter((p): p is [number, number] => p[1] !== null)
    .reduce((sum, p) => sum + p[1], 0);
}

export async function fetchDatadogMetrics(
  config: DatadogConfig,
  periodDays: number,
): Promise<DatadogMetrics> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - periodDays * 86400;
  const svc = `service:${config.service}`;

  const [
    httpHits,
    httpErrors,
    httpAvgLatency,
    httpMaxLatency,
    httpApdex,
    gqlHits,
    gqlErrors,
    gqlAvgLatency,
    gqlApdex,
    grpcHits,
    grpcErrors,
    grpcAvgLatency,
    grpcApdex,
    appErrors,
    dbDisconnects,
    iosCrashFree,
    androidCrashFree,
  ] = await Promise.all([
    querySum(config, from, now, `sum:trace.http.server.request.hits{${svc}}.as_count()`),
    querySum(config, from, now, `sum:trace.http.server.request.errors{${svc}}.as_count()`),
    query(config, from, now, `avg:trace.http.server.request.duration{${svc}}`),
    query(config, from, now, `max:trace.http.server.request.duration{${svc}}`),
    query(config, from, now, `avg:trace.http.server.request.apdex{${svc}}`),
    querySum(config, from, now, `sum:trace.graphql.server.request.hits{${svc}}.as_count()`),
    querySum(config, from, now, `sum:trace.graphql.server.request.errors{${svc}}.as_count()`),
    query(config, from, now, `avg:trace.graphql.server.request.duration{${svc}}`),
    query(config, from, now, `avg:trace.graphql.server.request.apdex{${svc}}`),
    querySum(config, from, now, `sum:trace.grpc.server.request.hits{${svc}}.as_count()`),
    querySum(config, from, now, `sum:trace.grpc.server.request.errors{${svc}}.as_count()`),
    query(config, from, now, `avg:trace.grpc.server.request.duration{${svc}}`),
    query(config, from, now, `avg:trace.grpc.server.request.apdex{${svc}}`),
    querySum(config, from, now, `sum:live.error.count{*}.as_count()`),
    querySum(config, from, now, `sum:live.db_disconnects.count{*}.as_count()`),
    config.iosService
      ? query(config, from, now, `avg:rum.measure.session.crash_free{service:${config.iosService}}`)
      : Promise.resolve(null),
    config.androidService
      ? query(config, from, now, `avg:rum.measure.session.crash_free{service:${config.androidService}}`)
      : Promise.resolve(null),
  ]);

  const httpErrorRate = httpHits > 0 ? (httpErrors / httpHits) * 100 : 0;
  const gqlErrorRate = gqlHits > 0 ? (gqlErrors / gqlHits) * 100 : 0;
  const grpcErrorRate = grpcHits > 0 ? (grpcErrors / grpcHits) * 100 : 0;

  const totalHits = httpHits + gqlHits + grpcHits;
  const totalErrors = httpErrors + gqlErrors + grpcErrors;
  const overallErrorRate = totalHits > 0 ? (totalErrors / totalHits) * 100 : 0;

  const apdexValues = [httpApdex, gqlApdex, grpcApdex].filter((a): a is number => a !== null);
  const overallApdex = apdexValues.length > 0 ? apdexValues.reduce((a, b) => a + b, 0) / apdexValues.length : 1;

  const latencies = [httpAvgLatency, gqlAvgLatency, grpcAvgLatency].filter((l): l is number => l !== null);
  const overallLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  return {
    http: {
      errorRate: round(httpErrorRate, 3),
      avgLatency: round(httpAvgLatency ?? 0, 3),
      maxLatency: round(httpMaxLatency ?? 0, 2),
      apdex: round(httpApdex ?? 1, 3),
      requestVolume: Math.round(httpHits),
    },
    graphql: {
      errorRate: round(gqlErrorRate, 3),
      avgLatency: round(gqlAvgLatency ?? 0, 3),
      apdex: round(gqlApdex ?? 1, 3),
      requestVolume: Math.round(gqlHits),
      errorCount: Math.round(gqlErrors),
    },
    grpc: {
      errorRate: round(grpcErrorRate, 3),
      avgLatency: round(grpcAvgLatency ?? 0, 3),
      apdex: round(grpcApdex ?? 1, 3),
      requestVolume: Math.round(grpcHits),
    },
    app: {
      errorCount: Math.round(appErrors),
      dbDisconnects: Math.round(dbDisconnects),
    },
    mobile: {
      iosCrashFreeRate: iosCrashFree !== null ? Math.min(round(iosCrashFree * 100, 2), 100) : null,
      androidCrashFreeRate: androidCrashFree !== null ? Math.min(round(androidCrashFree * 100, 2), 100) : null,
    },
    overall: {
      errorRate: round(overallErrorRate, 3),
      apdex: round(overallApdex, 3),
      avgLatency: round(overallLatency, 3),
      totalRequests: Math.round(totalHits),
    },
  };
}

function round(v: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(v * f) / f;
}
