import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist/vendor", { recursive: true });
cpSync("index.html", "dist/index.html");
cpSync("src", "dist/src", { recursive: true });
const source = (file) => readFileSync(`node_modules/${file}`, "utf8");
const cjs = (body, resolver = "() => { throw new Error('Unknown dependency'); }") => `const process={env:{NODE_ENV:'development'}};const module={exports:{}};((module,exports,require)=>{${body}\n})(module,module.exports,${resolver});export default module.exports;`;
writeFileSync("dist/vendor/react.js", cjs(source("react/cjs/react.development.js")));
writeFileSync("dist/vendor/scheduler.js", cjs(source("scheduler/cjs/scheduler.development.js")));
writeFileSync("dist/vendor/react-dom.js", `import React from './react.js';import Scheduler from './scheduler.js';${cjs(source("react-dom/cjs/react-dom.development.js"), "(name)=>name==='react'?React:name==='scheduler'?Scheduler:undefined")}`);
writeFileSync("dist/vendor/react-dom-client.js", `import React from './react.js';import ReactDOM from './react-dom.js';import Scheduler from './scheduler.js';${cjs(source("react-dom/cjs/react-dom-client.development.js"), "(name)=>name==='react'?React:name==='react-dom'?ReactDOM:name==='scheduler'?Scheduler:undefined")}export const createRoot=module.exports.createRoot;export const hydrateRoot=module.exports.hydrateRoot;`);
