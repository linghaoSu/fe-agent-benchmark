// 模拟异步搜索接口。查询越短，返回越慢：快速输入时较早的请求会较晚返回。
// 请勿修改本文件：隐藏测试依赖这里的延迟与匹配规则。
import { users } from "../data/users.js";

export function delayFor(query) {
  return Math.min(900, Math.max(60, 1900 - 600 * query.trim().length));
}

export function matchUsers(list, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return list;
  return list.filter((user) => user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle));
}

function abortError() {
  const error = new Error("The search request was aborted");
  error.name = "AbortError";
  return error;
}

export function searchUsers(query, { signal } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) { reject(abortError()); return; }
    const onAbort = () => { clearTimeout(timer); reject(abortError()); };
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(matchUsers(users, query));
    }, delayFor(query));
    if (signal) signal.addEventListener("abort", onAbort, { once: true });
  });
}
