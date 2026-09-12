import type { ApiForm, Route } from './model';

export const NAME_PATTERN = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
export const NAME_MAX_LENGTH = 63;
export const URL_PATTERN = /^https?:\/\/\S+$/;

export type Errors = Record<string, string>;

const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

export function validateName(name: string): string | undefined {
  if (!name) {
    return 'API 名称不能为空';
  }
  if (name.length > NAME_MAX_LENGTH) {
    return `API 名称长度不能超过 ${NAME_MAX_LENGTH}`;
  }
  if (!NAME_PATTERN.test(name)) {
    return '仅支持小写字母、数字和特殊字符(- .)，且不能以特殊字符开头和结尾';
  }

  return undefined;
}

export function validateRoute(route: Route, index: number): Errors {
  const errors: Errors = {};
  const prefix = `routes.${index}`;

  if (route.target === 'service') {
    if (!route.services.length) {
      errors[`${prefix}.services`] = '至少需要一个服务';
    }
    route.services.forEach((service, serviceIndex) => {
      if (!service.name) {
        errors[`${prefix}.services.${serviceIndex}.name`] = '服务名称不能为空';
      }
      if (!route.autoWeight) {
        if (service.weight === undefined || service.weight === null) {
          errors[`${prefix}.services.${serviceIndex}.weight`] = '权重不能为空';
        } else if (!isInteger(service.weight) || service.weight < 1 || service.weight > 100) {
          errors[`${prefix}.services.${serviceIndex}.weight`] = '权重需为 1-100 的整数';
        }
      }
    });
    if (!route.autoWeight && route.services.length && route.services.every((service) => isInteger(service.weight))) {
      const sum = route.services.reduce((total, service) => total + (service.weight ?? 0), 0);

      if (sum !== 100) {
        errors[`${prefix}.weights`] = '权重之和必须为 100';
      }
    }
  }
  if (route.target === 'redirect') {
    if (!route.redirectUrl) {
      errors[`${prefix}.redirectUrl`] = '目标地址不能为空';
    } else if (!URL_PATTERN.test(route.redirectUrl)) {
      errors[`${prefix}.redirectUrl`] = '目标地址需为 http(s) URL';
    }
  }
  if (route.target === 'direct') {
    if (!isInteger(route.directStatus) || route.directStatus < 100 || route.directStatus > 599) {
      errors[`${prefix}.directStatus`] = '状态码需为 100-599 的整数';
    }
  }

  return errors;
}

export function validateStep1(form: ApiForm): Errors {
  const errors: Errors = {};
  const nameError = validateName(form.name);

  if (nameError) {
    errors.name = nameError;
  }
  if (!form.group) {
    errors.group = 'API 分组不能为空';
  }
  if (!form.domains.length) {
    errors.domains = '关联域名不能为空';
  }
  if (!form.pathType) {
    errors.pathType = '匹配方式不能为空';
  }
  if (!form.path) {
    errors.path = '路径不能为空';
  } else if (!form.path.startsWith('/')) {
    errors.path = '路径需以 / 开头';
  }
  if (!form.methods.length) {
    errors.methods = '请求方法不能为空';
  }
  if (!form.routes.length) {
    errors.routes = '至少需要一条路由配置';
  }
  form.routes.forEach((route, index) => Object.assign(errors, validateRoute(route, index)));

  return errors;
}

export function validateStep2(form: ApiForm): Errors {
  const errors: Errors = {};
  const { policy } = form;

  if (policy.lbMode === 'requestHash' && !policy.hashByHeader && !policy.hashByIp) {
    errors['policy.hash'] = '选择使用请求哈希作负载均衡时，以下策略必须启用一个';
  }
  if (policy.lbMode === 'requestHash' && policy.hashByHeader) {
    policy.hashRows.forEach((row, index) => {
      if (!row.key.trim()) {
        errors[`policy.hashRows.${index}.key`] = '关键字不能为空';
      }
    });
  }
  if (policy.rewrite) {
    if (!policy.rewriteFrom) {
      errors['policy.rewriteFrom'] = '原路径不能为空';
    }
    if (!policy.rewriteTo) {
      errors['policy.rewriteTo'] = '重写路径不能为空';
    }
  }
  if (policy.timeout) {
    if (policy.timeoutMinutes === undefined || policy.timeoutMinutes === null) {
      errors['policy.timeoutMinutes'] = '超时时长不能为空';
    } else if (!(policy.timeoutMinutes >= 1)) {
      errors['policy.timeoutMinutes'] = '超时时长配置，最长只支持配置 5 分钟。';
    }
  }
  if (policy.retry) {
    if (!isInteger(policy.retryCount) || policy.retryCount < 1) {
      errors['policy.retryCount'] = '重试次数需为不小于 1 的整数';
    }
  }
  if (policy.rateLimit) {
    if (!isInteger(policy.rateLimitRps) || policy.rateLimitRps < 1) {
      errors['policy.rateLimitRps'] = '请求速率需为不小于 1 的整数';
    }
    if (policy.rateLimitBurst !== undefined && policy.rateLimitBurst !== null && (!isInteger(policy.rateLimitBurst) || policy.rateLimitBurst < 0)) {
      errors['policy.rateLimitBurst'] = '允许溢出速率需为不小于 0 的整数';
    }
  }
  if (policy.cookieRewrite) {
    policy.cookieRows.forEach((row, index) => {
      if (!row.name.trim()) {
        errors[`policy.cookieRows.${index}.name`] = '名称不能为空';
      }
    });
  }

  return errors;
}

export function validateStep3(): Errors {
  return {};
}

export const STEP_VALIDATORS = [validateStep1, validateStep2, validateStep3] as const;

export const validateAll = (form: ApiForm): Errors => ({
  ...validateStep1(form),
  ...validateStep2(form),
  ...validateStep3(),
});
