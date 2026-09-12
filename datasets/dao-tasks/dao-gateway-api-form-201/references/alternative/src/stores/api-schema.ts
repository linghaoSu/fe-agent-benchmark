import * as yup from 'yup';
import type { ErrorMap } from './api-draft-store';

const NAME = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
const HTTP_URL = /^https?:\/\/\S+$/;

const integer = (message: string) => yup.number().transform((value, original) => (original === '' || original === null || original === undefined ? null : value)).nullable().integer(message)
  .typeError(message);

const serviceSchema = yup.object({
  name: yup.string().required('服务名称不能为空'),
  weight: yup.mixed(),
});

const routeSchema = yup.object({
  target: yup.string().oneOf(['service', 'redirect', 'direct']),
  autoWeight: yup.boolean(),
  services: yup.array().when('target', {
    is: 'service',
    then: (schema) => schema.of(serviceSchema).min(1, '至少需要一个服务').test('weights', '权重之和必须为 100', function weights(services) {
      const { autoWeight } = this.parent as { autoWeight: boolean };

      if (autoWeight || !services) {
        return true;
      }
      const errors: yup.ValidationError[] = [];

      services.forEach((service, index) => {
        const { weight } = service as { weight: number | null };

        if (weight === null || weight === undefined) {
          errors.push(this.createError({
            path: `${this.path}[${index}].weight`,
            message: '权重不能为空',
          }));
        } else if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
          errors.push(this.createError({
            path: `${this.path}[${index}].weight`,
            message: '权重需为 1-100 的整数',
          }));
        }
      });
      if (errors.length) {
        return new yup.ValidationError(errors);
      }
      const sum = services.reduce((total, service) => total + ((service as { weight: number }).weight ?? 0), 0);

      return sum === 100 ? true : this.createError({
        path: `${this.path}Sum`,
        message: '权重之和必须为 100',
      });
    }),
  }),
  redirectUrl: yup.string().when('target', {
    is: 'redirect',
    then: (schema) => schema.required('目标地址不能为空').matches(HTTP_URL, '目标地址需为 http(s) URL'),
  }),
  directStatus: yup.mixed().when('target', {
    is: 'direct',
    then: () => integer('状态码需为 100-599 的整数').required('状态码需为 100-599 的整数').min(100, '状态码需为 100-599 的整数').max(599, '状态码需为 100-599 的整数'),
  }),
});

export const basicSchema = yup.object({
  name: yup.string().required('API 名称不能为空').max(63, 'API 名称长度不能超过 63').matches(NAME, '仅支持小写字母、数字和特殊字符(- .)，且不能以特殊字符开头和结尾'),
  group: yup.string().required('API 分组不能为空'),
  domains: yup.array().of(yup.string()).min(1, '关联域名不能为空'),
  pathType: yup.string().required('匹配方式不能为空'),
  path: yup.string().required('路径不能为空').matches(/^\//, '路径需以 / 开头'),
  methods: yup.array().of(yup.string()).min(1, '请求方法不能为空'),
  routes: yup.array().of(routeSchema).min(1, '至少需要一条路由配置'),
});

export const policySchema = yup.object({
  policy: yup.object({
    lbMode: yup.string(),
    hashByHeader: yup.boolean(),
    hashByIp: yup.boolean(),
    hashRows: yup.array().when(['lbMode', 'hashByHeader'], {
      is: (lbMode: string, hashByHeader: boolean) => lbMode === 'requestHash' && hashByHeader,
      then: (schema) => schema.of(yup.object({ key: yup.string().trim().required('关键字不能为空') })),
    }),
    hashPolicy: yup.mixed().test('hash', '选择使用请求哈希作负载均衡时，以下策略必须启用一个', function hash() {
      const { lbMode, hashByHeader, hashByIp } = this.parent as { lbMode: string; hashByHeader: boolean; hashByIp: boolean };

      return lbMode !== 'requestHash' || hashByHeader || hashByIp;
    }),
    rewrite: yup.boolean(),
    rewriteFrom: yup.string().when('rewrite', {
      is: true,
      then: (schema) => schema.required('原路径不能为空'),
    }),
    rewriteTo: yup.string().when('rewrite', {
      is: true,
      then: (schema) => schema.required('重写路径不能为空'),
    }),
    timeout: yup.boolean(),
    timeoutMinutes: yup.mixed().when('timeout', {
      is: true,
      then: () => yup.number().nullable().typeError('超时时长不能为空').required('超时时长不能为空')
        .min(1, '超时时长配置，最长只支持配置 5 分钟。')
        .max(5, '超时时长配置，最长只支持配置 5 分钟。'),
    }),
    retry: yup.boolean(),
    retryCount: yup.mixed().when('retry', {
      is: true,
      then: () => integer('重试次数需为不小于 1 的整数').required('重试次数需为不小于 1 的整数').min(1, '重试次数需为不小于 1 的整数'),
    }),
    rateLimit: yup.boolean(),
    rateLimitRps: yup.mixed().when('rateLimit', {
      is: true,
      then: () => integer('请求速率需为不小于 1 的整数').required('请求速率需为不小于 1 的整数').min(1, '请求速率需为不小于 1 的整数'),
    }),
    rateLimitBurst: yup.mixed().when('rateLimit', {
      is: true,
      then: () => integer('允许溢出速率需为不小于 0 的整数').min(0, '允许溢出速率需为不小于 0 的整数'),
    }),
    cookieRewrite: yup.boolean(),
    cookieRows: yup.array().when('cookieRewrite', {
      is: true,
      then: (schema) => schema.of(yup.object({ name: yup.string().trim().required('名称不能为空') })),
    }),
  }),
});

export const securitySchema = yup.object({});

export const stepSchemas = [basicSchema, policySchema, securitySchema];

/** yup 的路径形如 `routes[0].services[1].weight`；错误映射统一使用点号路径 `routes.0.services.1.weight`。 */
export const normalizePath = (path: string) => path.replace(/\[(\d+)\]/g, '.$1');

export function toErrorMap(error: unknown): ErrorMap {
  const map: ErrorMap = {};

  if (error instanceof yup.ValidationError) {
    const visit = (item: yup.ValidationError) => {
      if (item.inner.length) {
        item.inner.forEach(visit);
      } else if (item.path && !map[normalizePath(item.path)]) {
        map[normalizePath(item.path)] = item.message;
      }
    };

    visit(error);
  }

  return map;
}
