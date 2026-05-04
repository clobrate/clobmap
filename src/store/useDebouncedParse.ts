import { useEffect } from "react";
import { parseYaml } from "../model";
import { useDocumentStore } from "./document";

export function useDebouncedParse(delayMs = 150): void {
  const yamlText = useDocumentStore((s) => s.yamlText);
  const applyValidParse = useDocumentStore((s) => s.applyValidParse);
  const applyParseError = useDocumentStore((s) => s.applyParseError);

  useEffect(() => {
    const handle = setTimeout(() => {
      const result = parseYaml(yamlText);
      if (result.ok) applyValidParse(result.value);
      else applyParseError(result.error);
    }, delayMs);
    return () => clearTimeout(handle);
  }, [yamlText, delayMs, applyValidParse, applyParseError]);
}
