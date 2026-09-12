// 创建云原生网关 API 表单的数据模型、默认值与提交 payload 构造。

export const API_GROUPS = ['default', 'payments', 'search'];
export const DOMAINS = ['api.example.com', 'gw.example.com'];
export const SERVICES = ['order-svc', 'user-svc', 'search-svc'];
export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

export const PATH_TYPES = [
  {
    value: 'prefix',
    label: '前缀匹配',
  },
  {
    value: 'exact',
    label: '精确匹配',
  },
  {
    value: 'regex',
    label: '正则匹配',
  },
];
export const MATCH_OPERATORS = [
  {
    value: 'equal',
    label: '等于',
  },
  {
    value: 'prefix',
    label: '前缀',
  },
  {
    value: 'regex',
    label: '正则',
  },
];
export const TARGET_TYPES = [
  {
    value: 'service',
    label: '后端服务',
  },
  {
    value: 'redirect',
    label: '重定向',
  },
  {
    value: 'direct',
    label: '直接返回',
  },
];
export const LB_MODES = [
  {
    value: 'roundRobin',
    label: '轮询',
  },
  {
    value: 'random',
    label: '随机',
  },
  {
    value: 'weighted',
    label: '权重',
  },
  {
    value: 'cookie',
    label: 'Cookie',
  },
  {
    value: 'requestHash',
    label: '请求 Hash',
  },
];
export const HASH_SOURCES = [
  {
    value: 'header',
    label: '请求头',
  },
  {
    value: 'query',
    label: '请求参数',
  },
];
export const HEADER_ACTIONS = [
  {
    value: 'add',
    label: '添加',
  },
  {
    value: 'set',
    label: '覆盖',
  },
  {
    value: 'remove',
    label: '删除',
  },
];
export const HTTP_RETRY_CONDITIONS = [
  {
    value: '5xx',
    label: '5XX',
  },
  {
    value: 'gateway-error',
    label: '网关错误',
  },
  {
    value: 'reset',
    label: '请求重置',
  },
  {
    value: 'connect-failure',
    label: '连接失败',
  },
];
export const GRPC_RETRY_CONDITIONS = [
  {
    value: 'cancelled',
    label: '请求被取消',
  },
  {
    value: 'deadline-exceeded',
    label: '响应超时',
  },
  {
    value: 'internal',
    label: '服务内部错误',
  },
  {
    value: 'resource-exhausted',
    label: '资源不足',
  },
  {
    value: 'unavailable',
    label: '服务不可用',
  },
];
export const RATE_LIMIT_CODES = [429, 403, 503];
export const WINDOW_UNITS = [
  {
    value: 'second',
    label: '秒',
  },
  {
    value: 'minute',
    label: '分钟',
  },
];
export const ACCESS_MODES = [
  {
    value: 'domain',
    label: '应用域名配置',
  },
  {
    value: 'allow',
    label: '允许',
  },
  {
    value: 'deny',
    label: '拒绝',
  },
];
export const JWT_MODES = [
  {
    value: 'domain',
    label: '应用域名配置',
  },
  {
    value: 'disabled',
    label: '不启用',
  },
];
export const AUTH_MODES = [
  {
    value: 'domain',
    label: '应用域名配置',
  },
  {
    value: 'skip',
    label: '跳过鉴权',
  },
];

export interface MatchRow { key: string; operator: string; value: string }
export interface ServiceRow { name: string; weight: number | undefined; mirror: boolean }
export interface Route {
  headers: MatchRow[];
  params: MatchRow[];
  target: 'service' | 'redirect' | 'direct';
  autoWeight: boolean;
  services: ServiceRow[];
  redirectUrl: string;
  directStatus: number | undefined;
  directBody: string;
}
export interface HashRow { source: string; key: string; terminal: boolean }
export interface HeaderRewriteRow { action: string; key: string; value: string }
export interface KeyValueRow { key: string; value: string }
export interface CookieRow { name: string; domain: string; path: string; secure: string; sameSite: string }

export interface ApiForm {
  name: string;
  group: string;
  domains: string[];
  pathType: string;
  path: string;
  methods: string[];
  routes: Route[];
  policy: {
    lbMode: string;
    hashByHeader: boolean;
    hashRows: HashRow[];
    hashByIp: boolean;
    rewrite: boolean;
    rewriteFrom: string;
    rewriteTo: string;
    timeout: boolean;
    timeoutMinutes: number | undefined;
    retry: boolean;
    retryCount: number | undefined;
    retryTimeoutMinutes: number | undefined;
    retryHttpConditions: string[];
    retryHttpStatusCodes: string[];
    retryGrpcConditions: string[];
    requestHeaderRewrite: boolean;
    requestHeaderRows: HeaderRewriteRow[];
    responseHeaderRewrite: boolean;
    responseHeaderRows: HeaderRewriteRow[];
    websocket: boolean;
    rateLimit: boolean;
    rateLimitRps: number | undefined;
    rateLimitWindow: string;
    rateLimitBurst: number | undefined;
    rateLimitStatus: number;
    rateLimitHeaders: KeyValueRow[];
    healthCheck: boolean;
    cookieRewrite: boolean;
    cookieRows: CookieRow[];
    accessMode: string;
  };
  security: {
    jwtMode: string;
    authMode: string;
    extraParams: KeyValueRow[];
  };
}

export const createMatchRow = (): MatchRow => ({
  key: '',
  operator: 'equal',
  value: '',
});
export const createServiceRow = (): ServiceRow => ({
  name: '',
  weight: undefined,
  mirror: false,
});
export const createRoute = (): Route => ({
  headers: [],
  params: [],
  target: 'service',
  autoWeight: false,
  services: [createServiceRow()],
  redirectUrl: '',
  directStatus: undefined,
  directBody: '',
});
export const createHashRow = (): HashRow => ({
  source: 'header',
  key: '',
  terminal: false,
});
export const createHeaderRewriteRow = (): HeaderRewriteRow => ({
  action: 'add',
  key: '',
  value: '',
});
export const createKeyValueRow = (): KeyValueRow => ({
  key: '',
  value: '',
});
export const createCookieRow = (): CookieRow => ({
  name: '',
  domain: '',
  path: '',
  secure: '',
  sameSite: '',
});

export function createForm(): ApiForm {
  return {
    name: '',
    group: '',
    domains: [],
    pathType: 'prefix',
    path: '',
    methods: [],
    routes: [createRoute()],
    policy: {
      lbMode: 'roundRobin',
      hashByHeader: false,
      hashRows: [createHashRow()],
      hashByIp: false,
      rewrite: false,
      rewriteFrom: '',
      rewriteTo: '',
      timeout: false,
      timeoutMinutes: undefined,
      retry: false,
      retryCount: undefined,
      retryTimeoutMinutes: undefined,
      retryHttpConditions: [],
      retryHttpStatusCodes: [],
      retryGrpcConditions: [],
      requestHeaderRewrite: false,
      requestHeaderRows: [createHeaderRewriteRow()],
      responseHeaderRewrite: false,
      responseHeaderRows: [createHeaderRewriteRow()],
      websocket: false,
      rateLimit: false,
      rateLimitRps: undefined,
      rateLimitWindow: 'second',
      rateLimitBurst: 0,
      rateLimitStatus: 429,
      rateLimitHeaders: [],
      healthCheck: false,
      cookieRewrite: false,
      cookieRows: [createCookieRow()],
      accessMode: 'domain',
    },
    security: {
      jwtMode: 'domain',
      authMode: 'domain',
      extraParams: [],
    },
  };
}

export const hasServiceRoute = (form: ApiForm) => form.routes.some((route) => route.target === 'service');

const filledRows = <T extends { key: string }>(rows: T[]) => rows.filter((row) => row.key.trim() !== '');

/** 提交 payload：只包含启用的策略，未启用的开关输出 `{ enabled: false }`。 */
export function buildPayload(form: ApiForm) {
  const { policy, security } = form;

  return {
    name: form.name,
    group: form.group,
    domains: [...form.domains],
    match: {
      pathType: form.pathType,
      path: form.path,
      methods: [...form.methods],
    },
    routes: form.routes.map((route) => ({
      headers: filledRows(route.headers).map(({ key, operator, value }) => ({
        key,
        operator,
        value,
      })),
      params: filledRows(route.params).map(({ key, operator, value }) => ({
        key,
        operator,
        value,
      })),
      target: route.target,
      ...(route.target === 'service' ? {
        autoWeight: route.autoWeight,
        services: route.services.map((service) => ({
          name: service.name,
          weight: route.autoWeight ? null : service.weight ?? null,
          mirror: service.mirror,
        })),
      } : {}),
      ...(route.target === 'redirect' ? { redirectUrl: route.redirectUrl } : {}),
      ...(route.target === 'direct' ? {
        directStatus: route.directStatus ?? null,
        directBody: route.directBody,
      } : {}),
    })),
    policy: {
      lbMode: policy.lbMode,
      ...(policy.lbMode === 'requestHash' ? {
        hash: {
          byHeader: policy.hashByHeader,
          rows: policy.hashByHeader ? filledRows(policy.hashRows).map(({ source, key, terminal }) => ({
            source,
            key,
            terminal,
          })) : [],
          byIp: policy.hashByIp,
        },
      } : {}),
      rewrite: policy.rewrite ? {
        enabled: true,
        from: policy.rewriteFrom,
        to: policy.rewriteTo,
      } : { enabled: false },
      timeout: policy.timeout ? {
        enabled: true,
        minutes: policy.timeoutMinutes ?? null,
      } : { enabled: false },
      retry: policy.retry ? {
        enabled: true,
        count: policy.retryCount ?? null,
        timeoutMinutes: policy.retryTimeoutMinutes ?? null,
        httpConditions: [...policy.retryHttpConditions],
        httpStatusCodes: [...policy.retryHttpStatusCodes],
        grpcConditions: [...policy.retryGrpcConditions],
      } : { enabled: false },
      requestHeaders: policy.requestHeaderRewrite
        ? {
          enabled: true,
          rows: filledRows(policy.requestHeaderRows).map(({ action, key, value }) => ({
            action,
            key,
            value,
          })),
        }
        : { enabled: false },
      responseHeaders: policy.responseHeaderRewrite
        ? {
          enabled: true,
          rows: filledRows(policy.responseHeaderRows).map(({ action, key, value }) => ({
            action,
            key,
            value,
          })),
        }
        : { enabled: false },
      websocket: policy.websocket,
      rateLimit: policy.rateLimit ? {
        enabled: true,
        rps: policy.rateLimitRps ?? null,
        window: policy.rateLimitWindow,
        burst: policy.rateLimitBurst ?? null,
        status: policy.rateLimitStatus,
        headers: filledRows(policy.rateLimitHeaders).map(({ key, value }) => ({
          key,
          value,
        })),
      } : { enabled: false },
      healthCheck: policy.healthCheck,
      cookieRewrite: policy.cookieRewrite ? {
        enabled: true,
        cookies: policy.cookieRows.filter((row) => row.name.trim() !== '').map(({
          name, domain, path, secure, sameSite,
        }) => ({
          name,
          domain,
          path,
          secure,
          sameSite,
        })),
      } : { enabled: false },
      accessMode: policy.accessMode,
    },
    security: {
      jwtMode: security.jwtMode,
      authMode: security.authMode,
      extraParams: filledRows(security.extraParams).map(({ key, value }) => ({
        key,
        value,
      })),
    },
  };
}

export type ApiPayload = ReturnType<typeof buildPayload>;
