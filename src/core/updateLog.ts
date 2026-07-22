export const ROOT_UPDATE_LOG = "log.md";

/** Create the optional OKF root update log (§7). */
export function createUpdateLog(date: string): string {
  return (
    "# Bundle Update Log\n\n" +
    `## ${date}\n` +
    "* **Initialization**: Enabled editor-maintained update logging.\n"
  );
}

/** Add one explicit Save Changes description, newest first. */
export function appendUpdateLog(
  source: string,
  date: string,
  description: string,
): string {
  const entry = `* **Update**: ${normalizeDescription(description)}\n`;
  const sameDate = new RegExp(`^## ${date}\\s*$`, "m").exec(source);
  if (sameDate !== null) {
    const lineEnd = source.indexOf("\n", sameDate.index);
    const insertAt = lineEnd === -1 ? source.length : lineEnd + 1;
    return source.slice(0, insertAt) + entry + source.slice(insertAt);
  }

  const firstDate = /^## \d{4}-\d{2}-\d{2}\s*$/m.exec(source);
  if (firstDate === null) {
    return `${source.trimEnd()}\n\n## ${date}\n${entry}`;
  }
  const prefix = source.slice(0, firstDate.index).trimEnd();
  const history = source.slice(firstDate.index).trimStart();
  return `${prefix}\n\n## ${date}\n${entry}\n${history}`;
}

function normalizeDescription(description: string): string {
  const flattened = description.replace(/\s+/g, " ").trim();
  return /[.!?]$/.test(flattened) ? flattened : `${flattened}.`;
}
