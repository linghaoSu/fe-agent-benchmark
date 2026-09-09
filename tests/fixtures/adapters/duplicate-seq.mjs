import { frame, onFrame, send } from "./_helpers.mjs";

send(frame(0, "hello", { adapter: { id: "duplicate", version: "1" }, capabilities: [] }));
onFrame((incoming) => {
  if (incoming.type === "task_context") {
    send(frame(1, "ready", {}));
    const event = frame(2, "event", { name: "duplicate_once", data: { value: 1 } });
    send(event);
    send(event);
    send(frame(3, "complete", { outcome: "completed", summary: "duplicate ignored", patch: "" }));
  } else if (incoming.type === "shutdown") {
    process.exit(0);
  }
});
