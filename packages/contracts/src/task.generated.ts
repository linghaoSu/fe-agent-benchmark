// Generated from the canonical JSON Schema. Do not edit by hand.
export type FrontendAgentEvaluationTask = {
  "schemaVersion": number;
  "id": string;
  "version": number;
  "title": string;
  "tags"?: {
    "framework"?: string;
    "language"?: string;
    "taskType"?: string;
    "difficulty"?: number;
    "capabilities"?: Array<string>;
  };
  "environment": {
    "image": string;
    "repositoryCommit": string;
    "packageManager": string;
    "locale": string;
    "timezone": string;
    "network": string;
    "mockApi"?: {
      "image": string;
      "command": Array<string>;
      "port": number;
    };
    "packageProxy"?: {
      "image": string;
      "command": Array<string>;
      "port": number;
      "fixtureDirectory": string;
    };
  };
  "viewports"?: Array<{
      "name": string;
      "width": number;
      "height": number;
    }>;
  "budget": {
    "maxWallTimeSeconds": number;
    "maxAgentSteps": number;
    "maxCostUsd": number;
  };
  "permissions": {
    "writablePaths": Array<string>;
    "forbiddenPaths": Array<string>;
    "allowDependencyChanges": boolean;
  };
  "commands": {
    "install": string;
    "typecheck": string;
    "lint": string;
    "test": string;
    "build": string;
    "start": string;
  };
  "evaluation": {
    "requiredGates": {
      "integrity": boolean;
      "build": boolean;
      "criticalFunctionalTests": boolean;
    };
    "weights": {
      "functional": number;
      "visual": number;
      "responsive": number;
      "accessibility": number;
      "engineering": number;
    };
  };
  "extensions"?: Record<string, unknown>;
};
