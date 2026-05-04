import { useEffect } from "react";
import { parseLiveYaml } from "../model";
import { useDocumentStore } from "./document";

export function useDebouncedParse(delayMs = 150): void {
  const yamlText = useDocumentStore((s) => s.yamlText);
  const applyValidParse = useDocumentStore((s) => s.applyValidParse);
  const applyParseError = useDocumentStore((s) => s.applyParseError);

  useEffect(() => {
    const handle = setTimeout(() => {
      const result = parseLiveYaml(yamlText);
      if (result.ok) applyValidParse(result.value.tree, result.value.doc);
      else applyParseError(result.error);
    }, delayMs);
    return () => clearTimeout(handle);
  }, [yamlText, delayMs, applyValidParse, applyParseError]);
}
