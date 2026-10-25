const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXTENDED = "^{}\\[~]|€\f"

export interface SmsLength {
  encoding: "GSM-7" | "Unicode"
  /** Characters as the carrier counts them: an extended GSM character or an emoji takes two. */
  units: number
  segments: number
  /** Units left in the current segment. */
  remaining: number
}

/** Bangla and most emoji force Unicode, which fits 70 units in one text and 67 in each part of a longer one. */
export function smsLength(text: string): SmsLength {
  let gsmUnits = 0
  let gsm = true
  for (const char of text) {
    if (GSM_BASIC.includes(char)) gsmUnits += 1
    else if (GSM_EXTENDED.includes(char)) gsmUnits += 2
    else {
      gsm = false
      break
    }
  }
  const encoding = gsm ? "GSM-7" : "Unicode"
  const units = gsm ? gsmUnits : text.length
  const single = gsm ? 160 : 70
  const part = gsm ? 153 : 67
  if (units === 0) return { encoding, units, segments: 0, remaining: single }
  if (units <= single) return { encoding, units, segments: 1, remaining: single - units }
  const segments = Math.ceil(units / part)
  return { encoding, units, segments, remaining: segments * part - units }
}
