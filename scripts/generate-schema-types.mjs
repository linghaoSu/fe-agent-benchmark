import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const schemaDirectory = new URL("../schemas/", import.meta.url);
const outputDirectory = new URL("../packages/contracts/src/", import.meta.url);
const schemaFiles = readdirSync(schemaDirectory)
  .filter((name) => name.endsWith(".schema.json"))
  .sort();

function resolveReference(root, reference) {
  return reference.slice(2).split("/").reduce(
    (value, segment) => value[segment.replaceAll("~1", "/").replaceAll("~0", "~")],
    root,
  );
}

function renderType(schema, root, depth = 0) {
  if (schema.$ref) {
    return renderType(resolveReference(root, schema.$ref), root, depth);
  }

  if (Object.hasOwn(schema, "const")) {
    return JSON.stringify(schema.const);
  }

  if (schema.enum) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }

  for (const composition of ["oneOf", "anyOf", "allOf"]) {
    if (schema[composition]) {
      const separator = composition === "allOf" ? " & " : " | ";
      const variants = schema[composition]
        .map((variant) => `(${renderType(variant, root, depth)})`)
        .join(separator);
      const base = { ...schema };
      delete base[composition];
      const baseType = Object.keys(base).some((key) => ["type", "properties", "$ref", "enum", "const"].includes(key))
        ? renderType(base, root, depth)
        : undefined;
      return baseType ? `(${baseType}) & (${variants})` : variants;
    }
  }

  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => renderType({ ...schema, type }, root, depth)).join(" | ");
  }

  if (schema.type === "array") {
    return `Array<${renderType(schema.items ?? {}, root, depth + 1)}>`;
  }

  if (schema.type === "object") {
    if (!schema.properties) {
      return schema.additionalProperties === false ? "Record<string, never>" : "Record<string, unknown>";
    }

    const required = new Set(schema.required ?? []);
    const indentation = "  ".repeat(depth + 1);
    const properties = Object.entries(schema.properties).map(([name, property]) =>
      `${indentation}${JSON.stringify(name)}${required.has(name) ? "" : "?"}: ${renderType(property, root, depth + 1)};`
    );
    return `{\n${properties.join("\n")}\n${"  ".repeat(depth)}}`;
  }

  const primitives = {
    boolean: "boolean",
    integer: "number",
    null: "null",
    number: "number",
    string: "string",
  };
  return primitives[schema.type] ?? "unknown";
}

function typeName(title) {
  return title.split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join("");
}

const check = process.argv.includes("--check");
const drift = [];
const exports = [];

for (const name of schemaFiles) {
  const input = new URL(name, schemaDirectory);
  const outputName = name.replace(".schema.json", ".generated.ts");
  const output = new URL(outputName, outputDirectory);
  const schema = JSON.parse(readFileSync(input, "utf8"));
  const source = [
    "// Generated from the canonical JSON Schema. Do not edit by hand.",
    `export type ${typeName(schema.title)} = ${renderType(schema, schema)};`,
    "",
  ].join("\n");
  exports.push(`export * from "./${outputName.replace(".ts", ".js")}";`);

  if (check) {
    try {
      if (readFileSync(output, "utf8") !== source) drift.push(outputName);
    } catch {
      drift.push(outputName);
    }
  } else {
    writeFileSync(output, source);
  }
}

const barrelName = "schemas.generated.ts";
const barrel = [
  "// Generated schema type exports. Do not edit by hand.",
  ...exports,
  "",
].join("\n");
const barrelPath = new URL(barrelName, outputDirectory);

if (check) {
  try {
    if (readFileSync(barrelPath, "utf8") !== barrel) drift.push(barrelName);
  } catch {
    drift.push(barrelName);
  }
} else {
  writeFileSync(barrelPath, barrel);
}

if (drift.length > 0) {
  console.error(`Generated schema types are stale: ${drift.join(", ")}`);
  process.exitCode = 1;
}
