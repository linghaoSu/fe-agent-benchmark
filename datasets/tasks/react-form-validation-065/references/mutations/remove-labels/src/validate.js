export const MESSAGES = {
  username: "用户名需为 3–16 位字母、数字或下划线",
  email: "请输入有效的邮箱地址",
  password: "密码至少 8 位，且需同时包含字母和数字",
  confirm: "两次输入的密码不一致",
};

export function validateUsername(value) { return /^[A-Za-z0-9_]{3,16}$/.test(value); }

export function validateEmail(value) {
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && domain.includes(".") && !domain.startsWith(".") && !domain.endsWith(".");
}

export function validatePassword(value) { return value.length >= 8 && /[A-Za-z]/.test(value) && /\d/.test(value); }

export function validateForm(values) {
  const errors = {};
  if (!validateUsername(values.username || "")) errors.username = MESSAGES.username;
  if (!validateEmail(values.email || "")) errors.email = MESSAGES.email;
  if (!validatePassword(values.password || "")) errors.password = MESSAGES.password;
  if (!values.confirm || values.confirm !== values.password) errors.confirm = MESSAGES.confirm;
  return errors;
}
