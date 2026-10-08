import { countSegments } from "../hl7v2/clean";

export const segmentCount: (message: string) => number = countSegments;
