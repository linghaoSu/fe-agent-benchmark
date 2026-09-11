// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentNetworkPolicy = {
  "schemaVersion": number;
  "networkPolicyId": string;
  "version": number;
  "phase": "agent" | "evaluation";
  "defaultAction": "deny" | "allow";
  "allowedDestinations": Array<{
      "destinationId": string;
      "kind": "mock_api" | "application" | "browser_controller" | "package_proxy";
      "alias"?: string;
      "port"?: number;
    }>;
  "violationCode": "NETWORK_POLICY_VIOLATION";
  "extensions"?: Record<string, unknown>;
};
