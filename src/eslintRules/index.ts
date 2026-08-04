import type { Rule } from "eslint";

import { noInlineLocatorInPageObjectRule } from "./noInlineLocatorInPageObject.js";
import type { PomLintRule } from "./types.js";

const rules: PomLintRule[] = [noInlineLocatorInPageObjectRule];

const entries = rules.map((rule) => ({
  ...rule,
  id: `@qawolf/pom/${rule.name}`,
}));

export const pomRuleModules: Record<string, Rule.RuleModule> =
  Object.fromEntries(entries.map(({ id, module }) => [id, module]));

export const pomRuleSeverities: Record<string, PomLintRule["severity"]> =
  Object.fromEntries(entries.map(({ id, severity }) => [id, severity]));
