// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentDataScanCoveragePolicy = {
  "schemaVersion": number;
  "dataScanCoveragePolicyId": string;
  "version": number;
  "requiredSurfaces": Array<"structured" | "text" | "archive_members" | "image_metadata" | "image_readable_text" | "type_specific_binary_handler">;
  "limits": {
    "maxArchiveDepth": number;
    "maxExpandedBytes": number;
    "maxEntries": number;
    "maxFileBytes": number;
  };
  "worker": {
    "network": "denied";
    "readOnlyInput": true;
    "writableHostMount": false;
  };
  "unsupportedOutcome": "fail_closed";
  "extensions"?: Record<string, unknown>;
};
