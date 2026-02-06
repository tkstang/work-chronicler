import { describe, expect, it } from 'vitest';
import {
  generateReportId,
  parseReportId,
  validateReportName,
} from '../../../src/core/workspace/report-utils';

describe('report-utils', () => {
  describe('generateReportId', () => {
    it('converts name to kebab-case', () => {
      expect(generateReportId('Alice Smith')).toBe('alice-smith');
    });

    it('handles multiple spaces', () => {
      expect(generateReportId('Bob   Jones')).toBe('bob-jones');
    });

    it('removes special characters', () => {
      expect(generateReportId("Carol O'Brien")).toBe('carol-obrien');
    });

    it('handles names with hyphens', () => {
      expect(generateReportId('Mary-Jane Watson')).toBe('mary-jane-watson');
    });

    it('handles mixed case', () => {
      expect(generateReportId('JoHn DoE')).toBe('john-doe');
    });

    it('handles trailing and leading spaces', () => {
      expect(generateReportId('  Alice Smith  ')).toBe('alice-smith');
    });

    it('handles numbers', () => {
      expect(generateReportId('User 123')).toBe('user-123');
    });
  });

  describe('parseReportId', () => {
    it('converts kebab-case to title case', () => {
      expect(parseReportId('alice-smith')).toBe('Alice Smith');
    });

    it('handles single word', () => {
      expect(parseReportId('alice')).toBe('Alice');
    });

    it('handles multiple hyphens', () => {
      expect(parseReportId('mary-jane-watson')).toBe('Mary Jane Watson');
    });
  });

  describe('validateReportName', () => {
    it('accepts valid names', () => {
      expect(validateReportName('Alice Smith')).toBe(true);
      expect(validateReportName('Bob Jones-Williams')).toBe(true);
      expect(validateReportName('User123')).toBe(true);
    });

    it('rejects empty names', () => {
      expect(validateReportName('')).toBe(false);
      expect(validateReportName('   ')).toBe(false);
    });

    it('rejects names with only special characters', () => {
      expect(validateReportName('!!!')).toBe(false);
      expect(validateReportName('---')).toBe(false);
    });

    it('accepts names with apostrophes', () => {
      expect(validateReportName("O'Brien")).toBe(true);
    });
  });
});
