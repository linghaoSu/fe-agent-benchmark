<script setup lang="ts">
import {
  DaoForm, DaoInput, DaoRadioGroup, DaoRadio,
} from '@dao-style/core';
import { storeToRefs } from 'pinia';
import { useApiDraftStore } from '@/stores/api-draft-store';
import { OPTIONS, emptyKV } from '@/stores/api-draft';
import Field from '../ui/Field.vue';

const store = useApiDraftStore();
const { draft } = storeToRefs(store);
const security = computed(() => draft.value.security);
</script>

<template>
  <section
    data-testid="step-panel-3"
    class="alt-panel"
    aria-labelledby="alt-step-3"
  >
    <h2
      id="alt-step-3"
      class="alt-sr-only"
    >
      安全配置
    </h2>
    <div
      class="alt-note alt-note--wide"
      :class="{ 'alt-note--muted': !store.hasBackendRoute }"
      data-testid="security-banner"
      role="note"
    >
      <i
        class="icon-sys-info"
        aria-hidden="true"
      /> 仅针对后端服务有效<span v-if="!store.hasBackendRoute">（当前没有路由使用「后端服务」，以下配置不会生效）</span>
    </div>
    <dao-form
      label-width="160px"
      :class="{ 'alt-muted': !store.hasBackendRoute }"
    >
      <field label="JWT 认证">
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
              v-for="[value, label] in OPTIONS.jwtModes"
              :key="value"
              :value="value"
              name="alt-jwt"
              :label="label"
            />
          </dao-radio-group>
        </div>
        <div
          v-if="security.jwtMode === 'domain'"
          class="alt-note alt-note--inline"
          data-testid="jwt-banner"
          role="note"
        >
          <i
            class="icon-sys-info"
            aria-hidden="true"
          /> 当前 <a
            class="alt-link"
            href="#/domains"
            @click.prevent
          >API 关联的域名</a>，已启用 JWT 认证。
        </div>
      </field>
      <field label="安全认证">
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
              v-for="[value, label] in OPTIONS.authModes"
              :key="value"
              :value="value"
              name="alt-auth"
              :label="label"
            />
          </dao-radio-group>
        </div>
        <div
          v-if="security.authMode === 'domain'"
          class="alt-note alt-note--inline"
          data-testid="auth-banner"
          role="note"
        >
          <i
            class="icon-sys-info"
            aria-hidden="true"
          /> 当前 <a
            class="alt-link"
            href="#/domains"
            @click.prevent
          >API 关联的域名</a>，已启用安全认证。
        </div>
        <div class="alt-box alt-box--solid">
          <dao-form label-width="160px">
            <field label="附加参数">
              <div class="alt-grid alt-grid--kv alt-grid--rows">
                <div class="alt-grid__row">
                  <span class="alt-grid__head">关键字</span><span class="alt-grid__head">值</span><span />
                </div>
                <div
                  v-for="(row, i) in security.extraParams"
                  :key="i"
                  class="alt-grid__row"
                  data-testid="extra-param-row"
                >
                  <dao-input
                    v-model="row.key"
                    block
                    :aria-label="`附加参数 ${i + 1} 关键字`"
                  />
                  <dao-input
                    v-model="row.value"
                    block
                    :aria-label="`附加参数 ${i + 1} 值`"
                  />
                  <button
                    type="button"
                    class="alt-icon-btn"
                    :aria-label="`删除附加参数 ${i + 1}`"
                    @click="security.extraParams.splice(i, 1)"
                  >
                    <i
                      class="icon-close"
                      aria-hidden="true"
                    />
                  </button>
                </div>
              </div>
              <button
                type="button"
                class="alt-link"
                data-testid="btn-add-extra-param"
                @click="security.extraParams.push(emptyKV())"
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
    </dao-form>
  </section>
</template>
