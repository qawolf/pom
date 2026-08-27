import type { Rule } from "eslint";

import { enclosingPageObject } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * No XPath and no retired selector-engine syntax in a page object's locators.
 *
 * ```ts
 * // Reported
 * this.page.locator("//button[@id='save']")
 * this.page.locator("text=Save")
 * this.page.locator("css=.form >> text=Save")
 *
 * // Expected
 * this.page.getByRole("button", { name: "Save" })
 * this.page.locator(".form").getByText("Save")
 * ```
 *
 * Only the string handed to `locator()` / `frameLocator()` is classified, so
 * nothing else that happens to contain `//` is touched. The `:text()` /
 * `:has-text()` pseudo-classes are current Playwright CSS and pass.
 */
export const noLegacySelectorsRule: PomLintRule = {
  module: {
    create(context) {
      return {
        CallExpression(node) {
          const { callee } = node;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier") return;
          if (
            callee.property.name !== "locator" &&
            callee.property.name !== "frameLocator"
          )
            return;

          const [selector] = node.arguments;
          if (!selector) return;

          for (const text of staticText(selector)) {
            const messageId = classify(text);
            if (!messageId) continue;
            if (!enclosingPageObject(node)) return;

            context.report({
              data: { text: text.trim().slice(0, 40) },
              messageId,
              node: selector,
            });
            return;
          }
        },
      };
    },
    meta: {
      messages: {
        chainCombinator:
          "Chain locators instead of `>>` in `{{text}}`: `.locator(a).locator(b)`, or `.locator(a).getByText(...)`. The `>>` engine chain is the pre-locator syntax; each link of a chained locator is its own readable step. (Migrating: rewrite only when the result targets the same element.)",
        legacyEngine:
          "Drop the engine prefix in `{{text}}`: `text=` is `getByText()`, `id=x` is `#x`, `css=` is just the selector. The prefix is the pre-locator syntax, and the locator methods are what the rest of the page object uses. (Migrating: rewrite only when the result targets the same element.)",
        xpath:
          "Replace the XPath `{{text}}` with a role, text or CSS locator. XPath is coupled to the DOM tree, so any structural change breaks it, and it cannot see into a shadow root. (Migrating: rewrite only when the result targets the same element.)",
      },
    },
  },

  name: "no-legacy-selectors",

  severity: "error",
};

type MessageId = "chainCombinator" | "legacyEngine" | "xpath";

function classify(selector: string): MessageId | undefined {
  const text = selector.trim();
  if (
    text.startsWith("//") ||
    text.startsWith("(//") ||
    text.startsWith("xpath=")
  )
    return "xpath";
  if (/^(css|text|id)=/.test(text)) return "legacyEngine";
  if (text.includes(">>")) return "chainCombinator";

  return undefined;
}

/**
 * The static parts of a selector argument: a string literal whole, or each
 * quasi of a template literal. A `${}` cannot hide an engine prefix, and a
 * `>>` or `xpath=` in any static chunk is a hit.
 */
function staticText(node: Rule.Node | { type: string }): string[] {
  if (node.type === "Literal") {
    const { value } = node as { value: unknown };
    return typeof value === "string" ? [value] : [];
  }
  if (node.type === "TemplateLiteral") {
    const { quasis } = node as {
      quasis: { value: { cooked?: null | string; raw: string } }[];
    };
    return quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw);
  }

  return [];
}
