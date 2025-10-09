export function getValueByPath(obj: any, path: string): any {
  const properties = path.split('.');
  let current: any = obj;

  for (const prop of properties) {
    if (prop.match(/^\d+$/)) {
      current = current[parseInt(prop)];
    } else {
      current = current?.[prop];
    }

    if (current === undefined || current === null) {
      return undefined;
    }
  }

  return current;
}

// Example usage:
// const keyPath = 'glossary.GlossDiv.GlossList.GlossEntry.SortAs';
// const keyPath_withArray = 'glossary.GlossDiv.GlossList.GlossEntry.0.SortAs';
// const value = getValueByPath(payload, keyPath); // "SGML"
// console.log(value);
