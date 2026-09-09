import { frame, onFrame, send } from "./_helpers.mjs";

send(frame(0, "hello", { adapter: { id: "stall", version: "1" }, capabilities: [] }));
onFrame((incoming) => {
  if (incoming.type === "task_context") {
    send(frame(1, "ready", {}));
    setTimeout(() => {}, 10_000);
  }
});
