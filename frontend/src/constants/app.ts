// Application constants - Single source of truth for project-wide values
export const APP_CONFIG = {
  // Application Info
  NAME: 'CONMAN',
  VERSION: '1.2.0',
  BUILD: 'v1.2.0',
  FULL_VERSION: 'CONMAN v1.2.0',
  
  // Official Links & Support
  GITHUB_URL: 'https://github.com/deziss/conman',
  DOCS_URL: 'https://github.com/deziss/conman/tree/main/docs',
  SUPPORT_URL: 'https://github.com/deziss/conman/issues',
  UPDATES_URL: 'https://github.com/deziss/conman/releases',
  CONTACT_EMAIL: 'support@deziss.com',
  COMMUNITY_URL: 'https://github.com/deziss/conman/discussions',
  
  // Branding
  AUTHOR: 'Deziss',
  TAGLINE: 'Next-Generation Docker Container Manager',
} as const;

export const APP_NAME = APP_CONFIG.NAME;
export const APP_VERSION = APP_CONFIG.VERSION;
