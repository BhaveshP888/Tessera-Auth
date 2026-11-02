/**
 * Sanitizes and prepares a user query for SQLite FTS5 MATCH expressions.
 */
export const buildFTS5Query = (rawQuery: string): string => {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return '';
  }

  // Extract individual tokens, stripping FTS5 special control characters
  const tokens = trimmed
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return '';
  }

  // Construct prefix queries for each token: token*
  return tokens.map((token) => `"${token}"*`).join(' AND ');
};

/**
 * Returns SQL creation statement for FTS5 virtual table.
 */
export const getFTS5TableSchemaSQL = (): string => {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
      id UNINDEXED,
      url,
      title,
      description,
      notes,
      tags,
      tokenize = 'unicode61'
    );
  `;
};
