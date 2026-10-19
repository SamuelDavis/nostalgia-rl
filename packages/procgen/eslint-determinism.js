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
const WHY = "is approximated per engine; peers must reproduce generation bit-identically";

export const determinismRules = {
  "no-restricted-properties": [
    "error",
    ...APPROXIMATED_MATH.map((property) => ({ object: "Math", property, message: `Math.${property} ${WHY}` })),
  ],
  "no-restricted-syntax": [
    "error",
    { selector: "BinaryExpression[operator='**']", message: `** ${WHY}` },
    { selector: "AssignmentExpression[operator='**=']", message: `**= ${WHY}` },
  ],
};
