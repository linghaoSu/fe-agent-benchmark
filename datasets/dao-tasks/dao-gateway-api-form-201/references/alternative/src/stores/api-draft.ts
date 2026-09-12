// 创建 API 草稿的数据结构与默认值（alternative 实现：null 表示未填写的数字）。

export const OPTIONS = {
  groups: ['default', 'payments', 'search'],
  domains: ['api.example.com', 'gw.example.com'],
  services: ['order-svc', 'user-svc', 'search-svc'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  pathTypes: [['prefix', '前缀匹配'], ['exact', '精确匹配'], ['regex', '正则匹配']],
  operators: [['equal', '等于'], ['prefix', '前缀'], ['regex', '正则']],
  targets: [['service', '后端服务'], ['redirect', '重定向'], ['direct', '直接返回']],
  lbModes: [['roundRobin', '轮询'], ['random', '随机'], ['weighted', '权重'], ['cookie', 'Cookie'], ['requestHash', '请求 Hash']],
  hashSources: [['header', '请求头'], ['query', '请求参数']],
  headerActions: [['add', '添加'], ['set', '覆盖'], ['remove', '删除']],
  httpRetry: [['5xx', '5XX'], ['gateway-error', '网关错误'], ['reset', '请求重置'], ['connect-failure', '连接失败']],
  grpcRetry: [['cancelled', '请求被取消'], ['deadline-exceeded', '响应超时'], ['internal', '服务内部错误'], ['resource-exhausted', '资源不足'], ['unavailable', '服务不可用']],
  windows: [['second', '秒'], ['minute', '分钟']],
  statusCodes: [429, 403, 503],
  accessModes: [['domain', '应用域名配置'], ['allow', '允许'], ['deny', '拒绝']],
  jwtModes: [['domain', '应用域名配置'], ['disabled', '不启用']],
  authModes: [['domain', '应用域名配置'], ['skip', '跳过鉴权']],
} as const;

export type Pair = readonly [string, string];

export interface KV { key: string; value: string }
export interface MatchDraft extends KV { operator: string }
export interface ServiceDraft { name: string; weight: number | null; mirror: boolean }
export interface RouteDraft {
  headers: MatchDraft[];
  params: MatchDraft[];
  target: 'service' | 'redirect' | 'direct';
  autoWeight: boolean;
  services: ServiceDraft[];
  redirectUrl: string;
  directStatus: number | null;
  directBody: string;
}
export interface HashDraft { source: string; key: string; terminal: boolean }
export interface HeaderDraft extends KV { action: string }
export interface CookieDraft { name: string; domain: string; path: string; secure: string; sameSite: string }

export interface PolicyDraft {
  lbMode: string;
  hashByHeader: boolean;
  hashRows: HashDraft[];
  hashByIp: boolean;
  rewrite: boolean;
  rewriteFrom: string;
  rewriteTo: string;
  timeout: boolean;
  timeoutMinutes: number | null;
  retry: boolean;
  retryCount: number | null;
  retryTimeoutMinutes: number | null;
  retryHttpConditions: string[];
  retryHttpStatusCodes: string[];
  retryGrpcConditions: string[];
  requestHeaderRewrite: boolean;
  requestHeaderRows: HeaderDraft[];
  responseHeaderRewrite: boolean;
  responseHeaderRows: HeaderDraft[];
  websocket: boolean;
  rateLimit: boolean;
  rateLimitRps: number | null;
  rateLimitWindow: string;
  rateLimitBurst: number | null;
  rateLimitStatus: number;
  rateLimitHeaders: KV[];
  healthCheck: boolean;
  cookieRewrite: boolean;
  cookieRows: CookieDraft[];
  accessMode: string;
}

export interface ApiDraft {
  name: string;
  group: string;
  domains: string[];
  pathType: string;
  path: string;
  methods: string[];
  routes: RouteDraft[];
  policy: PolicyDraft;
  security: { jwtMode: string; authMode: string; extraParams: KV[] };
}

export const emptyKV = (): KV => ({
  key: '',
  value: '',
});
export const emptyMatch = (): MatchDraft => ({
  key: '',
  operator: 'equal',
  value: '',
});
export const emptyService = (): ServiceDraft => ({
  name: '',
  weight: null,
  mirror: false,
});
export const emptyRoute = (): RouteDraft => ({
  headers: [],
  params: [],
  target: 'service',
  autoWeight: false,
  services: [emptyService()],
  redirectUrl: '',
  directStatus: null,
  directBody: '',
});
export const emptyHash = (): HashDraft => ({
  source: 'header',
  key: '',
  terminal: false,
});
export const emptyHeader = (): HeaderDraft => ({
  action: 'add',
  key: '',
  value: '',
});
export const emptyCookie = (): CookieDraft => ({
  name: '',
  domain: '',
  path: '',
  secure: '',
  sameSite: '',
});

export const emptyDraft = (): ApiDraft => ({
  name: '',
  group: '',
  domains: [],
  pathType: 'prefix',
  path: '',
  methods: [],
  routes: [emptyRoute()],
  policy: {
    lbMode: 'roundRobin',
    hashByHeader: false,
    hashRows: [emptyHash()],
    hashByIp: false,
    rewrite: false,
    rewriteFrom: '',
    rewriteTo: '',
    timeout: false,
    timeoutMinutes: null,
    retry: false,
    retryCount: null,
    retryTimeoutMinutes: null,
    retryHttpConditions: [],
    retryHttpStatusCodes: [],
    retryGrpcConditions: [],
    requestHeaderRewrite: false,
    requestHeaderRows: [emptyHeader()],
    responseHeaderRewrite: false,
    responseHeaderRows: [emptyHeader()],
    websocket: false,
    rateLimit: false,
    rateLimitRps: null,
    rateLimitWindow: 'second',
    rateLimitBurst: 0,
    rateLimitStatus: 429,
    rateLimitHeaders: [],
    healthCheck: false,
    cookieRewrite: false,
    cookieRows: [emptyCookie()],
    accessMode: 'domain',
  },
  security: {
    jwtMode: 'domain',
    authMode: 'domain',
    extraParams: [],
  },
});

const keyed = <T extends { key: string }>(rows: T[]) => rows.filter((row) => row.key.trim());
const toggled = <T>(enabled: boolean, body: () => T) => (enabled ? {
  enabled: true,
  ...body(),
} : { enabled: false });

/** 提交 payload（与 README 中的结构一致）。 */
export function serializeDraft(draft: ApiDraft) {
  const { policy: p, security } = draft;

  return {
    name: draft.name,
    group: draft.group,
    domains: draft.domains.slice(),
    match: {
      pathType: draft.pathType,
      path: draft.path,
      methods: draft.methods.slice(),
    },
    routes: draft.routes.map((route) => {
      const base = {
        headers: keyed(route.headers).map(({ key, operator, value }) => ({
          key,
          operator,
          value,
        })),
        params: keyed(route.params).map(({ key, operator, value }) => ({
          key,
          operator,
          value,
        })),
        target: route.target,
      };

      switch (route.target) {
        case 'service':
          return {
            ...base,
            autoWeight: route.autoWeight,
            services: route.services.map((service) => ({
              name: service.name,
              weight: route.autoWeight ? null : service.weight,
              mirror: service.mirror,
            })),
          };
        case 'redirect':
          return {
            ...base,
            redirectUrl: route.redirectUrl,
          };
        default:
          return {
            ...base,
            directStatus: route.directStatus,
            directBody: route.directBody,
          };
      }
    }),
    policy: {
      lbMode: p.lbMode,
      ...(p.lbMode === 'requestHash' ? {
        hash: {
          byHeader: p.hashByHeader,
          rows: p.hashByHeader ? keyed(p.hashRows).map(({ source, key, terminal }) => ({
            source,
            key,
            terminal,
          })) : [],
          byIp: p.hashByIp,
        },
      } : {}),
      rewrite: toggled(p.rewrite, () => ({
        from: p.rewriteFrom,
        to: p.rewriteTo,
      })),
      timeout: toggled(p.timeout, () => ({ minutes: p.timeoutMinutes })),
      retry: toggled(p.retry, () => ({
        count: p.retryCount,
        timeoutMinutes: p.retryTimeoutMinutes,
        httpConditions: p.retryHttpConditions.slice(),
        httpStatusCodes: p.retryHttpStatusCodes.slice(),
        grpcConditions: p.retryGrpcConditions.slice(),
      })),
      requestHeaders: toggled(p.requestHeaderRewrite, () => ({
        rows: keyed(p.requestHeaderRows).map(({ action, key, value }) => ({
          action,
          key,
          value,
        })),
      })),
      responseHeaders: toggled(p.responseHeaderRewrite, () => ({
        rows: keyed(p.responseHeaderRows).map(({ action, key, value }) => ({
          action,
          key,
          value,
        })),
      })),
      websocket: p.websocket,
      rateLimit: toggled(p.rateLimit, () => ({
        rps: p.rateLimitRps,
        window: p.rateLimitWindow,
        burst: p.rateLimitBurst,
        status: p.rateLimitStatus,
        headers: keyed(p.rateLimitHeaders).map(({ key, value }) => ({
          key,
          value,
        })),
      })),
      healthCheck: p.healthCheck,
      cookieRewrite: toggled(p.cookieRewrite, () => ({
        cookies: p.cookieRows.filter((row) => row.name.trim()).map(({
          name, domain, path, secure, sameSite,
        }) => ({
          name,
          domain,
          path,
          secure,
          sameSite,
        })),
      })),
      accessMode: p.accessMode,
    },
    security: {
      jwtMode: security.jwtMode,
      authMode: security.authMode,
      extraParams: keyed(security.extraParams).map(({ key, value }) => ({
        key,
        value,
      })),
    },
  };
}
