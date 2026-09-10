# 响应式导航溢出修复

当前页面由顶部导航栏、Hero 区域和三列卡片组成，在 375px 宽的手机视口下会出现横向滚动条：导航链接使用 `flex-wrap: nowrap` 且每个链接 `min-width: 160px`，卡片固定 `width: 420px`。请修复为响应式布局。

- 在任务的所有视口（1440×900、768×1024、375×812）下页面都不得出现横向溢出（`document.documentElement.scrollWidth <= window.innerWidth`）。
- 宽度小于 768px 时，导航折叠为一个 `[data-testid=nav-toggle]` 按钮，点击可显示/隐藏链接列表 `[data-testid=nav-list]`；默认收起。按钮需带 `aria-expanded`（反映展开状态）、`aria-controls`（指向链接列表的 id）以及可访问名称（`aria-label` 或可见文字）。
- 宽度 ≥ 768px 时不显示折叠按钮，7 个 `[data-testid=nav-link]` 全部可见。
- 卡片 `[data-testid=card]` 在手机视口下变为单列自适应宽度，桌面/平板下保持多列且不使用固定像素宽度。
- 使用 `window.matchMedia('(max-width: 767px)')` 并监听其 `change` 事件，使布局在加载时和视口变化时都正确响应；样式可以写在 `app.js` 注入的 `<style>` 标签中，也可以用行内样式 + `matchMedia` 实现。
- 展开或折叠状态下所有 7 个链接都必须可达（展开后全部可见），`href` 与文案保持不变。
- 导航与卡片数据来自 `src/data/nav.js`，请勿修改。

不要修改依赖、`evaluator/` 或 `references/`。
