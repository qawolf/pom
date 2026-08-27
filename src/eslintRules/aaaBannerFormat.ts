import type { Comment } from "estree";

import { isFlowModule } from "./flowModules.js";
import { testStep } from "./testAaaComments.js";
import type { PomLintRule } from "./types.js";

/**
 * The Arrange / Act / Assert markers are three-line banners.
 *
 * ```ts
 * // Reported
 * // ARRANGE
 * // arrange:
 * // Arrange:            (no dividers)
 *
 * // Expected
 * //--------------------------------
 * // Arrange:
 * //--------------------------------
 * ```
 *
 * A divider is exactly 32 dashes. Only line comments inside a step body are
 * looked at; `test-aaa-comments` checks that the sections are there at all.
 */
export const aaaBannerFormatRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        CallExpression(node) {
          const step = testStep(node);
          if (!step) return;

          const [start, end] = step.body.range ?? [0, 0];
          const comments = context.sourceCode
            .getAllComments()
            .filter((comment) => {
              const [from, to] = comment.range ?? [-1, -1];
              return comment.type === "Line" && from >= start && to <= end;
            });

          comments.forEach((comment, index) => {
            const text = comment.value.trim();

            const banner = text.match(bannerLabel);
            if (banner) {
              const above = comments[index - 1];
              const below = comments[index + 1];
              if (!isDivider(above) || !isDivider(below)) {
                context.report({
                  data: { label: banner[1] ?? "" },
                  loc: comment.loc ?? { column: 0, line: 1 },
                  messageId: "missingDividers",
                });
                return;
              }

              for (const divider of [above, below]) {
                const count = divider?.value.trim().length ?? 0;
                if (count !== dividerLength) {
                  context.report({
                    data: { count: String(count) },
                    loc: divider?.loc ?? { column: 0, line: 1 },
                    messageId: "wrongDividerLength",
                  });
                }
              }
              return;
            }

            const other = text.match(anyLabel);
            if (other) {
              const label = other[1] ?? "";
              context.report({
                data: {
                  label:
                    label.charAt(0).toUpperCase() +
                    label.slice(1).toLowerCase(),
                  text,
                },
                loc: comment.loc ?? { column: 0, line: 1 },
                messageId: "wrongLabelShape",
              });
            }
          });
        },
      };
    },
    meta: {
      messages: {
        missingDividers:
          'Wrap "{{label}}:" in the banner: a line of 32 dashes above and below. The banner is what makes the section boundary visible when scrolling a long step; a bare label reads as any other comment.',
        wrongDividerLength:
          "Make the banner divider exactly 32 dashes (this one is {{count}}). The banners line up across every flow in the workspace only when they are the same width.",
        wrongLabelShape:
          'Write this marker as the three-line banner, with the label as "{{label}}:" -- title case, trailing colon -- between two lines of 32 dashes, instead of "// {{text}}".',
      },
    },
  },

  name: "aaa-banner-format",

  severity: "warn",
};

const dividerLength = 32;

/** `Arrange:` / `Act:` / `Assert:` exactly. */
const bannerLabel = /^(Arrange|Act|Assert):$/;

/** Any other casing or punctuation of the same three words, alone on a line. */
const anyLabel = /^(arrange|act|assert):?$/i;

function isDivider(comment: Comment | undefined): boolean {
  return (
    comment !== undefined &&
    comment.type === "Line" &&
    /^-+$/.test(comment.value.trim())
  );
}
