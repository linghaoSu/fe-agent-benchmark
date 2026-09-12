<script setup lang="ts">
import {
  DaoForm, DaoFormItem, DaoInput, DaoSelect, DaoOption, DaoRadioGroup, DaoRadio, DaoCheckboxGroup, DaoCheckbox,
} from '@dao-style/core';
import { computed } from 'vue';
import {
  LB_MODES, HASH_SOURCES, HEADER_ACTIONS, HTTP_RETRY_CONDITIONS, GRPC_RETRY_CONDITIONS, RATE_LIMIT_CODES, WINDOW_UNITS, ACCESS_MODES,
  createHashRow, createHeaderRewriteRow, createKeyValueRow, createCookieRow, hasServiceRoute,
} from '../model';
import type { HeaderRewriteRow } from '../model';
import { useApiForm } from '../useApiForm';
import FieldError from './FieldError.vue';
import InfoBanner from './InfoBanner.vue';
import AppSwitch from './AppSwitch.vue';
import RowActions from './RowActions.vue';

const store = useApiForm();
const { policy } = store.form;
const err = (key: string) => store.errorOf(`policy.${key}`);
const describedBy = (key: string) => (err(key) ? `error-policy.${key}` : undefined);
const invalid = (key: string) => (err(key) ? 'true' : 'false');
const status = (key: string) => (err(key) ? 'error' : 'default');
const applicable = computed(() => hasServiceRoute(store.form));
const numberOrUndefined = (value: string | number | undefined) => (value === '' || value === undefined || value === null ? undefined : Number(value));

const statusCodeInput = ref('');
const addStatusCode = () => {
  const code = statusCodeInput.value.trim();

  if (code && !policy.retryHttpStatusCodes.includes(code)) {
    policy.retryHttpStatusCodes.push(code);
  }
  statusCodeInput.value = '';
};
const removeStatusCode = (index: number) => policy.retryHttpStatusCodes.splice(index, 1);
const removeAt = <T, >(rows: T[], index: number) => rows.splice(index, 1);
const headerRows = (kind: 'request' | 'response'): HeaderRewriteRow[] => (kind === 'request' ? policy.requestHeaderRows : policy.responseHeaderRows);
</script>

<template>
  <section
    data-testid="step-panel-2"
    class="api-step"
    aria-labelledby="step-2-title"
  >
    <h2
      id="step-2-title"
      class="sr-only"
    >
      策略配置
    </h2>
    <info-banner
      data-testid="policy-banner"
      class="api-step__banner"
      :muted="!applicable"
    >
      仅针对后端服务有效<template v-if="!applicable">
        （当前没有路由使用「后端服务」，以下策略不会生效）
      </template>
    </info-banner>

    <dao-form
      label-width="160px"
      class="api-policy"
      :class="{ 'api-policy--inactive': !applicable }"
    >
      <dao-form-item label="负载均衡">
        <div
          data-testid="lb-mode"
          role="radiogroup"
          aria-label="负载均衡"
          class="dao-form-item__radio-wrapper"
        >
          <dao-radio-group
            v-model="policy.lbMode"
            :vertical="false"
          >
            <dao-radio
              v-for="mode in LB_MODES"
              :key="mode.value"
              :value="mode.value"
              name="lb-mode"
              :label="mode.label"
            />
          </dao-radio-group>
        </div>
        <div
          v-if="policy.lbMode === 'requestHash'"
          class="api-target-box"
          :aria-invalid="invalid('hash')"
          :aria-describedby="describedBy('hash')"
        >
          <p
            class="api-target-box__hint"
            :class="{ 'api-target-box__hint--error': err('hash') }"
          >
            <i
              class="icon-sys-info"
              aria-hidden="true"
            /> 选择使用请求哈希作负载均衡时，以下策略必须启用一个
          </p>
          <field-error
            id="error-policy.hash"
            :message="err('hash')"
          />
          <dao-form label-width="160px">
            <dao-form-item label="哈希请求头或请求参数">
              <div class="dao-form-item__switch-wrapper">
                <app-switch
                  v-model="policy.hashByHeader"
                  data-testid="hash-header-switch"
                  label="哈希请求头或请求参数"
                />
              </div>
              <div
                v-if="policy.hashByHeader"
                class="api-rows"
              >
                <div class="api-rows__head api-rows__grid api-rows__grid--hash">
                  <span>哈希策略</span><span>关键字</span><span>匹配终止</span><span />
                </div>
                <div
                  v-for="(row, index) in policy.hashRows"
                  :key="index"
                  class="api-rows__grid api-rows__grid--hash"
                  data-testid="hash-row"
                >
                  <dao-select
                    v-model="row.source"
                    :aria-label="`哈希策略 ${index + 1}`"
                  >
                    <dao-option
                      v-for="source in HASH_SOURCES"
                      :key="source.value"
                      :value="source.value"
                      :label="source.label"
                    />
                  </dao-select>
                  <div>
                    <dao-input
                      v-model="row.key"
                      block
                      :aria-label="`哈希关键字 ${index + 1}`"
                      :status="status(`hashRows.${index}.key`)"
                      :aria-invalid="invalid(`hashRows.${index}.key`)"
                      :aria-describedby="describedBy(`hashRows.${index}.key`)"
                    />
                    <field-error
                      :id="`error-policy.hashRows.${index}.key`"
                      :message="err(`hashRows.${index}.key`)"
                    />
                  </div>
                  <dao-select
                    :model-value="row.terminal ? 'on' : 'off'"
                    :aria-label="`匹配终止 ${index + 1}`"
                    @update:model-value="row.terminal = $event === 'on'"
                  >
                    <dao-option
                      value="off"
                      label="关闭"
                    />
                    <dao-option
                      value="on"
                      label="开启"
                    />
                  </dao-select>
                  <button
                    type="button"
                    class="api-remove-btn"
                    :disabled="policy.hashRows.length <= 1"
                    :aria-label="`删除哈希策略 ${index + 1}`"
                    @click="removeAt(policy.hashRows, index)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <row-actions
                  label="添加"
                  @add="policy.hashRows.push(createHashRow())"
                />
              </div>
            </dao-form-item>
            <dao-form-item label="哈希来源 IP">
              <div class="dao-form-item__switch-wrapper">
                <app-switch
                  v-model="policy.hashByIp"
                  data-testid="hash-ip-switch"
                  label="哈希来源 IP"
                />
              </div>
            </dao-form-item>
          </dao-form>
        </div>
      </dao-form-item>

      <dao-form-item label="路径改写">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.rewrite"
            data-testid="rewrite-switch"
            label="路径改写"
          />
        </div>
        <div
          v-if="policy.rewrite"
          class="api-target-box"
        >
          <dao-form label-width="160px">
            <dao-form-item
              label="原路径"
              required
            >
              <label
                class="sr-only"
                for="rewrite-from"
              >原路径</label>
              <dao-input
                id="rewrite-from"
                v-model="policy.rewriteFrom"
                data-testid="rewrite-from"
                :root-attrs="{ class: 'api-input' }"
                placeholder="/blog01"
                :status="status('rewriteFrom')"
                :aria-invalid="invalid('rewriteFrom')"
                :aria-describedby="describedBy('rewriteFrom')"
              />
              <field-error
                id="error-policy.rewriteFrom"
                :message="err('rewriteFrom')"
              />
            </dao-form-item>
            <dao-form-item
              label="重写路径"
              required
            >
              <label
                class="sr-only"
                for="rewrite-to"
              >重写路径</label>
              <dao-input
                id="rewrite-to"
                v-model="policy.rewriteTo"
                data-testid="rewrite-to"
                :root-attrs="{ class: 'api-input' }"
                placeholder="示例：/blog02"
                :status="status('rewriteTo')"
                :aria-invalid="invalid('rewriteTo')"
                :aria-describedby="describedBy('rewriteTo')"
              />
              <field-error
                id="error-policy.rewriteTo"
                :message="err('rewriteTo')"
              />
            </dao-form-item>
          </dao-form>
        </div>
      </dao-form-item>

      <dao-form-item label="超时配置">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.timeout"
            data-testid="timeout-switch"
            label="超时配置"
          />
        </div>
        <div
          v-if="policy.timeout"
          class="api-target-box"
        >
          <dao-form label-width="160px">
            <dao-form-item
              label="超时时长"
              required
            >
              <label
                class="sr-only"
                for="timeout-minutes"
              >超时时长（分钟）</label>
              <dao-input
                id="timeout-minutes"
                :model-value="policy.timeoutMinutes"
                data-testid="timeout-minutes"
                :root-attrs="{ class: 'api-input api-input--number' }"
                type="number"
                min="1"
                max="5"
                append="分钟"
                :status="status('timeoutMinutes')"
                :aria-invalid="invalid('timeoutMinutes')"
                :aria-describedby="describedBy('timeoutMinutes')"
                @update:model-value="policy.timeoutMinutes = numberOrUndefined($event)"
              />
              <field-error
                id="error-policy.timeoutMinutes"
                :message="err('timeoutMinutes')"
              />
            </dao-form-item>
          </dao-form>
        </div>
      </dao-form-item>

      <dao-form-item label="重试机制">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.retry"
            data-testid="retry-switch"
            label="重试机制"
          />
        </div>
        <div
          v-if="policy.retry"
          class="api-target-box"
        >
          <dao-form label-width="160px">
            <dao-form-item
              label="重试次数"
              required
            >
              <label
                class="sr-only"
                for="retry-count"
              >重试次数</label>
              <dao-input
                id="retry-count"
                :model-value="policy.retryCount"
                data-testid="retry-count"
                :root-attrs="{ class: 'api-input api-input--number' }"
                type="number"
                min="1"
                :status="status('retryCount')"
                :aria-invalid="invalid('retryCount')"
                :aria-describedby="describedBy('retryCount')"
                @update:model-value="policy.retryCount = numberOrUndefined($event)"
              />
              <field-error
                id="error-policy.retryCount"
                :message="err('retryCount')"
              />
            </dao-form-item>
            <dao-form-item label="重试超时时长">
              <label
                class="sr-only"
                for="retry-timeout"
              >重试超时时长（分钟）</label>
              <dao-input
                id="retry-timeout"
                :model-value="policy.retryTimeoutMinutes"
                data-testid="retry-timeout"
                :root-attrs="{ class: 'api-input api-input--number' }"
                type="number"
                min="1"
                append="分钟"
                @update:model-value="policy.retryTimeoutMinutes = numberOrUndefined($event)"
              />
            </dao-form-item>
            <dao-form-item label="HTTP 重试条件">
              <div
                class="dao-form-item__checkbox-wrapper"
                role="group"
                aria-label="HTTP 重试条件"
              >
                <dao-checkbox-group
                  v-model="policy.retryHttpConditions"
                  :vertical="false"
                >
                  <dao-checkbox
                    v-for="condition in HTTP_RETRY_CONDITIONS"
                    :key="condition.value"
                    :value="condition.value"
                    :aria-label="condition.label"
                  >
                    {{ condition.label }}
                  </dao-checkbox>
                </dao-checkbox-group>
              </div>
            </dao-form-item>
            <dao-form-item label="HTTP 重试状态码">
              <div class="api-tags">
                <span
                  v-for="(code, index) in policy.retryHttpStatusCodes"
                  :key="code"
                  class="dao-tag api-tag"
                >
                  {{ code }}
                  <button
                    type="button"
                    class="api-tag__remove"
                    :aria-label="`删除状态码 ${code}`"
                    @click="removeStatusCode(index)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </span>
              </div>
              <div class="api-inline">
                <label
                  class="sr-only"
                  for="retry-status-code"
                >自定义状态码</label>
                <dao-input
                  id="retry-status-code"
                  v-model="statusCodeInput"
                  :root-attrs="{ class: 'api-input api-input--number' }"
                  placeholder="自定义状态码，如 502"
                  @keydown.enter.prevent="addStatusCode"
                />
                <row-actions
                  label="添加"
                  @add="addStatusCode"
                />
              </div>
            </dao-form-item>
            <dao-form-item label="GRPC 重试条件">
              <div
                class="dao-form-item__checkbox-wrapper"
                role="group"
                aria-label="GRPC 重试条件"
              >
                <dao-checkbox-group
                  v-model="policy.retryGrpcConditions"
                  :vertical="false"
                >
                  <dao-checkbox
                    v-for="condition in GRPC_RETRY_CONDITIONS"
                    :key="condition.value"
                    :value="condition.value"
                    :aria-label="condition.label"
                  >
                    {{ condition.label }}
                  </dao-checkbox>
                </dao-checkbox-group>
              </div>
            </dao-form-item>
          </dao-form>
        </div>
      </dao-form-item>

      <template
        v-for="kind in (['request', 'response'] as const)"
        :key="kind"
      >
        <dao-form-item :label="kind === 'request' ? '请求头重写' : '响应头重写'">
          <div class="dao-form-item__switch-wrapper">
            <app-switch
              v-if="kind === 'request'"
              v-model="policy.requestHeaderRewrite"
              data-testid="request-header-switch"
              label="请求头重写"
            />
            <app-switch
              v-else
              v-model="policy.responseHeaderRewrite"
              data-testid="response-header-switch"
              label="响应头重写"
            />
          </div>
          <div
            v-if="kind === 'request' ? policy.requestHeaderRewrite : policy.responseHeaderRewrite"
            class="api-target-box"
          >
            <div class="api-rows">
              <div class="api-rows__head api-rows__grid">
                <span>动作</span><span>关键字</span><span>值</span><span />
              </div>
              <div
                v-for="(row, index) in headerRows(kind)"
                :key="index"
                class="api-rows__grid"
                :data-testid="`${kind}-header-row`"
              >
                <dao-select
                  v-model="row.action"
                  :aria-label="`${kind === 'request' ? '请求头' : '响应头'} ${index + 1} 动作`"
                >
                  <dao-option
                    v-for="action in HEADER_ACTIONS"
                    :key="action.value"
                    :value="action.value"
                    :label="action.label"
                  />
                </dao-select>
                <dao-input
                  v-model="row.key"
                  block
                  :aria-label="`${kind === 'request' ? '请求头' : '响应头'} ${index + 1} 关键字`"
                />
                <dao-input
                  v-model="row.value"
                  block
                  :aria-label="`${kind === 'request' ? '请求头' : '响应头'} ${index + 1} 值`"
                />
                <button
                  type="button"
                  class="api-remove-btn"
                  :disabled="headerRows(kind).length <= 1"
                  :aria-label="`删除${kind === 'request' ? '请求头' : '响应头'} ${index + 1}`"
                  @click="removeAt(headerRows(kind), index)"
                >
                  <i
                    class="icon-close"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <row-actions
                label="添加"
                @add="headerRows(kind).push(createHeaderRewriteRow())"
              />
            </div>
          </div>
        </dao-form-item>
      </template>

      <dao-form-item label="Websocket">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.websocket"
            data-testid="websocket-switch"
            label="Websocket"
          />
        </div>
      </dao-form-item>

      <dao-form-item label="本地限流">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.rateLimit"
            data-testid="ratelimit-switch"
            label="本地限流"
          />
        </div>
        <div
          v-if="policy.rateLimit"
          class="api-target-box"
        >
          <dao-form label-width="160px">
            <dao-form-item
              label="请求速率"
              required
            >
              <label
                class="sr-only"
                for="ratelimit-rps"
              >请求速率</label>
              <dao-input
                id="ratelimit-rps"
                :model-value="policy.rateLimitRps"
                data-testid="ratelimit-rps"
                :root-attrs="{ class: 'api-input api-input--number' }"
                type="number"
                min="1"
                :status="status('rateLimitRps')"
                :aria-invalid="invalid('rateLimitRps')"
                :aria-describedby="describedBy('rateLimitRps')"
                @update:model-value="policy.rateLimitRps = numberOrUndefined($event)"
              />
              <field-error
                id="error-policy.rateLimitRps"
                :message="err('rateLimitRps')"
              />
              <template #helper>
                <p class="dao-form-item__helper-text">
                  输入最小数值为 1 的正整数
                </p>
              </template>
            </dao-form-item>
            <dao-form-item
              label="时间窗口"
              required
            >
              <div
                class="api-input"
                data-testid="ratelimit-window"
              >
                <dao-select
                  v-model="policy.rateLimitWindow"
                  aria-label="时间窗口"
                >
                  <dao-option
                    v-for="unit in WINDOW_UNITS"
                    :key="unit.value"
                    :value="unit.value"
                    :label="unit.label"
                  />
                </dao-select>
              </div>
            </dao-form-item>
            <dao-form-item label="允许溢出速率">
              <label
                class="sr-only"
                for="ratelimit-burst"
              >允许溢出速率</label>
              <dao-input
                id="ratelimit-burst"
                :model-value="policy.rateLimitBurst"
                data-testid="ratelimit-burst"
                :root-attrs="{ class: 'api-input api-input--number' }"
                type="number"
                min="0"
                :status="status('rateLimitBurst')"
                :aria-invalid="invalid('rateLimitBurst')"
                :aria-describedby="describedBy('rateLimitBurst')"
                @update:model-value="policy.rateLimitBurst = numberOrUndefined($event)"
              />
              <field-error
                id="error-policy.rateLimitBurst"
                :message="err('rateLimitBurst')"
              />
              <template #helper>
                <p class="dao-form-item__helper-text">
                  输入最小数值为 0 的整数，默认为 0，不开启
                </p>
              </template>
            </dao-form-item>
            <dao-form-item label="限制返回码">
              <div
                class="api-input"
                data-testid="ratelimit-status"
              >
                <dao-select
                  v-model="policy.rateLimitStatus"
                  aria-label="限制返回码"
                >
                  <dao-option
                    v-for="code in RATE_LIMIT_CODES"
                    :key="code"
                    :value="code"
                    :label="String(code)"
                  />
                </dao-select>
              </div>
            </dao-form-item>
            <dao-form-item label="Header">
              <div class="api-rows">
                <div
                  v-if="policy.rateLimitHeaders.length"
                  class="api-rows__head api-rows__grid api-rows__grid--kv"
                >
                  <span>键</span><span>值</span><span />
                </div>
                <div
                  v-for="(row, index) in policy.rateLimitHeaders"
                  :key="index"
                  class="api-rows__grid api-rows__grid--kv"
                  data-testid="ratelimit-header-row"
                >
                  <dao-input
                    v-model="row.key"
                    block
                    :aria-label="`限流 Header ${index + 1} 键`"
                  />
                  <dao-input
                    v-model="row.value"
                    block
                    :aria-label="`限流 Header ${index + 1} 值`"
                  />
                  <button
                    type="button"
                    class="api-remove-btn"
                    :aria-label="`删除限流 Header ${index + 1}`"
                    @click="removeAt(policy.rateLimitHeaders, index)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <row-actions
                  label="添加"
                  @add="policy.rateLimitHeaders.push(createKeyValueRow())"
                />
              </div>
            </dao-form-item>
          </dao-form>
        </div>
      </dao-form-item>

      <dao-form-item label="健康检查">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.healthCheck"
            data-testid="healthcheck-switch"
            label="健康检查"
          />
        </div>
      </dao-form-item>

      <dao-form-item label="Cookie 重写">
        <div class="dao-form-item__switch-wrapper">
          <app-switch
            v-model="policy.cookieRewrite"
            data-testid="cookie-switch"
            label="Cookie 重写"
          />
        </div>
        <div
          v-if="policy.cookieRewrite"
          class="api-target-box"
        >
          <div
            v-for="(cookie, index) in policy.cookieRows"
            :key="index"
            class="api-service"
            data-testid="cookie-row"
          >
            <dao-form
              label-width="120px"
              class="api-service__form"
            >
              <dao-form-item
                label="名称"
                required
              >
                <label
                  class="sr-only"
                  :for="`cookie-name-${index}`"
                >Cookie {{ index + 1 }} 名称</label>
                <dao-input
                  :id="`cookie-name-${index}`"
                  v-model="cookie.name"
                  :root-attrs="{ class: 'api-input' }"
                  :status="status(`cookieRows.${index}.name`)"
                  :aria-invalid="invalid(`cookieRows.${index}.name`)"
                  :aria-describedby="describedBy(`cookieRows.${index}.name`)"
                />
                <field-error
                  :id="`error-policy.cookieRows.${index}.name`"
                  :message="err(`cookieRows.${index}.name`)"
                />
              </dao-form-item>
              <dao-form-item label="域名">
                <dao-input
                  v-model="cookie.domain"
                  :root-attrs="{ class: 'api-input' }"
                  :aria-label="`Cookie ${index + 1} 域名`"
                />
              </dao-form-item>
              <dao-form-item label="路径">
                <dao-input
                  v-model="cookie.path"
                  :root-attrs="{ class: 'api-input' }"
                  :aria-label="`Cookie ${index + 1} 路径`"
                />
              </dao-form-item>
              <dao-form-item label="Secure">
                <dao-input
                  v-model="cookie.secure"
                  :root-attrs="{ class: 'api-input' }"
                  :aria-label="`Cookie ${index + 1} Secure`"
                />
              </dao-form-item>
              <dao-form-item label="SameSite">
                <dao-input
                  v-model="cookie.sameSite"
                  :root-attrs="{ class: 'api-input' }"
                  :aria-label="`Cookie ${index + 1} SameSite`"
                />
              </dao-form-item>
            </dao-form>
            <button
              type="button"
              class="api-remove-btn api-service__remove"
              :disabled="policy.cookieRows.length <= 1"
              :aria-label="`删除 Cookie ${index + 1}`"
              @click="removeAt(policy.cookieRows, index)"
            >
              <i
                class="icon-remove"
                aria-hidden="true"
              />
            </button>
          </div>
          <row-actions
            label="添加"
            @add="policy.cookieRows.push(createCookieRow())"
          />
        </div>
      </dao-form-item>

      <dao-form-item label="访问黑白名单">
        <div
          data-testid="access-mode"
          role="radiogroup"
          aria-label="访问黑白名单"
          class="dao-form-item__radio-wrapper"
        >
          <dao-radio-group
            v-model="policy.accessMode"
            :vertical="false"
          >
            <dao-radio
              v-for="mode in ACCESS_MODES"
              :key="mode.value"
              :value="mode.value"
              name="access-mode"
              :label="mode.label"
            />
          </dao-radio-group>
        </div>
        <info-banner
          v-if="policy.accessMode === 'domain'"
          class="api-inline-banner"
        >
          当前 <a
            class="api-link"
            href="#/domains"
            @click.prevent
          >API 关联的域名</a>，已启用了对应 访问黑白名单 允许 策略。
        </info-banner>
      </dao-form-item>
    </dao-form>
  </section>
</template>
