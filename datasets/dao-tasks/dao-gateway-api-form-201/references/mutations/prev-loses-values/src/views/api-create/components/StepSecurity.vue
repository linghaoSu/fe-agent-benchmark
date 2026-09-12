<script setup lang="ts">
import {
  DaoForm, DaoFormItem, DaoInput, DaoRadioGroup, DaoRadio,
} from '@dao-style/core';
import { computed } from 'vue';
import {
  JWT_MODES, AUTH_MODES, createKeyValueRow, hasServiceRoute,
} from '../model';
import { useApiForm } from '../useApiForm';
import InfoBanner from './InfoBanner.vue';
import RowActions from './RowActions.vue';

const store = useApiForm();
const { security } = store.form;
const applicable = computed(() => hasServiceRoute(store.form));
</script>

<template>
  <section
    data-testid="step-panel-3"
    class="api-step"
    aria-labelledby="step-3-title"
  >
    <h2
      id="step-3-title"
      class="sr-only"
    >
      安全配置
    </h2>
    <info-banner
      data-testid="security-banner"
      class="api-step__banner"
      :muted="!applicable"
    >
      仅针对后端服务有效<template v-if="!applicable">
        （当前没有路由使用「后端服务」，以下配置不会生效）
      </template>
    </info-banner>

    <dao-form label-width="160px">
      <dao-form-item label="JWT 认证">
        <div
          data-testid="jwt-mode"
          role="radiogroup"
          aria-label="JWT 认证"
          class="dao-form-item__radio-wrapper"
        >
          <dao-radio-group
            v-model="security.jwtMode"
            :vertical="false"
          >
            <dao-radio
              v-for="mode in JWT_MODES"
              :key="mode.value"
              :value="mode.value"
              name="jwt-mode"
              :label="mode.label"
            />
          </dao-radio-group>
        </div>
        <info-banner
          v-if="security.jwtMode === 'domain'"
          data-testid="jwt-banner"
          class="api-inline-banner"
        >
          当前 <a
            class="api-link"
            href="#/domains"
            @click.prevent
          >API 关联的域名</a>，已启用 JWT 认证。
        </info-banner>
      </dao-form-item>

      <dao-form-item label="安全认证">
        <div
          data-testid="auth-mode"
          role="radiogroup"
          aria-label="安全认证"
          class="dao-form-item__radio-wrapper"
        >
          <dao-radio-group
            v-model="security.authMode"
            :vertical="false"
          >
            <dao-radio
              v-for="mode in AUTH_MODES"
              :key="mode.value"
              :value="mode.value"
              name="auth-mode"
              :label="mode.label"
            />
          </dao-radio-group>
        </div>
        <info-banner
          v-if="security.authMode === 'domain'"
          data-testid="auth-banner"
          class="api-inline-banner"
        >
          当前 <a
            class="api-link"
            href="#/domains"
            @click.prevent
          >API 关联的域名</a>，已启用安全认证。
        </info-banner>
        <div class="api-target-box api-target-box--solid">
          <dao-form label-width="160px">
            <dao-form-item label="附加参数">
              <div class="api-rows">
                <div class="api-rows__head api-rows__grid api-rows__grid--kv">
                  <span>关键字</span><span>值</span><span />
                </div>
                <div
                  v-for="(row, index) in security.extraParams"
                  :key="index"
                  class="api-rows__grid api-rows__grid--kv"
                  data-testid="extra-param-row"
                >
                  <dao-input
                    v-model="row.key"
                    block
                    :aria-label="`附加参数 ${index + 1} 关键字`"
                  />
                  <dao-input
                    v-model="row.value"
                    block
                    :aria-label="`附加参数 ${index + 1} 值`"
                  />
                  <button
                    type="button"
                    class="api-remove-btn"
                    :aria-label="`删除附加参数 ${index + 1}`"
                    @click="security.extraParams.splice(index, 1)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <row-actions
                  label="添加"
                  action-id="btn-add-extra-param"
                  @add="security.extraParams.push(createKeyValueRow())"
                />
              </div>
            </dao-form-item>
          </dao-form>
        </div>
      </dao-form-item>
    </dao-form>
  </section>
</template>
