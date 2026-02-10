/**
 * Alternassist API Client
 * Central export for all API modules
 */

export * from './client';
export * from './admin';
export * from './projects';
export * from './cues';
export * from './estimates';
export * from './invoices';
export * from './payments';
export * from './accounting';
export * from './hours';
export * from './files';
export * from './ftp';
export * from './downloads';
export * from './share';

// Re-export APIs for convenience
export { adminAPI } from './admin';
export { projectsAPI } from './projects';
export { cuesAPI } from './cues';
export { estimatesAPI } from './estimates';
export { invoicesAPI } from './invoices';
export { paymentsAPI } from './payments';
export { accountingAPI } from './accounting';
export { hoursAPI } from './hours';
export { filesAPI } from './files';
export { ftpAPI } from './ftp';
export { downloadsAPI } from './downloads';
export { shareAPI } from './share';
