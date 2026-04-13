// Application constants - Single source of truth for project-wide values
export const APP_CONFIG = {
  // Application Info
  NAME: 'CONMAN',
  VERSION: '1.1.0',
  FULL_VERSION: 'CONMAN v1.1.0',
  
  // Support Links
  HELP_URL: 'https://github.com/conman/docs',
  SUPPORT_URL: 'https://github.com/conman/support',
  CONTACT_EMAIL: 'support@conman.io',
  
  // Branding
  TAGLINE: 'Container Management Platform',
} as const;

// Export individual values for convenience
export const APP_NAME = APP_CONFIG.NAME;
export const APP_VERSION = APP_CONFIG.VERSION;
