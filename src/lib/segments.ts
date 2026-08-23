/**
 * SMS character-set detection and segment estimation.
 * GSM-7: 160 chars single segment, 153 per segment when concatenated.
 * UCS-2 (Unicode, e.g. Arabic): 70 single, 67 concatenated.
 * Extended GSM chars (e.g. €, [, ]) count as 2 septets.
 *
 * This is an ESTIMATE — actual billing depends on the provider.
 */

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€";

const GSM_SET = new Set(GSM_BASIC.split(""));
const GSM_EXT_SET = new Set(GSM_EXTENDED.split(""));

export type SmsEncoding = "GSM-7" | "UCS-2";

export interface SegmentInfo {
  encoding: SmsEncoding;
  /** length in septets (GSM) or UTF-16 code units (UCS-2) */
  units: number;
  segments: number;
  /** characters remaining before another segment is added */
  remainingInSegment: number;
}

export function detectEncoding(text: string): SmsEncoding {
  for (const ch of text) {
    if (!GSM_SET.has(ch) && !GSM_EXT_SET.has(ch)) return "UCS-2";
  }
  return "GSM-7";
}

export function countSegments(text: string): SegmentInfo {
  const encoding = detectEncoding(text);

  let units = 0;
  if (encoding === "GSM-7") {
    for (const ch of text) {
      units += GSM_EXT_SET.has(ch) ? 2 : 1;
    }
  } else {
    units = text.length; // UTF-16 code units (surrogate pairs count as 2)
  }

  const single = encoding === "GSM-7" ? 160 : 70;
  const multi = encoding === "GSM-7" ? 153 : 67;

  if (units === 0) {
    return { encoding, units, segments: 0, remainingInSegment: single };
  }
  if (units <= single) {
    return { encoding, units, segments: 1, remainingInSegment: single - units };
  }
  const segments = Math.ceil(units / multi);
  return {
    encoding,
    units,
    segments,
    remainingInSegment: segments * multi - units,
  };
}
