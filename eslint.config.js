import tseslint from "typescript-eslint";

const APPROXIMATED_MATH = [
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "exp",
  "expm1",
  "log",
  "log1p",
  "log2",
  "log10",
  "pow",
  "cbrt",
  "hypot",
  "random",
];
const DETERMINISM =
  "is approximated per engine; peers must reproduce it bit-identically (docs/worldgen.md#determinism)";

export default tseslint.config({
  files: ["src/lib/**/*.ts", "src/worldgen/**/*.ts", "src/game/**/*.ts"],
  ignores: ["**/*.test.ts", "**/*.bench.ts"],
  languageOptions: { parser: tseslint.parser },
  rules: {
    "no-restricted-properties": [
      "error",
      ...APPROXIMATED_MATH.map((property) => ({
        object: "Math",
        property,
        message: `Math.${property} ${DETERMINISM}`,
      })),
    ],
    "no-restricted-syntax": [
      "error",
      { selector: "BinaryExpression[operator='**']", message: `** ${DETERMINISM}` },
      { selector: "AssignmentExpression[operator='**=']", message: `**= ${DETERMINISM}` },
    ],
  },
});
