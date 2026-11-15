export function estimateTokens(text: string): number {
  if (!text) return 0;
  let cjkCount = 0;
  let asciiCount = 0;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3000 && code <= 0x303f) ||
      (code >= 0xff00 && code <= 0xffef)
    ) {
      cjkCount += 1;
    } else {
      asciiCount += 1;
    }
  }

  // Empirical calibration for code + CJK prompts: ~0.65 tok/CJK char, ~0.28 tok/ASCII char
  return Math.max(1, Math.ceil(cjkCount * 0.68 + asciiCount * 0.28));
}

export function computeStableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function truncateToTokenBudget(
  text: string,
  maxTokens: number,
  marker = '\n... [budget-pruned]',
): {text: string; tokens: number; pruned: boolean} {
  const initialTokens = estimateTokens(text);
  if (initialTokens <= maxTokens) {
    return {text, tokens: initialTokens, pruned: false};
  }

  const markerTokens = estimateTokens(marker);
  const targetTokens = Math.max(0, maxTokens - markerTokens);
  if (targetTokens <= 0) {
    const clipped = marker.trim();
    return {
      text: clipped,
      tokens: estimateTokens(clipped),
      pruned: true,
    };
  }

  const lines = text.split('\n');
  const kept: string[] = [];
  let currentTokens = 0;

  for (const line of lines) {
    const lineTokens = estimateTokens(line + '\n');
    if (currentTokens + lineTokens > targetTokens) {
      break;
    }
    kept.push(line);
    currentTokens += lineTokens;
  }

  if (kept.length === 0 && lines.length > 0) {
    // Line itself exceeds budget; slice characters deterministically
    const approxChars = Math.max(12, Math.floor(targetTokens * 2.8));
    const sliced = lines[0].slice(0, approxChars) + marker;
    return {
      text: sliced,
      tokens: estimateTokens(sliced),
      pruned: true,
    };
  }

  const result = kept.join('\n') + marker;
  return {
    text: result,
    tokens: estimateTokens(result),
    pruned: true,
  };
}
