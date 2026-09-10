# 购物车数量与合计

为购物车页面实现数量调整、删除与合计功能。商品数据来自 `src/data/cart.js`，其中 `unitPrice` 为以「分」为单位的整数。

- 每一行商品（`data-testid="cart-row"`）需要提供 `data-testid="qty-increment"` 与 `data-testid="qty-decrement"` 两个按钮调整数量；当前数量显示在 `data-testid="qty-value"` 中。
- 数量最小为 1、最大为 99：数量为 1 时点击减少不产生任何变化，数量为 99 时点击增加不产生任何变化。
- 每一行提供 `data-testid="remove-item"` 按钮，点击后移除该商品。
- `data-testid="item-count"` 显示所有商品数量之和。
- `data-testid="cart-total"` 显示所有商品 `unitPrice × quantity` 的总和，格式为 `¥1,234.50`：人民币符号、两位小数、千位分隔符。
- 金额计算必须使用整数「分」进行，最后再格式化为元，不得使用浮点数元进行累加。
- 购物车为空时显示 `data-testid="empty-cart"` 的提示信息。
- 所有按钮需要可访问名称（`aria-label` 或可见文本），页面在 375px 宽度下不得出现横向滚动。

不要修改依赖、`evaluator/` 或 `references/`。
