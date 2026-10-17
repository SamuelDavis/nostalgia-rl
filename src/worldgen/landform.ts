import { type Spline, evaluateSpline, smoothstep, splineOver } from "../lib";

export interface Landform {
  readonly continentalness: number;
  readonly erosion: number;
  readonly peaksAndValleys: number;
}

export const peaksAndValleys = (ridges: number): number => Math.max(-1, 1 - 3 * Math.abs(ridges));

const overContinentalness = splineOver<Landform>((l) => l.continentalness);
const overErosion = splineOver<Landform>((l) => l.erosion);
const overPeaksAndValleys = splineOver<Landform>((l) => l.peaksAndValleys);

const ridged = (valley: number, middle: number, peak: number, scale: number): Spline<Landform> =>
  overPeaksAndValleys([
    [-1, valley * scale, ((middle - valley) * scale) / 2],
    [0, middle * scale, ((peak - valley) * scale) / 2],
    [1, peak * scale, ((peak - middle) * scale) / 2],
  ]);

const plateau = (scale: number): Spline<Landform> =>
  overPeaksAndValleys([
    [-1, 0.1 * scale, 0.5 * scale],
    [-0.4, 0.4 * scale, 0],
    [0.4, 0.4 * scale, 0],
    [1, 0.5 * scale, 0.2 * scale],
  ]);

const inland = (scale: number): Spline<Landform> =>
  overErosion([
    [-0.85, ridged(0.25, 0.75, 1.25, scale), 0],
    [-0.7, ridged(0.2, 0.6, 1.0, scale), 0],
    [-0.4, ridged(0.15, 0.5, 0.85, scale), 0],
    [-0.35, plateau(scale), 0],
    [-0.2, ridged(0.05, 0.14, 0.25, scale), 0],
    [0.05, ridged(0.04, 0.09, 0.15, scale), 0],
    [0.45, ridged(0.04, 0.07, 0.1, scale), 0],
    [0.7, ridged(0.03, 0.05, 0.06, scale), 0],
  ]);

const OFFSET: Spline<Landform> = overContinentalness([
  [-1, -0.45, 0],
  [-0.455, -0.3, 0],
  [-0.19, -0.15, 0],
  [-0.11, 0, 0],
  [0.03, inland(0.6), 0],
  [0.3, inland(1), 0],
  [1, inland(1.2), 0],
]);

export const terrainOffset = (landform: Landform): number => evaluateSpline(OFFSET, landform);

export const inlandness = ({ continentalness }: Landform): number => smoothstep(-0.11, 0.1, continentalness);

export const ruggedness = (landform: Landform): number =>
  inlandness(landform) * smoothstep(-0.3, -0.55, landform.erosion);

export const jaggedness = (landform: Landform): number =>
  ruggedness(landform) * smoothstep(0.45, 0.75, landform.peaksAndValleys);
