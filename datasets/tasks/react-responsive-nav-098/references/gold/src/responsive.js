export const MOBILE_QUERY = "(max-width: 767px)";

export function isMobileWidth(width) { return width < 768; }

export function navListVisible({ mobile, open }) { return !mobile || open; }

export function toggleLabel(open) { return open ? "收起导航菜单" : "展开导航菜单"; }

export function styles() {
  return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, sans-serif; }
    .nav { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 16px; background: #0f172a; color: #fff; }
    .brand { font-weight: 700; font-size: 18px; margin-right: auto; }
    .nav-toggle { display: none; border: 1px solid #94a3b8; background: transparent; color: #fff; border-radius: 6px; padding: 8px 12px; font-size: 14px; }
    .nav-list { display: flex; flex-wrap: wrap; gap: 4px; list-style: none; margin: 0; padding: 0; }
    .nav-list a { display: block; padding: 8px 12px; color: #fff; text-decoration: none; }
    .hero { padding: 32px 16px; }
    .hero h1 { margin: 0 0 8px; }
    .hero p { margin: 0; color: #475569; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; padding: 0 16px 32px; }
    .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; min-width: 0; }
    .card h2 { margin: 0 0 8px; font-size: 18px; }
    .card p { margin: 0; overflow-wrap: anywhere; }
    @media ${MOBILE_QUERY} {
      .nav-toggle { display: inline-block; }
      .nav-list { flex-direction: column; flex-basis: 100%; }
      .nav-list[hidden] { display: none; }
      .grid { grid-template-columns: minmax(0, 1fr); }
    }
  `;
}
