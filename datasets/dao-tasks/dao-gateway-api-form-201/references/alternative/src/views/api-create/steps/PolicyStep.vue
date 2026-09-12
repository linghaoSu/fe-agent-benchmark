<script setup lang="ts">
import {
  DaoForm, DaoInput, DaoRadioGroup, DaoRadio, DaoCheckboxGroup, DaoCheckbox,
} from '@dao-style/core';
import { storeToRefs } from 'pinia';
import { useApiDraftStore } from '@/stores/api-draft-store';
import {
  OPTIONS, emptyHash, emptyHeader, emptyKV, emptyCookie,
} from '@/stores/api-draft';
import type { HeaderDraft } from '@/stores/api-draft';
import Field from '../ui/Field.vue';
import Pick from '../ui/Pick.vue';
import Toggle from '../ui/Toggle.vue';

const store = useApiDraftStore();
const { draft } = storeToRefs(store);
const policy = computed(() => draft.value.policy);
const toNumber = (value: unknown): number | null => (value === '' || value === null || value === undefined ? null : Number(value));
const codeDraft = ref('');
const addCode = () => {
  const code = codeDraft.value.trim();

  if (code && !policy.value.retryHttpStatusCodes.includes(code)) {
    policy.value.retryHttpStatusCodes.push(code);
  }
  codeDraft.value = '';
};
const headerSections = computed(() => [
  {
    key: 'request',
    label: '请求头重写',
    on: policy.value.requestHeaderRewrite,
    rows: policy.value.requestHeaderRows,
  },
  {
    key: 'response',
    label: '响应头重写',
    on: policy.value.responseHeaderRewrite,
    rows: policy.value.responseHeaderRows,
  },
]);
const setHeaderRewrite = (key: string, on: boolean) => {
  if (key === 'request') {
    policy.value.requestHeaderRewrite = on;
  } else {
    policy.value.responseHeaderRewrite = on;
  }
};
const removeHeader = (rows: HeaderDraft[], index: number) => rows.splice(index, 1);
</script>

<template>
  <section
    data-testid="step-panel-2"
    class="alt-panel"
    aria-labelledby="alt-step-2"
  >
    <h2
      id="alt-step-2"
      class="alt-sr-only"
    >
      策略配置
    </h2>
    <div
      class="alt-note alt-note--wide"
      :class="{ 'alt-note--muted': !store.hasBackendRoute }"
      data-testid="policy-banner"
      role="note"
    >
      <i
        class="icon-sys-info"
        aria-hidden="true"
      /> 仅针对后端服务有效<span v-if="!store.hasBackendRoute">（当前没有路由使用「后端服务」，以下策略不会生效）</span>
    </div>

    <dao-form
      label-width="160px"
      :class="{ 'alt-muted': !store.hasBackendRoute }"
    >
      <field label="负载均衡">
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
              v-for="[value, label] in OPTIONS.lbModes"
              :key="value"
              :value="value"
              name="alt-lb"
              :label="label"
            />
          </dao-radio-group>
        </div>
        <div
          v-if="policy.lbMode === 'requestHash'"
          class="alt-box"
        >
          <p
            class="alt-hint"
            :class="{ 'alt-hint--error': store.errors['policy.hashPolicy'] }"
          >
            <i
              class="icon-sys-info"
              aria-hidden="true"
            /> 选择使用请求哈希作负载均衡时，以下策略必须启用一个
          </p>
          <p
            v-if="store.errors['policy.hashPolicy']"
            id="error-policy.hash"
            data-testid="error-policy.hash"
            class="alt-error"
            role="alert"
          >
            {{ store.errors['policy.hashPolicy'] }}
          </p>
          <dao-form label-width="160px">
            <field label="哈希请求头或请求参数">
              <div class="dao-form-item__switch-wrapper">
                <toggle
                  v-model="policy.hashByHeader"
                  data-testid="hash-header-switch"
                  label="哈希请求头或请求参数"
                />
              </div>
              <div
                v-if="policy.hashByHeader"
                class="alt-grid alt-grid--hash"
              >
                <span class="alt-grid__head">哈希策略</span><span class="alt-grid__head">关键字</span><span class="alt-grid__head">匹配终止</span><span />
                <template
                  v-for="(row, i) in policy.hashRows"
                  :key="i"
                >
                  <pick
                    v-model="row.source"
                    :label="`哈希策略 ${i + 1}`"
                    :options="OPTIONS.hashSources"
                  />
                  <div>
                    <dao-input
                      v-model="row.key"
                      block
                      :aria-label="`哈希关键字 ${i + 1}`"
                      :status="store.errors[`policy.hashRows.${i}.key`] ? 'error' : 'default'"
                      :aria-invalid="store.errors[`policy.hashRows.${i}.key`] ? 'true' : 'false'"
                      :aria-describedby="store.errors[`policy.hashRows.${i}.key`] ? `error-policy.hashRows.${i}.key` : undefined"
                    />
                    <p
                      v-if="store.errors[`policy.hashRows.${i}.key`]"
                      :id="`error-policy.hashRows.${i}.key`"
                      class="alt-error"
                      role="alert"
                    >
                      {{ store.errors[`policy.hashRows.${i}.key`] }}
                    </p>
                  </div>
                  <pick
                    :model-value="row.terminal ? 'on' : 'off'"
                    :label="`匹配终止 ${i + 1}`"
                    :options="[['off', '关闭'], ['on', '开启']]"
                    @update:model-value="row.terminal = $event === 'on'"
                  />
                  <button
                    type="button"
                    class="alt-icon-btn"
                    :disabled="policy.hashRows.length <= 1"
                    :aria-label="`删除哈希策略 ${i + 1}`"
                    @click="policy.hashRows.splice(i, 1)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </template>
              </div>
              <button
                v-if="policy.hashByHeader"
                type="button"
                class="alt-link"
                @click="policy.hashRows.push(emptyHash())"
              >
                <i
                  class="icon-add"
                  aria-hidden="true"
                /> 添加
              </button>
            </field>
            <field label="哈希来源 IP">
              <div class="dao-form-item__switch-wrapper">
                <toggle
                  v-model="policy.hashByIp"
                  data-testid="hash-ip-switch"
                  label="哈希来源 IP"
                />
              </div>
            </field>
          </dao-form>
        </div>
      </field>

      <field label="路径改写">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.rewrite"
            data-testid="rewrite-switch"
            label="路径改写"
          />
        </div>
        <div
          v-if="policy.rewrite"
          class="alt-box"
        >
          <dao-form label-width="160px">
            <field
              label="原路径"
              path="policy.rewriteFrom"
              required
            >
              <template #default="{ invalid, describedBy, status }">
                <dao-input
                  v-model="policy.rewriteFrom"
                  data-testid="rewrite-from"
                  aria-label="原路径"
                  placeholder="/blog01"
                  :status="status"
                  :aria-invalid="invalid"
                  :aria-describedby="describedBy"
                  :root-attrs="{ class: 'alt-w-md' }"
                />
              </template>
            </field>
            <field
              label="重写路径"
              path="policy.rewriteTo"
              required
            >
              <template #default="{ invalid, describedBy, status }">
                <dao-input
                  v-model="policy.rewriteTo"
                  data-testid="rewrite-to"
                  aria-label="重写路径"
                  placeholder="示例：/blog02"
                  :status="status"
                  :aria-invalid="invalid"
                  :aria-describedby="describedBy"
                  :root-attrs="{ class: 'alt-w-md' }"
                />
              </template>
            </field>
          </dao-form>
        </div>
      </field>

      <field label="超时配置">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.timeout"
            data-testid="timeout-switch"
            label="超时配置"
          />
        </div>
        <div
          v-if="policy.timeout"
          class="alt-box"
        >
          <dao-form label-width="160px">
            <field
              label="超时时长"
              path="policy.timeoutMinutes"
              required
            >
              <template #default="{ invalid, describedBy, status }">
                <dao-input
                  :model-value="policy.timeoutMinutes ?? undefined"
                  data-testid="timeout-minutes"
                  type="number"
                  min="1"
                  max="5"
                  append="分钟"
                  aria-label="超时时长（分钟）"
                  :status="status"
                  :aria-invalid="invalid"
                  :aria-describedby="describedBy"
                  :root-attrs="{ class: 'alt-w-sm' }"
                  @update:model-value="policy.timeoutMinutes = toNumber($event)"
                />
              </template>
            </field>
          </dao-form>
        </div>
      </field>

      <field label="重试机制">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.retry"
            data-testid="retry-switch"
            label="重试机制"
          />
        </div>
        <div
          v-if="policy.retry"
          class="alt-box"
        >
          <dao-form label-width="160px">
            <field
              label="重试次数"
              path="policy.retryCount"
              required
            >
              <template #default="{ invalid, describedBy, status }">
                <dao-input
                  :model-value="policy.retryCount ?? undefined"
                  data-testid="retry-count"
                  type="number"
                  min="1"
                  aria-label="重试次数"
                  :status="status"
                  :aria-invalid="invalid"
                  :aria-describedby="describedBy"
                  :root-attrs="{ class: 'alt-w-sm' }"
                  @update:model-value="policy.retryCount = toNumber($event)"
                />
              </template>
            </field>
            <field label="重试超时时长">
              <dao-input
                :model-value="policy.retryTimeoutMinutes ?? undefined"
                data-testid="retry-timeout"
                type="number"
                min="1"
                append="分钟"
                aria-label="重试超时时长（分钟）"
                :root-attrs="{ class: 'alt-w-sm' }"
                @update:model-value="policy.retryTimeoutMinutes = toNumber($event)"
              />
            </field>
            <field label="HTTP 重试条件">
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
                    v-for="[value, label] in OPTIONS.httpRetry"
                    :key="value"
                    :value="value"
                    :aria-label="label"
                  >
                    {{ label }}
                  </dao-checkbox>
                </dao-checkbox-group>
              </div>
            </field>
            <field label="HTTP 重试状态码">
              <ul
                v-if="policy.retryHttpStatusCodes.length"
                class="alt-chips"
                aria-label="已添加的状态码"
              >
                <li
                  v-for="(code, i) in policy.retryHttpStatusCodes"
                  :key="code"
                  class="alt-chip"
                >
                  {{ code }}
                  <button
                    type="button"
                    class="alt-chip__remove"
                    :aria-label="`删除状态码 ${code}`"
                    @click="policy.retryHttpStatusCodes.splice(i, 1)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              </ul>
              <div class="alt-inline">
                <dao-input
                  v-model="codeDraft"
                  aria-label="自定义状态码"
                  placeholder="自定义状态码，如 502"
                  :root-attrs="{ class: 'alt-w-sm' }"
                  @keydown.enter.prevent="addCode"
                />
                <button
                  type="button"
                  class="alt-link"
                  @click="addCode"
                >
                  <i
                    class="icon-add"
                    aria-hidden="true"
                  /> 添加
                </button>
              </div>
            </field>
            <field label="GRPC 重试条件">
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
                    v-for="[value, label] in OPTIONS.grpcRetry"
                    :key="value"
                    :value="value"
                    :aria-label="label"
                  >
                    {{ label }}
                  </dao-checkbox>
                </dao-checkbox-group>
              </div>
            </field>
          </dao-form>
        </div>
      </field>

      <field
        v-for="section in headerSections"
        :key="section.key"
        :label="section.label"
      >
        <div class="dao-form-item__switch-wrapper">
          <toggle
            :model-value="section.on"
            :data-testid="`${section.key}-header-switch`"
            :label="section.label"
            @update:model-value="setHeaderRewrite(section.key, $event)"
          />
        </div>
        <div
          v-if="section.on"
          class="alt-box"
        >
          <div class="alt-grid alt-grid--match">
            <span class="alt-grid__head">动作</span><span class="alt-grid__head">关键字</span><span class="alt-grid__head">值</span><span />
            <template
              v-for="(row, i) in section.rows"
              :key="i"
            >
              <pick
                v-model="row.action"
                :label="`${section.label} ${i + 1} 动作`"
                :options="OPTIONS.headerActions"
              />
              <dao-input
                v-model="row.key"
                block
                :aria-label="`${section.label} ${i + 1} 关键字`"
              />
              <dao-input
                v-model="row.value"
                block
                :aria-label="`${section.label} ${i + 1} 值`"
              />
              <button
                type="button"
                class="alt-icon-btn"
                :disabled="section.rows.length <= 1"
                :aria-label="`删除${section.label} ${i + 1}`"
                @click="removeHeader(section.rows, i)"
              >
                <i
                  class="icon-close"
                  aria-hidden="true"
                />
              </button>
            </template>
          </div>
          <button
            type="button"
            class="alt-link"
            @click="section.rows.push(emptyHeader())"
          >
            <i
              class="icon-add"
              aria-hidden="true"
            /> 添加
          </button>
        </div>
      </field>

      <field label="Websocket">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.websocket"
            data-testid="websocket-switch"
            label="Websocket"
          />
        </div>
      </field>

      <field label="本地限流">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.rateLimit"
            data-testid="ratelimit-switch"
            label="本地限流"
          />
        </div>
        <div
          v-if="policy.rateLimit"
          class="alt-box"
        >
          <dao-form label-width="160px">
            <field
              label="请求速率"
              path="policy.rateLimitRps"
              required
              helper="输入最小数值为 1 的正整数"
            >
              <template #default="{ invalid, describedBy, status }">
                <dao-input
                  :model-value="policy.rateLimitRps ?? undefined"
                  data-testid="ratelimit-rps"
                  type="number"
                  min="1"
                  aria-label="请求速率"
                  :status="status"
                  :aria-invalid="invalid"
                  :aria-describedby="describedBy"
                  :root-attrs="{ class: 'alt-w-sm' }"
                  @update:model-value="policy.rateLimitRps = toNumber($event)"
                />
              </template>
            </field>
            <field
              label="时间窗口"
              required
            >
              <pick
                v-model="policy.rateLimitWindow"
                class="alt-w-md"
                test-id="ratelimit-window"
                label="时间窗口"
                :options="OPTIONS.windows"
              />
            </field>
            <field
              label="允许溢出速率"
              path="policy.rateLimitBurst"
              helper="输入最小数值为 0 的整数，默认为 0，不开启"
            >
              <template #default="{ invalid, describedBy, status }">
                <dao-input
                  :model-value="policy.rateLimitBurst ?? undefined"
                  data-testid="ratelimit-burst"
                  type="number"
                  min="0"
                  aria-label="允许溢出速率"
                  :status="status"
                  :aria-invalid="invalid"
                  :aria-describedby="describedBy"
                  :root-attrs="{ class: 'alt-w-sm' }"
                  @update:model-value="policy.rateLimitBurst = toNumber($event)"
                />
              </template>
            </field>
            <field label="限制返回码">
              <pick
                v-model="policy.rateLimitStatus"
                class="alt-w-md"
                test-id="ratelimit-status"
                label="限制返回码"
                :options="OPTIONS.statusCodes"
              />
            </field>
            <field label="Header">
              <div
                v-if="policy.rateLimitHeaders.length"
                class="alt-grid alt-grid--kv"
              >
                <span class="alt-grid__head">键</span><span class="alt-grid__head">值</span><span />
                <template
                  v-for="(row, i) in policy.rateLimitHeaders"
                  :key="i"
                >
                  <dao-input
                    v-model="row.key"
                    block
                    :aria-label="`限流 Header ${i + 1} 键`"
                  />
                  <dao-input
                    v-model="row.value"
                    block
                    :aria-label="`限流 Header ${i + 1} 值`"
                  />
                  <button
                    type="button"
                    class="alt-icon-btn"
                    :aria-label="`删除限流 Header ${i + 1}`"
                    @click="policy.rateLimitHeaders.splice(i, 1)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </template>
              </div>
              <button
                type="button"
                class="alt-link"
                @click="policy.rateLimitHeaders.push(emptyKV())"
              >
                <i
                  class="icon-add"
                  aria-hidden="true"
                /> 添加
              </button>
            </field>
          </dao-form>
        </div>
      </field>

      <field label="健康检查">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.healthCheck"
            data-testid="healthcheck-switch"
            label="健康检查"
          />
        </div>
      </field>

      <field label="Cookie 重写">
        <div class="dao-form-item__switch-wrapper">
          <toggle
            v-model="policy.cookieRewrite"
            data-testid="cookie-switch"
            label="Cookie 重写"
          />
        </div>
        <div
          v-if="policy.cookieRewrite"
          class="alt-box"
        >
          <div
            v-for="(cookie, i) in policy.cookieRows"
            :key="i"
            class="alt-service"
            data-testid="cookie-row"
          >
            <dao-form label-width="120px">
              <field
                label="名称"
                :path="`policy.cookieRows.${i}.name`"
                required
              >
                <template #default="{ invalid, describedBy, status }">
                  <dao-input
                    v-model="cookie.name"
                    :aria-label="`Cookie ${i + 1} 名称`"
                    :status="status"
                    :aria-invalid="invalid"
                    :aria-describedby="describedBy"
                    :root-attrs="{ class: 'alt-w-md' }"
                  />
                </template>
              </field>
              <field
                v-for="[prop, label] in [['domain', '域名'], ['path', '路径'], ['secure', 'Secure'], ['sameSite', 'SameSite']] as const"
                :key="prop"
                :label="label"
              >
                <dao-input
                  v-model="cookie[prop]"
                  :aria-label="`Cookie ${i + 1} ${label}`"
                  :root-attrs="{ class: 'alt-w-md' }"
                />
              </field>
            </dao-form>
            <button
              type="button"
              class="alt-icon-btn alt-service__remove"
              :disabled="policy.cookieRows.length <= 1"
              :aria-label="`删除 Cookie ${i + 1}`"
              @click="policy.cookieRows.splice(i, 1)"
            >
              <i
                class="icon-remove"
                aria-hidden="true"
              />
            </button>
          </div>
          <button
            type="button"
            class="alt-link"
            @click="policy.cookieRows.push(emptyCookie())"
          >
            <i
              class="icon-add"
              aria-hidden="true"
            /> 添加
          </button>
        </div>
      </field>

      <field label="访问黑白名单">
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
              v-for="[value, label] in OPTIONS.accessModes"
              :key="value"
              :value="value"
              name="alt-access"
              :label="label"
            />
          </dao-radio-group>
        </div>
        <div
          v-if="policy.accessMode === 'domain'"
          class="alt-note alt-note--inline"
          role="note"
        >
          <i
            class="icon-sys-info"
            aria-hidden="true"
          /> 当前 <a
            class="alt-link"
            href="#/domains"
            @click.prevent
          >API 关联的域名</a>，已启用了对应 访问黑白名单 允许 策略。
        </div>
      </field>
    </dao-form>
  </section>
</template>
