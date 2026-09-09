import { frame, send } from "./_helpers.mjs";

send(frame(0, "hello", { adapter: { id: "wrong-version", version: "1" }, capabilities: [] }, 2));
setInterval(() => {}, 10_000);
