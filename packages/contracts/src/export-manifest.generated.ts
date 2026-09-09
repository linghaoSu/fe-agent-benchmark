// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentExportManifest = {
  "schemaVersion": number;
  "exportManifestId": string;
  "exportId": string;
  "runId": string;
  "audience": "requester";
  "createdAt": string;
  "entries": Array<{
      "artifactId": string;
      "path": string;
      "sha256": string;
      "mimeType": string;
      "sizeBytes": number;
      "audience": "requester_safe";
      "redactionStatus": "passed";
      "dataScanStatus": "passed";
    }>;
  "extensions"?: Record<string, unknown>;
};
