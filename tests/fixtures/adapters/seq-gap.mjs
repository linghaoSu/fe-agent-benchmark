import { frame, onFrame, send } from "./_helpers.mjs";

send(frame(0, "hello", { adapter: { id: "seq-gap", version: "1" }, capabilities: [] }));
onFrame((incoming) => {
  if (incoming.type === "task_context") {
    send(frame(2, "ready", {}));
  }
});
