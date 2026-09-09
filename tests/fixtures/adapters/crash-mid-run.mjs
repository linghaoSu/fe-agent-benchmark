import { frame, onFrame, send } from "./_helpers.mjs";

send(frame(0, "hello", { adapter: { id: "crash", version: "1" }, capabilities: [] }));
onFrame((incoming) => {
  if (incoming.type === "task_context") {
    send(frame(1, "ready", {}));
    send(frame(2, "event", { name: "before_crash" }));
    setImmediate(() => process.exit(17));
  }
});
