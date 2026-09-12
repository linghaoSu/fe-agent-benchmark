import { emptyDraft, serializeDraft } from '@/stores/api-draft';
import { basicSchema, policySchema, toErrorMap } from '@/stores/api-schema';

const errorsOf = (schema: { validateSync(value: unknown, options?: object): unknown }, value: unknown) => {
  try {
    schema.validateSync(value, { abortEarly: false });

    return {};
  } catch (error) {
    return toErrorMap(error);
  }
};

describe('api draft schemas', () => {
  it('flags every required basic field', () => {
    const errors = errorsOf(basicSchema, emptyDraft());

    expect(Object.keys(errors)).toEqual(expect.arrayContaining(['name', 'group', 'domains', 'path', 'methods', 'routes.0.services.0.name']));
  });

  it('checks the weight sum only when auto weight is off', () => {
    const draft = emptyDraft();

    draft.routes[0].services = [
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
    expect(errorsOf(basicSchema, draft)['routes.0.servicesSum']).toBe('权重之和必须为 100');
    draft.routes[0].autoWeight = true;
    expect(errorsOf(basicSchema, draft)['routes.0.servicesSum']).toBeUndefined();
  });

  it('caps the timeout at five minutes', () => {
    const draft = emptyDraft();

    draft.policy.timeout = true;
    draft.policy.timeoutMinutes = 500;
    expect(errorsOf(policySchema, draft)['policy.timeoutMinutes']).toBe('超时时长配置，最长只支持配置 5 分钟。');
  });

  it('serializes disabled toggles as { enabled: false }', () => {
    const payload = serializeDraft(emptyDraft());

    expect(payload.policy.rewrite).toEqual({ enabled: false });
    expect(payload.routes[0]).toMatchObject({
      target: 'service',
      autoWeight: false,
    });
  });
});
