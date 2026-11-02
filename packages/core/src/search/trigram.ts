/**
 * Extracts character trigrams from an input string.
 */
export const extractTrigrams = (input: string): Set<string> => {
  const normalized = `  ${input.toLowerCase().trim()}  `;
  const trigrams = new Set<string>();

  for (let i = 0; i <= normalized.length - 3; i++) {
    trigrams.add(normalized.substring(i, i + 3));
  }

  return trigrams;
};

/**
 * Calculates the Sørensen–Dice similarity coefficient (0.0 to 1.0) between two strings based on trigrams.
 */
export const calculateTrigramSimilarity = (a: string, b: string): number => {
  const normA = a.toLowerCase().trim();
  const normB = b.toLowerCase().trim();

  if (normA === normB) {
    return 1.0;
  }
  if (!normA || !normB) {
    return 0.0;
  }

  const triA = extractTrigrams(normA);
  const triB = extractTrigrams(normB);

  if (triA.size === 0 || triB.size === 0) {
    return 0.0;
  }

  let intersectionCount = 0;
  for (const tri of triA) {
    if (triB.has(tri)) {
      intersectionCount++;
    }
  }

  return (2 * intersectionCount) / (triA.size + triB.size);
};

/**
 * Checks if pattern is a subsequence of text (e.g., 'rm' in 'roadmap').
 */
export const isSubsequence = (pattern: string, text: string): boolean => {
  let pIdx = 0;
  let tIdx = 0;
  while (pIdx < pattern.length && tIdx < text.length) {
    if (pattern[pIdx] === text[tIdx]) {
      pIdx++;
    }
    tIdx++;
  }
  return pIdx === pattern.length;
};

/**
 * Calculates an instant search relevance score (0.0 to 1.0) between a query and a target text.
 * Handles single/partial character typing, prefixes, substrings, word boundaries, and fuzzy typos.
 */
export const calculateMatchScore = (query: string, text: string): number => {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase().trim();

  if (!q || !t) return 0.0;
  if (q === t) return 1.0;

  // 1. Exact prefix match
  if (t.startsWith(q)) {
    return 0.95;
  }

  // 2. Word boundary prefix match (e.g. query "sh" or "road" in "roadmap.sh" or "road map")
  const words = t.split(/[\s./_:-]+/);
  for (const word of words) {
    if (word.startsWith(q)) {
      return 0.90;
    }
  }

  // 3. Substring match
  const subIdx = t.indexOf(q);
  if (subIdx !== -1) {
    return Math.max(0.70, 0.85 - (subIdx / t.length) * 0.15);
  }

  // 4. Multi-token query match (e.g., "road sh")
  const queryTokens = q.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1) {
    const allTokensMatch = queryTokens.every((token) => t.includes(token));
    if (allTokensMatch) {
      return 0.75;
    }
  }

  // 5. Subsequence acronym match (for short queries like 'gh' for 'github')
  if (q.length >= 2 && q.length <= 6 && isSubsequence(q, t)) {
    return 0.50;
  }

  // 6. Trigram / Fuzzy match for typos on longer words
  if (q.length >= 3) {
    let bestWordScore = 0;
    for (const w of words) {
      if (w.length >= 3) {
        const score = calculateTrigramSimilarity(q, w);
        if (score > bestWordScore) bestWordScore = score;
      }
    }
    if (bestWordScore >= 0.4) {
      return bestWordScore * 0.65;
    }
  }

  return 0.0;
};

/**
 * Filters and ranks a list of items by search score across multiple fields.
 */
export const fuzzyRankItems = <T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  minThreshold = 0.1,
): Array<{ item: T; score: number }> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return items.map((item) => ({ item, score: 1.0 }));
  }

  return items
    .map((item) => {
      const text = getText(item);
      const score = calculateMatchScore(trimmed, text);
      return { item, score };
    })
    .filter((entry) => entry.score >= minThreshold)
    .sort((a, b) => b.score - a.score);
};
