import { describe, it, expect } from 'vitest';
import { formatFileSize } from './format';

describe('formatFileSize', () => {
    it('formats 0 bytes correctly', () => {
        expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats bytes correctly', () => {
        expect(formatFileSize(512)).toBe('512 B');
        expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('formats kilobytes correctly', () => {
        expect(formatFileSize(1024)).toBe('1.0 KB');
        expect(formatFileSize(1536)).toBe('1.5 KB');
    });

    it('formats megabytes correctly', () => {
        expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
        expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    });

    it('formats gigabytes correctly', () => {
        expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
        expect(formatFileSize(10.2 * 1024 * 1024 * 1024)).toBe('10.2 GB');
    });
});
