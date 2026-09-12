<script setup lang="ts">
import {
  DaoForm, DaoFormItem, DaoInput, DaoSelect, DaoOption, DaoRadioGroup, DaoRadio,
} from '@dao-style/core';
import { computed } from 'vue';
import {
  API_GROUPS, DOMAINS, SERVICES, METHODS, PATH_TYPES, MATCH_OPERATORS, TARGET_TYPES,
  createMatchRow, createRoute, createServiceRow,
} from '../model';
import type { MatchRow, Route } from '../model';
import { useApiForm } from '../useApiForm';
import FieldError from './FieldError.vue';
import InfoBanner from './InfoBanner.vue';
import AppSwitch from './AppSwitch.vue';
import RowActions from './RowActions.vue';

const store = useApiForm();
const { form } = store;
const err = (key: string) => store.errorOf(key);
const describedBy = (key: string) => (err(key) ? `error-${key}` : undefined);
const invalid = (key: string) => (err(key) ? 'true' : 'false');
const status = (key: string) => (err(key) ? 'error' : 'default');

const groupOptions = computed(() => {
  const options = [...API_GROUPS];

  if (form.group && !options.includes(form.group)) {
    options.unshift(form.group);
  }

  return options;
});
const groupKeyword = ref('');
const canCreateGroup = computed(() => groupKeyword.value.trim() !== '' && !groupOptions.value.includes(groupKeyword.value.trim()));
const createGroup = () => {
  form.group = groupKeyword.value.trim();
  groupKeyword.value = '';
};

const expanded = ref<Set<number>>(new Set([0]));
const toggleRoute = (index: number) => {
  if (expanded.value.has(index)) {
    expanded.value.delete(index);
  } else {
    expanded.value.add(index);
  }
  expanded.value = new Set(expanded.value);
};
const routeHasError = (index: number) => Object.keys(store.errors.value).some((key) => key.startsWith(`routes.${index}.`));
const addRoute = () => {
  form.routes.push(createRoute());
  expanded.value = new Set([...expanded.value, form.routes.length - 1]);
};
const removeRoute = (index: number) => {
  if (form.routes.length > 1) {
    form.routes.splice(index, 1);
  }
};
const addRow = (rows: MatchRow[]) => rows.push(createMatchRow());
const removeRow = (rows: MatchRow[], index: number) => rows.splice(index, 1);
const addService = (route: Route) => route.services.push(createServiceRow());
const removeService = (route: Route, index: number) => {
  if (route.services.length > 1) {
    route.services.splice(index, 1);
  }
};
const onAutoWeight = (route: Route, value: boolean) => {
  Object.assign(route, { autoWeight: value });
  if (value) {
    route.services.forEach((service, index) => {
      route.services.splice(index, 1, {
        ...service,
        weight: undefined,
      });
    });
  }
};
const setWeight = (route: Route, index: number, value: string | number | undefined) => {
  const weight = value === '' || value === undefined || value === null ? undefined : Number(value);

  route.services.splice(index, 1, {
    ...route.services[index],
    weight,
  });
};
const numberOrUndefined = (value: string | number | undefined) => (value === '' || value === undefined || value === null ? undefined : Number(value));
</script>

<template>
  <section
    data-testid="step-panel-1"
    class="api-step"
    aria-labelledby="step-1-title"
  >
    <h2
      id="step-1-title"
      class="api-step__title"
    >
      基本信息
    </h2>
    <dao-form label-width="160px">
      <dao-form-item
        label="API 名称"
        required
      >
        <label
          class="sr-only"
          for="field-name"
        >API 名称</label>
        <dao-input
          id="field-name"
          v-model="form.name"
          data-testid="field-name"
          :root-attrs="{ class: 'api-input' }"
          :status="status('name')"
          :aria-invalid="invalid('name')"
          :aria-describedby="describedBy('name')"
          maxlength="63"
        />
        <field-error
          id="error-name"
          :message="err('name')"
        />
        <template #helper>
          <p class="dao-form-item__helper-text">
            包含小写字母、数字和以及特殊字符(- .)，且不能以特殊字符开头和结尾，长度 63，创建后不可更改
          </p>
        </template>
      </dao-form-item>

      <dao-form-item
        label="API 分组"
        required
      >
        <div
          data-testid="field-group"
          class="api-input"
          :aria-invalid="invalid('group')"
          :aria-describedby="describedBy('group')"
        >
          <dao-select
            v-model="form.group"
            :status="status('group')"
            placeholder="请选择或输入分组名称"
            aria-label="API 分组"
          >
            <dao-option
              v-for="option in groupOptions"
              :key="option"
              :value="option"
              :label="option"
            />
            <template #optionsHeader>
              <div class="dao-selection-search api-select-search">
                <label
                  class="sr-only"
                  for="field-group-keyword"
                >输入分组名称</label>
                <input
                  id="field-group-keyword"
                  v-model="groupKeyword"
                  class="dao-selection-search-input"
                  type="search"
                  placeholder="输入分组名称检索或创建"
                  @keydown.enter.prevent="canCreateGroup && createGroup()"
                >
                <button
                  v-if="canCreateGroup"
                  type="button"
                  class="api-add-link api-select-create"
                  data-action-id="btn-create-group"
                  @click="createGroup"
                >
                  <i
                    class="icon-add"
                    aria-hidden="true"
                  />
                  创建分组「{{ groupKeyword.trim() }}」
                </button>
              </div>
            </template>
          </dao-select>
        </div>
        <field-error
          id="error-group"
          :message="err('group')"
        />
        <template #helper>
          <p class="dao-form-item__helper-text">
            由名称检索下拉选取，分组名称不存在时可创建
          </p>
        </template>
      </dao-form-item>

      <dao-form-item
        label="关联域名"
        required
      >
        <div class="api-inline">
          <div
            data-testid="field-domains"
            class="api-input"
            :aria-invalid="invalid('domains')"
            :aria-describedby="describedBy('domains')"
          >
            <dao-select
              v-model="form.domains"
              multiple
              hide-select-all
              :status="status('domains')"
              placeholder="请选择关联域名"
              aria-label="关联域名"
            >
              <dao-option
                v-for="domain in DOMAINS"
                :key="domain"
                :value="domain"
                :label="domain"
              />
            </dao-select>
          </div>
          <a
            class="api-link"
            href="#/domains/create"
            @click.prevent
          >
            <i
              class="icon-refresh"
              aria-hidden="true"
            />
            添加域名
          </a>
        </div>
        <field-error
          id="error-domains"
          :message="err('domains')"
        />
      </dao-form-item>
    </dao-form>

    <h2 class="api-step__title">
      匹配规则
    </h2>
    <dao-form label-width="160px">
      <dao-form-item
        label="路径"
        required
      >
        <div class="api-path">
          <div
            data-testid="field-path-type"
            class="api-path__type"
            :aria-invalid="invalid('pathType')"
          >
            <dao-select
              v-model="form.pathType"
              aria-label="路径匹配方式"
            >
              <dao-option
                v-for="type in PATH_TYPES"
                :key="type.value"
                :value="type.value"
                :label="type.label"
              />
            </dao-select>
          </div>
          <label
            class="sr-only"
            for="field-path"
          >路径</label>
          <dao-input
            id="field-path"
            v-model="form.path"
            data-testid="field-path"
            :root-attrs="{ class: 'api-path__input' }"
            placeholder="示例：/api/v1"
            :status="status('path')"
            :aria-invalid="invalid('path')"
            :aria-describedby="describedBy('path')"
          />
        </div>
        <field-error
          id="error-path"
          :message="err('path')"
        />
      </dao-form-item>

      <dao-form-item
        label="请求方法"
        required
      >
        <div
          data-testid="field-methods"
          class="api-input"
          :aria-invalid="invalid('methods')"
          :aria-describedby="describedBy('methods')"
        >
          <dao-select
            v-model="form.methods"
            multiple
            hide-select-all
            :status="status('methods')"
            placeholder="请选择请求方法"
            aria-label="请求方法"
          >
            <dao-option
              v-for="method in METHODS"
              :key="method"
              :value="method"
              :label="method"
            />
          </dao-select>
        </div>
        <field-error
          id="error-methods"
          :message="err('methods')"
        />
      </dao-form-item>
    </dao-form>

    <h2 class="api-step__title">
      路由配置
    </h2>
    <field-error
      id="error-routes"
      :message="err('routes')"
    />
    <div
      v-for="(route, routeIndex) in form.routes"
      :key="routeIndex"
      data-testid="route-card"
      class="api-route"
      :class="{ 'api-route--expanded': expanded.has(routeIndex) }"
    >
      <div class="api-route__header">
        <button
          type="button"
          class="api-route__toggle"
          :aria-expanded="expanded.has(routeIndex) ? 'true' : 'false'"
          :aria-controls="`route-body-${routeIndex}`"
          @click="toggleRoute(routeIndex)"
        >
          <i
            class="icon-dropdown-line api-route__chevron"
            aria-hidden="true"
          />
          路由配置 {{ String(routeIndex + 1).padStart(2, '0') }}
        </button>
        <span class="api-route__spacer" />
        <i
          v-if="routeHasError(routeIndex)"
          class="icon-sys-warning api-route__warn"
          role="img"
          aria-label="该路由配置存在错误"
        />
        <button
          type="button"
          class="api-remove-btn"
          :disabled="form.routes.length <= 1"
          :aria-label="`删除路由配置 ${routeIndex + 1}`"
          data-action-id="btn-remove-route"
          @click="removeRoute(routeIndex)"
        >
          <i
            class="icon-close"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-show="expanded.has(routeIndex)"
        :id="`route-body-${routeIndex}`"
        class="api-route__body"
      >
        <dao-form label-width="160px">
          <dao-form-item label="请求头">
            <div class="api-rows">
              <div
                v-if="route.headers.length"
                class="api-rows__head api-rows__grid"
              >
                <span>Header 关键字</span><span>判断条件</span><span>对应值</span><span />
              </div>
              <div
                v-for="(row, rowIndex) in route.headers"
                :key="rowIndex"
                class="api-rows__grid"
                data-testid="header-row"
              >
                <dao-input
                  v-model="row.key"
                  :aria-label="`请求头 ${rowIndex + 1} 关键字`"
                  block
                />
                <dao-select
                  v-model="row.operator"
                  :aria-label="`请求头 ${rowIndex + 1} 判断条件`"
                >
                  <dao-option
                    v-for="op in MATCH_OPERATORS"
                    :key="op.value"
                    :value="op.value"
                    :label="op.label"
                  />
                </dao-select>
                <dao-input
                  v-model="row.value"
                  :aria-label="`请求头 ${rowIndex + 1} 对应值`"
                  block
                />
                <button
                  type="button"
                  class="api-remove-btn"
                  :aria-label="`删除请求头 ${rowIndex + 1}`"
                  @click="removeRow(route.headers, rowIndex)"
                >
                  <i
                    class="icon-close"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <row-actions
                label="添加参数"
                @add="addRow(route.headers)"
              />
            </div>
          </dao-form-item>

          <dao-form-item label="参数匹配">
            <div class="api-rows">
              <div
                v-if="route.params.length"
                class="api-rows__head api-rows__grid"
              >
                <span>参数名</span><span>判断条件</span><span>对应值</span><span />
              </div>
              <div
                v-for="(row, rowIndex) in route.params"
                :key="rowIndex"
                class="api-rows__grid"
                data-testid="param-row"
              >
                <dao-input
                  v-model="row.key"
                  :aria-label="`参数 ${rowIndex + 1} 名称`"
                  block
                />
                <dao-select
                  v-model="row.operator"
                  :aria-label="`参数 ${rowIndex + 1} 判断条件`"
                >
                  <dao-option
                    v-for="op in MATCH_OPERATORS"
                    :key="op.value"
                    :value="op.value"
                    :label="op.label"
                  />
                </dao-select>
                <dao-input
                  v-model="row.value"
                  :aria-label="`参数 ${rowIndex + 1} 对应值`"
                  block
                />
                <button
                  type="button"
                  class="api-remove-btn"
                  :aria-label="`删除参数 ${rowIndex + 1}`"
                  @click="removeRow(route.params, rowIndex)"
                >
                  <i
                    class="icon-close"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <row-actions
                label="添加参数"
                @add="addRow(route.params)"
              />
            </div>
          </dao-form-item>

          <dao-form-item
            label="目标服务"
            required
          >
            <info-banner class="api-route__banner">
              「策略配置」、「安全配置」仅对「后端服务」生效。
            </info-banner>
            <div
              data-testid="route-target"
              role="radiogroup"
              :aria-label="`路由配置 ${routeIndex + 1} 目标服务`"
              class="dao-form-item__radio-wrapper"
            >
              <dao-radio-group
                v-model="route.target"
                :vertical="false"
              >
                <dao-radio
                  v-for="target in TARGET_TYPES"
                  :key="target.value"
                  :value="target.value"
                  :name="`route-target-${routeIndex}`"
                  :label="target.label"
                />
              </dao-radio-group>
            </div>

            <div
              v-if="route.target === 'service'"
              class="api-target-box"
            >
              <dao-form label-width="160px">
                <dao-form-item
                  label="平台自动分配权重"
                  icon-message="开启后权重由平台按服务数量平均分配"
                >
                  <div class="dao-form-item__switch-wrapper">
                    <app-switch
                      :model-value="route.autoWeight"
                      data-testid="auto-weight"
                      label="平台自动分配权重"
                      @update:model-value="onAutoWeight(route, $event)"
                    />
                  </div>
                  <template #helper>
                    <p class="dao-form-item__helper-text api-helper-warning">
                      <i
                        class="icon-sys-warning"
                        aria-hidden="true"
                      /> 开启后会清空已完成的权重配置，请谨慎操作！
                    </p>
                  </template>
                </dao-form-item>
              </dao-form>

              <div
                v-for="(service, serviceIndex) in route.services"
                :key="serviceIndex"
                class="api-service"
                data-testid="service-row"
              >
                <dao-form
                  label-width="120px"
                  class="api-service__form"
                >
                  <dao-form-item
                    label="服务名称"
                    required
                  >
                    <div
                      class="api-input"
                      :aria-invalid="err(`routes.${routeIndex}.services.${serviceIndex}.name`) ? 'true' : 'false'"
                      :aria-describedby="describedBy(`routes.${routeIndex}.services.${serviceIndex}.name`)"
                    >
                      <dao-select
                        v-model="service.name"
                        data-testid="service-name"
                        :status="status(`routes.${routeIndex}.services.${serviceIndex}.name`)"
                        placeholder="选择服务"
                        :aria-label="`服务 ${serviceIndex + 1} 名称`"
                      >
                        <dao-option
                          v-for="name in SERVICES"
                          :key="name"
                          :value="name"
                          :label="name"
                        />
                      </dao-select>
                    </div>
                    <field-error
                      :id="`error-routes.${routeIndex}.services.${serviceIndex}.name`"
                      :message="err(`routes.${routeIndex}.services.${serviceIndex}.name`)"
                    />
                  </dao-form-item>
                  <dao-form-item
                    label="权重"
                    :required="!route.autoWeight"
                  >
                    <label
                      class="sr-only"
                      :for="`service-weight-${routeIndex}-${serviceIndex}`"
                    >服务 {{ serviceIndex + 1 }} 权重</label>
                    <dao-input
                      :id="`service-weight-${routeIndex}-${serviceIndex}`"
                      :model-value="service.weight"
                      data-testid="service-weight"
                      :root-attrs="{ class: 'api-input api-input--number' }"
                      type="number"
                      min="1"
                      max="100"
                      :disabled="route.autoWeight"
                      :placeholder="route.autoWeight ? '由平台自动分配' : '1-100'"
                      :status="status(`routes.${routeIndex}.services.${serviceIndex}.weight`)"
                      :aria-invalid="err(`routes.${routeIndex}.services.${serviceIndex}.weight`) || err(`routes.${routeIndex}.weights`) ? 'true' : 'false'"
                      :aria-describedby="describedBy(`routes.${routeIndex}.services.${serviceIndex}.weight`) ?? describedBy(`routes.${routeIndex}.weights`)"
                      @update:model-value="setWeight(route, serviceIndex, $event)"
                    />
                    <field-error
                      :id="`error-routes.${routeIndex}.services.${serviceIndex}.weight`"
                      :message="err(`routes.${routeIndex}.services.${serviceIndex}.weight`)"
                    />
                  </dao-form-item>
                  <dao-form-item
                    label="流量镜像"
                    icon-message="流量镜像选取的服务将不再参与负载均衡，但会收到全部的流量请求"
                  >
                    <div class="dao-form-item__switch-wrapper">
                      <app-switch
                        v-model="service.mirror"
                        data-testid="service-mirror"
                        :label="`服务 ${serviceIndex + 1} 流量镜像`"
                      />
                    </div>
                    <template #helper>
                      <p class="dao-form-item__helper-text">
                        <i
                          class="icon-sys-info"
                          aria-hidden="true"
                        /> 流量镜像选取的服务将不再参与负载均衡，但会收到全部的流量请求
                      </p>
                    </template>
                  </dao-form-item>
                </dao-form>
                <button
                  type="button"
                  class="api-remove-btn api-service__remove"
                  :disabled="route.services.length <= 1"
                  :aria-label="`删除服务 ${serviceIndex + 1}`"
                  data-action-id="btn-remove-service"
                  @click="removeService(route, serviceIndex)"
                >
                  <i
                    class="icon-remove"
                    aria-hidden="true"
                  />
                </button>
              </div>
              <field-error
                :id="`error-routes.${routeIndex}.weights`"
                :message="err(`routes.${routeIndex}.weights`)"
              />
              <field-error
                :id="`error-routes.${routeIndex}.services`"
                :message="err(`routes.${routeIndex}.services`)"
              />
              <row-actions
                label="添加服务"
                action-id="btn-add-service"
                @add="addService(route)"
              />
            </div>

            <div
              v-else-if="route.target === 'redirect'"
              class="api-target-box"
            >
              <dao-form label-width="160px">
                <dao-form-item
                  label="目标地址"
                  required
                >
                  <label
                    class="sr-only"
                    :for="`redirect-url-${routeIndex}`"
                  >目标地址</label>
                  <dao-input
                    :id="`redirect-url-${routeIndex}`"
                    v-model="route.redirectUrl"
                    data-testid="redirect-url"
                    :root-attrs="{ class: 'api-input' }"
                    placeholder="https://example.com/path"
                    :status="status(`routes.${routeIndex}.redirectUrl`)"
                    :aria-invalid="err(`routes.${routeIndex}.redirectUrl`) ? 'true' : 'false'"
                    :aria-describedby="describedBy(`routes.${routeIndex}.redirectUrl`)"
                  />
                  <field-error
                    :id="`error-routes.${routeIndex}.redirectUrl`"
                    :message="err(`routes.${routeIndex}.redirectUrl`)"
                  />
                </dao-form-item>
              </dao-form>
            </div>

            <div
              v-else
              class="api-target-box"
            >
              <dao-form label-width="160px">
                <dao-form-item
                  label="状态码"
                  required
                >
                  <label
                    class="sr-only"
                    :for="`direct-status-${routeIndex}`"
                  >状态码</label>
                  <dao-input
                    :id="`direct-status-${routeIndex}`"
                    :model-value="route.directStatus"
                    data-testid="direct-status"
                    :root-attrs="{ class: 'api-input api-input--number' }"
                    type="number"
                    min="100"
                    max="599"
                    :status="status(`routes.${routeIndex}.directStatus`)"
                    :aria-invalid="err(`routes.${routeIndex}.directStatus`) ? 'true' : 'false'"
                    :aria-describedby="describedBy(`routes.${routeIndex}.directStatus`)"
                    @update:model-value="route.directStatus = numberOrUndefined($event)"
                  />
                  <field-error
                    :id="`error-routes.${routeIndex}.directStatus`"
                    :message="err(`routes.${routeIndex}.directStatus`)"
                  />
                </dao-form-item>
                <dao-form-item label="响应体">
                  <label
                    class="sr-only"
                    :for="`direct-body-${routeIndex}`"
                  >响应体</label>
                  <textarea
                    :id="`direct-body-${routeIndex}`"
                    v-model="route.directBody"
                    data-testid="direct-body"
                    class="api-textarea"
                    rows="4"
                  />
                </dao-form-item>
              </dao-form>
            </div>
          </dao-form-item>
        </dao-form>
      </div>
    </div>
    <row-actions
      label="添加路由配置"
      action-id="btn-add-route"
      class="api-add-route"
      @add="addRoute"
    />
  </section>
</template>
