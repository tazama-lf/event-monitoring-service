export function getValueByPath(obj: any, path: string): any {
  const properties = path.split('.');
  if (obj === null || obj === undefined) {
    throw new Error(`Property '${path}' not found`);
  }

  let current: any = obj;

  for (const prop of properties) {
    // Breaking down the regex /^\d+$/:

    // ^ - Start of string
    // \d+ - One or more digits (0-9)
    // $ - End of string

    if (/^\d+$/.test(prop)) {
      const index = Number(prop);
      current = current?.[index];
    } else {
      current = current?.[prop];
    }

    if (current === undefined || current === null) {
      throw new Error(`Property '${path}' not found`);
    }
  }

  return current;
}

// Example usage:
// const keyPath = 'glossary.GlossDiv.GlossList.GlossEntry.SortAs';
// const keyPath_withArray = 'glossary.GlossDiv.GlossList.GlossEntry.0.SortAs';
// const value = getValueByPath(payload, keyPath); // "SGML"
