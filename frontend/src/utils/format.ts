/**
 * Formats bytes into a human-readable string (B, KB, MB, GB)
 */
export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    // Fixed precision: 0 decimal for bytes, 1 decimal for others
    return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
};
