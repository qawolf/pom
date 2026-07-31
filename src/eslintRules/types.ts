import type { Rule } from "eslint";

export type PomLintRule = {
  module: Rule.RuleModule;

  /** Without the `@qawolf/pom/` scope, which `index.ts` prepends. */
  name: string;

  severity: "error" | "warn";
};
