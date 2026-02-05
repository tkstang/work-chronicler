/**
 * Report utility functions for manager mode
 */

/**
 * Generate report ID from name (kebab-case)
 *
 * @param name - Report display name (e.g., "Alice Smith")
 * @returns Kebab-case ID (e.g., "alice-smith")
 *
 * @example
 * generateReportId('Alice Smith') // 'alice-smith'
 * generateReportId("Carol O'Brien") // 'carol-obrien'
 */
export function generateReportId(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      // Remove special chars except spaces and hyphens
      .replace(/[^a-z0-9\s-]/g, '')
      // Replace spaces with hyphens
      .replace(/\s+/g, '-')
      // Collapse multiple hyphens
      .replace(/-+/g, '-')
      // Remove leading/trailing hyphens
      .replace(/^-|-$/g, '')
  );
}

/**
 * Parse report ID back to possible name (for display fallback)
 *
 * @param id - Report ID (e.g., "alice-smith")
 * @returns Capitalized name (e.g., "Alice Smith")
 *
 * @example
 * parseReportId('alice-smith') // 'Alice Smith'
 * parseReportId('mary-jane-watson') // 'Mary Jane Watson'
 */
export function parseReportId(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validate report name
 *
 * @param name - Report name to validate
 * @returns True if valid
 *
 * @example
 * validateReportName('Alice Smith') // true
 * validateReportName('   ') // false
 * validateReportName('!!!') // false
 */
export function validateReportName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;

  // Must have at least one letter or number
  return /[a-zA-Z0-9]/.test(trimmed);
}
