// Strip emoji sequences without removing ordinary numbers, accents, or punctuation.
export function withoutEmoji(value) {
  return String(value ?? '')
    .replace(/[#*0-9]\uFE0F?\u20E3/gu, '')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0E\uFE0F\u{E0020}-\u{E007F}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export function cleanPlanText(plan) {
  const clean = { ...plan, emoji: '' } // Keep older Messages clients compatible.
  for (const key of ['title', 'detail', 'location', 'rationale', 'time']) {
    if (typeof clean[key] === 'string') clean[key] = withoutEmoji(clean[key])
  }
  return clean
}
