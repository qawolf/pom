import { pomRuleModules, pomRuleSeverities } from "./index.js";

// The published surface: consumers enable by the id in pomRuleSeverities and
// register the module under the same id in pomRuleModules.
it("exposes each rule under its scoped id, with its severity", () => {
  const ruleId = "@qawolf/pom/no-inline-locator-in-page-object";

  expect(Object.keys(pomRuleModules)).toContain(ruleId);
  expect(pomRuleSeverities[ruleId]).toBe("warn");
});
