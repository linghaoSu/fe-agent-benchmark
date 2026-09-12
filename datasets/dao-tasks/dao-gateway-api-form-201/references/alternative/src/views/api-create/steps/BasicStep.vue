<script setup lang="ts">
import {
  DaoForm, DaoInput, DaoRadioGroup, DaoRadio,
} from '@dao-style/core';
import { storeToRefs } from 'pinia';
import { useApiDraftStore } from '@/stores/api-draft-store';
import { OPTIONS, emptyMatch } from '@/stores/api-draft';
import type { MatchDraft, RouteDraft } from '@/stores/api-draft';
import Field from '../ui/Field.vue';
import Pick from '../ui/Pick.vue';
import Toggle from '../ui/Toggle.vue';

const store = useApiDraftStore();
const { draft } = storeToRefs(store);
const collapsed = reactive(new Set<number>());
const isOpen = (index: number) => !collapsed.has(index);
const flip = (index: number) => (collapsed.has(index) ? collapsed.delete(index) : collapsed.add(index));
const groupChoices = computed(() => {
  const known = OPTIONS.groups as readonly string[];

  return draft.value.group && !known.includes(draft.value.group) ? [draft.value.group, ...known] : [...known];
});
const newGroup = ref('');
const createGroup = () => {
  const value = newGroup.value.trim();

  if (value) {
    draft.value.group = value;
    newGroup.value = '';
  }
};
const routeErrored = (index: number) => Object.keys(store.errors).some((key) => key.startsWith(`routes.${index}.`));
const toNumber = (value: unknown): number | null => (value === '' || value === null || value === undefined ? null : Number(value));
const setWeight = (route: RouteDraft, index: number, value: unknown) => {
  route.services.splice(index, 1, {
    ...route.services[index],
    weight: toNumber(value),
  });
};
const matchColumns = (rows: MatchDraft[], title: string, testId: string) => ({
  rows,
  title,
  testId,
});
</script>

<template>
  <section
    data-testid="step-panel-1"
    class="alt-panel"
    aria-labelledby="alt-step-1"
  >
    <h2
      id="alt-step-1"
      class="alt-panel__heading"
    >
      基本信息
    </h2>
    <dao-form label-width="160px">
      <field
        label="API 名称"
        path="name"
        required
        helper="包含小写字母、数字和以及特殊字符(- .)，且不能以特殊字符开头和结尾，长度 63，创建后不可更改"
      >
        <template #default="{ invalid, describedBy, status }">
          <dao-input
            v-model="draft.name"
            data-testid="field-name"
            aria-label="API 名称"
            maxlength="63"
            :status="status"
            :aria-invalid="invalid"
            :aria-describedby="describedBy"
            :root-attrs="{ class: 'alt-w-md' }"
          />
        </template>
      </field>
      <field
        label="API 分组"
        path="group"
        required
        helper="由名称检索下拉选取，分组名称不存在时可创建"
      >
        <template #default="{ invalid, describedBy, status }">
          <div class="alt-inline">
            <pick
              v-model="draft.group"
              class="alt-w-md"
              test-id="field-group"
              label="API 分组"
              placeholder="请选择或输入分组名称"
              :options="groupChoices"
              :status="status"
              :invalid="invalid"
              :described-by="describedBy"
            />
            <dao-input
              v-model="newGroup"
              aria-label="新分组名称"
              placeholder="输入新分组名称"
              :root-attrs="{ class: 'alt-w-sm' }"
              @keydown.enter.prevent="createGroup"
            />
            <button
              type="button"
              class="alt-link"
              data-testid="btn-create-group"
              @click="createGroup"
            >
              <i
                class="icon-add"
                aria-hidden="true"
              /> 创建分组
            </button>
          </div>
        </template>
      </field>
      <field
        label="关联域名"
        path="domains"
        required
      >
        <template #default="{ invalid, describedBy, status }">
          <div class="alt-inline">
            <pick
              v-model="draft.domains"
              class="alt-w-md"
              test-id="field-domains"
              label="关联域名"
              placeholder="请选择关联域名"
              multiple
              :options="OPTIONS.domains"
              :status="status"
              :invalid="invalid"
              :described-by="describedBy"
            />
            <a
              class="alt-link"
              href="#/domains/create"
              @click.prevent
            ><i
              class="icon-refresh"
              aria-hidden="true"
            /> 添加域名</a>
          </div>
        </template>
      </field>
    </dao-form>

    <h2 class="alt-panel__heading">
      匹配规则
    </h2>
    <dao-form label-width="160px">
      <field
        label="路径"
        path="path"
        required
      >
        <template #default="{ invalid, describedBy, status }">
          <div class="alt-path">
            <pick
              v-model="draft.pathType"
              class="alt-path__type"
              test-id="field-path-type"
              label="路径匹配方式"
              :options="OPTIONS.pathTypes"
            />
            <dao-input
              v-model="draft.path"
              data-testid="field-path"
              aria-label="路径"
              placeholder="示例：/api/v1"
              block
              :status="status"
              :aria-invalid="invalid"
              :aria-describedby="describedBy"
              :root-attrs="{ class: 'alt-path__input' }"
            />
          </div>
        </template>
      </field>
      <field
        label="请求方法"
        path="methods"
        required
      >
        <template #default="{ invalid, describedBy, status }">
          <pick
            v-model="draft.methods"
            class="alt-w-md"
            test-id="field-methods"
            label="请求方法"
            placeholder="请选择请求方法"
            multiple
            :options="OPTIONS.methods"
            :status="status"
            :invalid="invalid"
            :described-by="describedBy"
          />
        </template>
      </field>
    </dao-form>

    <h2 class="alt-panel__heading">
      路由配置
    </h2>
    <p
      v-if="store.errors.routes"
      class="alt-error"
      data-testid="error-routes"
      role="alert"
    >
      {{ store.errors.routes }}
    </p>
    <article
      v-for="(route, r) in draft.routes"
      :key="r"
      data-testid="route-card"
      class="alt-route"
    >
      <header class="alt-route__bar">
        <button
          type="button"
          class="alt-route__title"
          :aria-expanded="isOpen(r) ? 'true' : 'false'"
          :aria-controls="`alt-route-${r}`"
          @click="flip(r)"
        >
          <i
            class="icon-dropdown-line alt-route__chevron"
            :class="{ 'alt-route__chevron--closed': !isOpen(r) }"
            aria-hidden="true"
          />
          路由配置 {{ String(r + 1).padStart(2, '0') }}
        </button>
        <i
          v-if="routeErrored(r)"
          class="icon-sys-warning alt-route__warn"
          role="img"
          aria-label="该路由配置存在错误"
        />
        <button
          type="button"
          class="alt-icon-btn"
          :disabled="draft.routes.length <= 1"
          :aria-label="`删除路由配置 ${r + 1}`"
          data-testid="btn-remove-route"
          @click="store.removeRoute(r)"
        >
          <i
            class="icon-close"
            aria-hidden="true"
          />
        </button>
      </header>
      <div
        v-show="isOpen(r)"
        :id="`alt-route-${r}`"
        class="alt-route__body"
      >
        <dao-form label-width="160px">
          <field
            v-for="section in [matchColumns(route.headers, '请求头', 'header-row'), matchColumns(route.params, '参数匹配', 'param-row')]"
            :key="section.title"
            :label="section.title"
          >
            <div class="alt-grid alt-grid--match">
              <template v-if="section.rows.length">
                <span class="alt-grid__head">{{ section.title === '请求头' ? 'Header 关键字' : '参数名' }}</span>
                <span class="alt-grid__head">判断条件</span>
                <span class="alt-grid__head">对应值</span>
                <span />
              </template>
              <template
                v-for="(row, i) in section.rows"
                :key="i"
              >
                <dao-input
                  v-model="row.key"
                  block
                  :aria-label="`${section.title} ${i + 1} 关键字`"
                  :root-attrs="{ 'data-testid': section.testId }"
                />
                <pick
                  v-model="row.operator"
                  :label="`${section.title} ${i + 1} 判断条件`"
                  :options="OPTIONS.operators"
                />
                <dao-input
                  v-model="row.value"
                  block
                  :aria-label="`${section.title} ${i + 1} 对应值`"
                />
                <button
                  type="button"
                  class="alt-icon-btn"
                  :aria-label="`删除${section.title} ${i + 1}`"
                  @click="section.rows.splice(i, 1)"
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
              @click="section.rows.push(emptyMatch())"
            >
              <i
                class="icon-add"
                aria-hidden="true"
              /> 添加参数
            </button>
          </field>

          <field
            label="目标服务"
            required
          >
            <div
              class="alt-note"
              role="note"
            >
              <i
                class="icon-sys-info"
                aria-hidden="true"
              /> 「策略配置」、「安全配置」仅对「后端服务」生效。
            </div>
            <div
              data-testid="route-target"
              role="radiogroup"
              :aria-label="`路由配置 ${r + 1} 目标服务`"
              class="dao-form-item__radio-wrapper"
            >
              <dao-radio-group
                v-model="route.target"
                :vertical="false"
              >
                <dao-radio
                  v-for="[value, label] in OPTIONS.targets"
                  :key="value"
                  :value="value"
                  :name="`alt-target-${r}`"
                  :label="label"
                />
              </dao-radio-group>
            </div>

            <div
              v-if="route.target === 'service'"
              class="alt-box"
            >
              <dao-form label-width="160px">
                <field
                  label="平台自动分配权重"
                  helper="开启后会清空已完成的权重配置，请谨慎操作！"
                >
                  <div class="dao-form-item__switch-wrapper">
                    <toggle
                      :model-value="route.autoWeight"
                      data-testid="auto-weight"
                      label="平台自动分配权重"
                      @update:model-value="store.setAutoWeight(route, $event)"
                    />
                  </div>
                </field>
              </dao-form>
              <div
                v-for="(service, s) in route.services"
                :key="s"
                class="alt-service"
                data-testid="service-row"
              >
                <dao-form label-width="120px">
                  <field
                    label="服务名称"
                    :path="`routes.${r}.services.${s}.name`"
                    required
                  >
                    <template #default="{ invalid, describedBy, status }">
                      <pick
                        v-model="service.name"
                        class="alt-w-md"
                        test-id="service-name"
                        :label="`服务 ${s + 1} 名称`"
                        placeholder="选择服务"
                        :options="OPTIONS.services"
                        :status="status"
                        :invalid="invalid"
                        :described-by="describedBy"
                      />
                    </template>
                  </field>
                  <field
                    label="权重"
                    :path="`routes.${r}.services.${s}.weight`"
                    :required="!route.autoWeight"
                  >
                    <template #default="{ invalid, describedBy, status }">
                      <dao-input
                        :model-value="service.weight ?? undefined"
                        data-testid="service-weight"
                        type="number"
                        min="1"
                        max="100"
                        :aria-label="`服务 ${s + 1} 权重`"
                        :disabled="route.autoWeight"
                        :placeholder="route.autoWeight ? '由平台自动分配' : '1-100'"
                        :status="status"
                        :aria-invalid="invalid === 'true' || store.errors[`routes.${r}.servicesSum`] ? 'true' : 'false'"
                        :aria-describedby="describedBy ?? (store.errors[`routes.${r}.servicesSum`] ? `error-routes.${r}.servicesSum` : undefined)"
                        :root-attrs="{ class: 'alt-w-sm' }"
                        @update:model-value="setWeight(route, s, $event)"
                      />
                    </template>
                  </field>
                  <field
                    label="流量镜像"
                    helper="流量镜像选取的服务将不再参与负载均衡，但会收到全部的流量请求"
                  >
                    <div class="dao-form-item__switch-wrapper">
                      <toggle
                        v-model="service.mirror"
                        data-testid="service-mirror"
                        :label="`服务 ${s + 1} 流量镜像`"
                      />
                    </div>
                  </field>
                </dao-form>
                <button
                  type="button"
                  class="alt-icon-btn alt-service__remove"
                  :disabled="route.services.length <= 1"
                  :aria-label="`删除服务 ${s + 1}`"
                  @click="store.removeService(route, s)"
                >
                  <i
                    class="icon-remove"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <p
                v-for="key in [`routes.${r}.servicesSum`, `routes.${r}.services`]"
                v-show="store.errors[key]"
                :id="`error-${key}`"
                :key="key"
                :data-testid="`error-${key}`"
                class="alt-error"
                role="alert"
              >
                {{ store.errors[key] }}
              </p>
              <button
                type="button"
                class="alt-link"
                data-testid="btn-add-service"
                @click="store.addService(route)"
              >
                <i
                  class="icon-add"
                  aria-hidden="true"
                /> 添加服务
              </button>
            </div>

            <div
              v-else-if="route.target === 'redirect'"
              class="alt-box"
            >
              <dao-form label-width="160px">
                <field
                  label="目标地址"
                  :path="`routes.${r}.redirectUrl`"
                  required
                >
                  <template #default="{ invalid, describedBy, status }">
                    <dao-input
                      v-model="route.redirectUrl"
                      data-testid="redirect-url"
                      aria-label="目标地址"
                      placeholder="https://example.com/path"
                      :status="status"
                      :aria-invalid="invalid"
                      :aria-describedby="describedBy"
                      :root-attrs="{ class: 'alt-w-md' }"
                    />
                  </template>
                </field>
              </dao-form>
            </div>

            <div
              v-else
              class="alt-box"
            >
              <dao-form label-width="160px">
                <field
                  label="状态码"
                  :path="`routes.${r}.directStatus`"
                  required
                >
                  <template #default="{ invalid, describedBy, status }">
                    <dao-input
                      :model-value="route.directStatus ?? undefined"
                      data-testid="direct-status"
                      type="number"
                      min="100"
                      max="599"
                      aria-label="状态码"
                      :status="status"
                      :aria-invalid="invalid"
                      :aria-describedby="describedBy"
                      :root-attrs="{ class: 'alt-w-sm' }"
                      @update:model-value="route.directStatus = toNumber($event)"
                    />
                  </template>
                </field>
                <field label="响应体">
                  <textarea
                    v-model="route.directBody"
                    data-testid="direct-body"
                    aria-label="响应体"
                    class="alt-textarea"
                    rows="4"
                  />
                </field>
              </dao-form>
            </div>
          </field>
        </dao-form>
      </div>
    </article>
    <button
      type="button"
      class="alt-link"
      data-testid="btn-add-route"
      @click="store.addRoute()"
    >
      <i
        class="icon-add"
        aria-hidden="true"
      /> 添加路由配置
    </button>
  </section>
</template>
