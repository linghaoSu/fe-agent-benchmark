# dashboard-ui

## Intro
[![issue平均修复时间](https://gitlab.daocloud.cn/ndx/qa/e2ecoverage/raw/main/badges/dashboard-ui/average_fix_time_perMonth.svg)](https://gitlab.daocloud.cn/ndx/frontend-engineering/dashboard-ui/-/issues) 

[![issue最长等待时间](https://gitlab.daocloud.cn/ndx/qa/e2ecoverage/raw/main/badges/dashboard-ui/earliest_issue.svg)](https://gitlab.daocloud.cn/ndx/frontend-engineering/dashboard-ui/-/issues)  

[![average_replyTime](https://gitlab.daocloud.cn/ndx/qa/e2ecoverage/raw/main/badges/dashboard-ui/average_replyTime.svg)](https://gitlab.daocloud.cn/ndx/frontend-engineering/dashboard-ui/-/issues)

[![dashboard](https://ndx.gitpages.daocloud.io/product/product-doc/images/badges/dashboard_前端完成度.svg)](https://ndx.gitpages.daocloud.io/product/product-doc/dce5.0/badge_baseline/dashboard/)

## Project setup
```
pnpm install
```

### Compiles and hot-reloads for development
```
pnpm run serve
```

### Compiles and minifies for production
```
pnpm run build
```

### Run your unit tests
```
pnpm run test:unit
```

### Run your unit tests in CI
```
pnpm run test:unit:ci
```

### AI assistant guidance

- `AGENTS.md`: shared project rules for AI coding agents
- `CLAUDE.md`: Claude compatibility entrypoint that points to `AGENTS.md`
- `docs/ai/project-structure.md`: structure-specific guidance for this project
- `docs/ai/references.md`: optional external API, prototype, and design references

### Lints and fixes files
```
pnpm run lint
```

### CI with GitLab Runner
```
export E2E_URL=
export BUILD_ARCH=
export PKGNAME=
export UI_IMAGE_VERSION=
export RELEASE_IMAGE_VERSION=
export REGISTRY_SERVER_ADDRESS=
export REGISTRY_REPO=
export REGISTRY_USER_NAME=
export REGISTRY_PASSWORD=
export kubeconfig=
```

### 升级后端版本环境变量说明

`change_backend_version` 会在 tag pipeline 中作为可选手动任务出现，未手动运行时不会阻塞后续任务。

```make
# release-image 镜像 tag，默认 latest；可在 .gitlab-ci.yml 或 GitLab CI/CD Variables 中配置
RELEASE_IMAGE_VERSION ?= latest
# 拥有访问后端目录的权限的 token, 建议在组级别进行配置
GITLAB_FE_PR_TOKEN ?=
# token 对应的 name 默认值为 'release-ci-token', 建议在组级别进行配置
GITLAB_FE_PR_TOKEN_NAME ?=
# 后端所在的组 默认值为 'ndx'
BACKEND_GROUP ?=
# 后端的 path name 默认为前端项目的 以 '-' 分割后的第一数据 如果是 'dashboard-ui-ui' ，那么该默认值为 'dashboard-ui'
BACKEND_PROJECT ?=
# 希望合并到的分支， 默认是 'master'，可配置 release-{version} 格式，`{version}` 将被 `major.minor` 替换
BACKEND_BRANCH ?=
# 手动运行 change_backend_version 时可填写完整后端目标 release 分支；优先级高于 BACKEND_BRANCH，且不参与 VERSION_GAP 替换
BACKEND_RELEASE_BRANCH ?=
# 需要修改版本的文件的路径，使用相对路径，默认值是 './charts/values.yaml'
UI_VALUES ?=
# 找到希望修改的行，默认值是 'ui:.image:.tag:', 规则是以 '.' 作为分割，先找到 'ui:'，然后找到离 'ui:' 最近的包含 'image:' 的行，然后找到离 'image:' 最近的包含 'tag:' 行，最后一个条件命中的即为希望修改的行.
UI_TAG_PATH ?=
# 希望将目标行的哪一部分更改为 新版本号，默认值是 '(v\\d*\\.\\d*\\.\\d*)'
# 所进行的操作是 
# '<目标行>'.replace(new RegExp(process.UI_VERSION_REGEX || '(v\\d*\\.\\d*\\.\\d*)'), <newVersion>);
UI_VERSION_REGEX ?=
# 前后端版本差距，如 v0.11 和 v0.9，差距为 2，默认为 0
VERSION_GAP =
# i18n 覆盖率，取值范围[0, 1]，对应 0-100%，默认为 1
I18N_COVERAGE =
# pr 部署环境 kubeconfig 配置文件
TEST_KUBECONF =
# pr 部署环境部署 yaml，参考 https://gitlab.daocloud.cn/-/snippets/10/raw/main/test_deploy_yaml
TEST_DEPLOY_YAML =
# pr 部署环境 ip，用于 EndpointSlices 连接
TEST_ENV_IP =
# dev 部署环境部署 yaml，涵盖 GProductProxy，EndpointSlices，Service，参考 https://gitlab.daocloud.cn/-/snippets/10/raw/main/dev_deploy_yaml
DEV_DEPLOY_YAML =
# dev 部署环境访问地址，用于生成最后预览访问地址
DEV_ENV_ADDR =
# 在 variable 中配置，以使构建镜像的缓存实效
FORCE_CACHE ?=
# nginx 镜像 tag，默认为 1.21.6-alpine
NGINX_IMAGE_VERSION ?= 1.21.6-alpine
# 支持配置镜像来源，默认为 阿里源
APK_MIRROR_SOURCE ?= mirrors.aliyun.com
# sws 镜像 tag，选择 sws 静态服务器时生效
SWS_IMAGE_VERSION ?= 2.42.0-alpine
```
