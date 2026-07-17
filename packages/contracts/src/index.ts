import { readFileSync } from "node:fs";

import { Ajv2020, type ErrorObject } from "ajv/dist/2020.js";
import { parse } from "yaml";

const SUPPORTED_SCHEMA_MAJOR = 1;
const taskSchema = JSON.parse(
  readFileSync(new URL("../../../schemas/task.schema.json", import.meta.url), "utf8"),
) as { $id: string; $schema: string };
const validateTaskSchema = new Ajv2020({ allErrors: true }).compile(taskSchema);

export interface ContractError {
  code: string;
  location: string;
  message: string;
}

export type TaskValidationResult =
  | {
      valid: true;
      taskId: string;
      version: number;
      schema: {
        id: string;
        draft: string;
        version: number;
      };
    }
  | {
      valid: false;
      errors: ContractError[];
    };

function pointer(location: string, property: string): string {
  const escapedProperty = property.replaceAll("~", "~0").replaceAll("/", "~1");
  return `${location}/${escapedProperty}`;
}

function structuralError(error: ErrorObject): ContractError {
  if (error.keyword === "required") {
    const missingProperty = (error.params as { missingProperty: string }).missingProperty;
    return {
      code: "schema.required",
      location: pointer(error.instancePath, missingProperty),
      message: `Required property ${missingProperty} is missing`,
    };
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = (error.params as { additionalProperty: string }).additionalProperty;
    return {
      code: "schema.additional_property",
      location: pointer(error.instancePath, additionalProperty),
      message: `Unknown property ${additionalProperty}`,
    };
  }

  const codes: Record<string, string> = {
    enum: "schema.enum",
    maximum: "schema.range",
    minimum: "schema.range",
    minLength: "schema.min_length",
    pattern: "schema.pattern",
    type: "schema.type",
    uniqueItems: "schema.unique_items",
  };

  return {
    code: codes[error.keyword] ?? "schema.invalid",
    location: error.instancePath,
    message: error.message ?? "Value does not match the Task schema",
  };
}

export function validateTaskFile(path: string): TaskValidationResult {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    return {
      valid: false,
      errors: [{
        code: "input.read_error",
        location: "",
        message: error instanceof Error ? error.message : "Unable to read Task file",
      }],
    };
  }

  let task: unknown;
  try {
    task = parse(source);
  } catch (error) {
    return {
      valid: false,
      errors: [{
        code: "yaml.parse_error",
        location: "",
        message: error instanceof Error ? error.message : "Unable to parse Task YAML",
      }],
    };
  }

  if (!validateTaskSchema(task)) {
    return {
      valid: false,
      errors: (validateTaskSchema.errors ?? []).map(structuralError),
    };
  }

  const validatedTask = task as { id: string; version: number; schemaVersion: number };
  if (validatedTask.schemaVersion !== SUPPORTED_SCHEMA_MAJOR) {
    return {
      valid: false,
      errors: [{
        code: "schema.unsupported_major",
        location: "/schemaVersion",
        message: `Unsupported Task schema major version ${validatedTask.schemaVersion}`,
      }],
    };
  }

  return {
    valid: true,
    taskId: validatedTask.id,
    version: validatedTask.version,
    schema: {
      id: taskSchema.$id,
      draft: taskSchema.$schema,
      version: validatedTask.schemaVersion,
    },
  };
}
