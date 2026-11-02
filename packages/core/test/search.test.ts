import { describe, expect, it } from 'bun:test';
import {
  buildFTS5Query,
  calculateTrigramSimilarity,
  fuzzyRankItems,
} from '../src/search/index.js';

describe('Search & Trigram Indexing', () => {
  it('builds sanitized prefix queries for FTS5', () => {
    const q1 = buildFTS5Query('privacy sqlite');
    expect(q1).toBe('"privacy"* AND "sqlite"*');

    const q2 = buildFTS5Query('   ');
    expect(q2).toBe('');

    const q3 = buildFTS5Query('hello (world) [test] * $');
    expect(q3).toBe('"hello"* AND "world"* AND "test"*');
  });

  it('calculates fuzzy trigram similarity accurately', () => {
    const perfect = calculateTrigramSimilarity('bookmarks', 'bookmarks');
    expect(perfect).toBe(1.0);

    const typo = calculateTrigramSimilarity('tessera', 'tesera');
    expect(typo).toBeGreaterThan(0.6);

    const completelyDifferent = calculateTrigramSimilarity('apple', 'quantum');
    expect(completelyDifferent).toBe(0.0);
  });

  it('ranks fuzzy search results by similarity score', () => {
    const items = [
      { id: '1', title: 'JavaScript Engine Internals' },
      { id: '2', title: 'Java Virtual Machine' },
      { id: '3', title: 'Cooking Recipes' },
    ];

    const results = fuzzyRankItems(items, 'javascript', (i) => i.title, 0.2);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.item.id).toBe('1');
  });

  it('instantly matches incomplete words as the user types (e.g. ro, road, sh)', () => {
    const items = [
      { id: '1', title: 'Developer Roadmaps', url: 'https://roadmap.sh' },
      { id: '2', title: 'Rust Programming Language', url: 'https://rust-lang.org' },
      { id: '3', title: 'Tailwind CSS Docs', url: 'https://tailwindcss.com' },
    ];

    // Typing "ro"
    const resultsRo = fuzzyRankItems(items, 'ro', (i) => `${i.title} ${i.url}`, 0.1);
    expect(resultsRo.length).toBeGreaterThanOrEqual(1);
    expect(resultsRo[0]?.item.id).toBe('1');

    // Typing "road"
    const resultsRoad = fuzzyRankItems(items, 'road', (i) => `${i.title} ${i.url}`, 0.1);
    expect(resultsRoad.length).toBeGreaterThanOrEqual(1);
    expect(resultsRoad[0]?.item.id).toBe('1');

    // Typing "sh"
    const resultsSh = fuzzyRankItems(items, 'sh', (i) => `${i.title} ${i.url}`, 0.1);
    expect(resultsSh.length).toBeGreaterThanOrEqual(1);
    expect(resultsSh[0]?.item.id).toBe('1');

    // Multi-token: "road sh"
    const resultsMulti = fuzzyRankItems(items, 'road sh', (i) => `${i.title} ${i.url}`, 0.1);
    expect(resultsMulti.length).toBe(1);
    expect(resultsMulti[0]?.item.id).toBe('1');
  });
});
