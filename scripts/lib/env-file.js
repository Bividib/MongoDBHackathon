const fs = require("node:fs");
const path = require("node:path");

const defaultEnvPath = path.join(process.cwd(), ".env");

function readEnvLines(envPath = defaultEnvPath) {
  if (!fs.existsSync(envPath)) {
    return [];
  }

  return fs.readFileSync(envPath, "utf8").split(/\r?\n/);
}

function parseEnvLines(lines) {
  const values = {};

  for (const line of lines) {
    const match = line.match(/^\s*([^#=]+)=(.*)$/);

    if (!match) {
      continue;
    }

    const key = match[1].trim();
    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function upsertEnvValue(key, value, envPath = defaultEnvPath) {
  const lines = readEnvLines(envPath);
  let updated = false;

  const nextLines = lines.map((line) => {
    if (line.match(new RegExp(`^\\s*${key}\\s*=`))) {
      updated = true;
      return `${key}=${value}`;
    }

    return line;
  });

  if (!updated) {
    nextLines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, `${nextLines.join("\n").replace(/\n+$/, "")}\n`, "utf8");
}

module.exports = {
  parseEnvLines,
  readEnvLines,
  upsertEnvValue,
};
