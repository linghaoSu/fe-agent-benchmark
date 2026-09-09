// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentArtifactManifest = {
  "schemaVersion": number;
  "artifactManifestId": string;
  "attemptId": string;
  "status": "finalized";
  "entries": Array<{
      "artifactId": string;
      "logicalType": string;
      "producerRef": string;
      "evidenceRefs"?: Array<string>;
      "mimeType": string;
      "sizeBytes": number;
      "sha256": string;
      "path": string;
      "status": "staged" | "finalized" | "not_applicable";
      "audience": "maintainer_only" | "requester_safe";
      "redactionStatus": "not_required" | "pending" | "passed" | "failed";
      "dataScanStatus": "pending" | "passed" | "failed";
      "scanMetadata": {
        "scannedChecksum": string;
        "scannerVersion": string;
        "scannerWorkerDigest": string;
        "coveragePolicyVersion": number;
        "coverageOutcome": "complete" | "partial" | "unsupported";
      };
      "notApplicableReason"?: string;
    }>;
  "extensions"?: Record<string, unknown>;
};
