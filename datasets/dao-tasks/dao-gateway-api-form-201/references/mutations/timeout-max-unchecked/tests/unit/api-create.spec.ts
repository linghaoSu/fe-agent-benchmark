import { createForm, buildPayload } from '@/views/api-create/model';
import { validateStep1, validateStep2, validateName } from '@/views/api-create/validation';

describe('api-create validation', () => {
  it('rejects invalid names and accepts valid ones', () => {
    expect(validateName('')).toBeTruthy();
    expect(validateName('Abc')).toBeTruthy();
    expect(validateName('-abc')).toBeTruthy();
    expect(validateName('a'.repeat(64))).toBeTruthy();
    expect(validateName('order-api.v1')).toBeUndefined();
  });

  it('reports every required step-1 field when empty', () => {
    const errors = validateStep1(createForm());

    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['name', 'group', 'domains', 'path', 'methods']));
  });

  it('requires service weights to sum to 100 unless auto-weight is on', () => {
    const form = createForm();

    form.routes[0].services = [
      {
        name: 'order-svc',
        weight: 60,
        mirror: false,
      },
      {
        name: 'user-svc',
        weight: 30,
        mirror: false,
      },
    ];
    expect(validateStep1(form)['routes.0.weights']).toBe('权重之和必须为 100');
    form.routes[0].autoWeight = true;
    expect(validateStep1(form)['routes.0.weights']).toBeUndefined();
  });

  it('limits timeout to 5 minutes and retry count to >= 1', () => {
    const form = createForm();

    form.policy.timeout = true;
    form.policy.timeoutMinutes = 0;
    form.policy.retry = true;
    form.policy.retryCount = 0;
    const errors = validateStep2(form);

    expect(errors['policy.timeoutMinutes']).toBe('超时时长配置，最长只支持配置 5 分钟。');
    expect(errors['policy.retryCount']).toBeTruthy();
  });

  it('builds the documented payload shape', () => {
    const payload = buildPayload(createForm());

    expect(Object.keys(payload)).toEqual(['name', 'group', 'domains', 'match', 'routes', 'policy', 'security']);
    expect(payload.policy.timeout).toEqual({ enabled: false });
  });
});
