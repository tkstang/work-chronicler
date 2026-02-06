import { describe, expect, it } from 'vitest';
import {
  getReportAnalysisDir,
  getReportOutputsDir,
  getReportWorkLogDir,
  isManagerMode,
} from '../../../src/core/workspace/resolver';

describe('resolver - manager mode', () => {
  describe('getReportWorkLogDir', () => {
    it('resolves to report subdirectory', () => {
      const path = getReportWorkLogDir('manager', 'alice-smith');
      expect(path).toContain('profiles/manager/reports/alice-smith/work-log');
    });

    it('throws error if report not provided in manager mode', () => {
      expect(() => getReportWorkLogDir('manager', '')).toThrow(
        'Report ID required',
      );
    });
  });

  describe('getReportAnalysisDir', () => {
    it('resolves to report analysis subdirectory', () => {
      const path = getReportAnalysisDir('manager', 'alice-smith');
      expect(path).toContain('profiles/manager/reports/alice-smith/analysis');
    });

    it('returns profile-level analysis when no report ID provided', () => {
      const path = getReportAnalysisDir('manager', '');
      expect(path).toContain('profiles/manager/analysis');
      expect(path).not.toContain('/reports/');
    });
  });

  describe('getReportOutputsDir', () => {
    it('resolves to report outputs subdirectory', () => {
      const path = getReportOutputsDir('manager', 'alice-smith');
      expect(path).toContain('profiles/manager/reports/alice-smith/outputs');
    });

    it('returns profile-level outputs when no report ID provided', () => {
      const path = getReportOutputsDir('manager', '');
      expect(path).toContain('profiles/manager/outputs');
      expect(path).not.toContain('/reports/');
    });
  });

  describe('isManagerMode', () => {
    it('returns true for manager profile', () => {
      expect(isManagerMode('manager')).toBe(true);
    });

    it('returns false for IC profiles', () => {
      expect(isManagerMode('alice')).toBe(false);
      expect(isManagerMode('default')).toBe(false);
    });
  });
});
