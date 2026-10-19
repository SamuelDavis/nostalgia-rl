export type Spline<I> = number | SplineNode<I>;

interface SplinePoint<I> {
  readonly at: number;
  readonly value: Spline<I>;
  readonly slope: number;
}

interface SplineNode<I> {
  readonly input: (inputs: I) => number;
  readonly points: readonly SplinePoint<I>[];
}

export const splineOver =
  <I>(input: (inputs: I) => number) =>
  (points: readonly (readonly [at: number, value: Spline<I>, slope: number])[]): SplineNode<I> => ({
    input,
    points: points.map(([at, value, slope]) => ({ at, value, slope })),
  });

export const evaluateSpline = <I>(spline: Spline<I>, inputs: I): number => {
  if (typeof spline === "number") return spline;
  const { points } = spline;
  const x = spline.input(inputs);
  const first = points[0]!;
  const last = points.at(-1)!;
  if (x <= first.at) return evaluateSpline(first.value, inputs) + first.slope * (x - first.at);
  if (x >= last.at) return evaluateSpline(last.value, inputs) + last.slope * (x - last.at);
  const upper = points.findIndex((p) => p.at > x);
  const p0 = points[upper - 1]!;
  const p1 = points[upper]!;
  const span = p1.at - p0.at;
  const t = (x - p0.at) / span;
  const v0 = evaluateSpline(p0.value, inputs);
  const v1 = evaluateSpline(p1.value, inputs);
  const outgoing = p0.slope * span - (v1 - v0);
  const incoming = -p1.slope * span + (v1 - v0);
  return v0 + (v1 - v0) * t + t * (1 - t) * (outgoing + (incoming - outgoing) * t);
};
