export default {
  // TypeScript/JavaScript files: lint and format with Biome
  '*.{ts,tsx,js,jsx}': ['biome check --write --no-errors-on-unmatched'],

  // JSON files: format with Biome
  '*.json': ['biome format --write --no-errors-on-unmatched'],

  // Markdown files: format with Biome
  '*.md': ['biome format --write --no-errors-on-unmatched'],
};
