// Rule-table based validation: each rule is { field, test(values) => boolean, message }.
export const RULES = [
  { field: "username", message: "用户名长度需为 3–16 个字符", test: (v) => v.username.length >= 3 && v.username.length <= 16 },
  { field: "username", message: "用户名只能包含字母、数字和下划线", test: (v) => /^\w*$/.test(v.username) },
  { field: "email", message: "邮箱必须且只能包含一个 @", test: (v) => v.email.split("@").length === 2 && v.email.indexOf("@") > 0 },
  { field: "email", message: "邮箱域名部分需要包含 .", test: (v) => { const domain = v.email.slice(v.email.indexOf("@") + 1); return /^[^.].*\.[^.]+$/.test(domain); } },
  { field: "password", message: "密码长度至少 8 位", test: (v) => v.password.length >= 8 },
  { field: "password", message: "密码需同时包含字母和数字", test: (v) => /[a-zA-Z]/.test(v.password) && /[0-9]/.test(v.password) },
  { field: "confirm", message: "两次输入的密码不一致", test: (v) => v.confirm.length > 0 && v.confirm === v.password },
];

const normalize = (values) => Object.fromEntries(["username", "email", "password", "confirm"].map((k) => [k, String(values[k] ?? "")]));

// Returns the first failing rule message per field; fields without failures are omitted.
export function validateForm(values) {
  const v = normalize(values);
  return RULES.reduce((errors, rule) => (errors[rule.field] || rule.test(v) ? errors : { ...errors, [rule.field]: rule.message }), {});
}

export const isValid = (values) => Object.keys(validateForm(values)).length === 0;
