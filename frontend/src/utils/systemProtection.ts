/**
 * System Protection utilities for Conman infrastructure.
 * Protects Conman core server, agent, and database containers/images
 * from being deleted or disrupted from within the panel itself.
 */

export const isConmanSystemContainer = (name: string = '', image: string = ''): boolean => {
  const cleanName = name.replace(/^\//, '').toLowerCase();
  if (
    cleanName.startsWith('conman-') ||
    cleanName === 'conman' ||
    cleanName.startsWith('conman_')
  ) {
    return true;
  }

  const cleanImage = image.toLowerCase();
  return (
    cleanImage.includes('conman-server') ||
    cleanImage.includes('conman-agent') ||
    cleanImage.includes('conman-backend') ||
    cleanImage.includes('conman-frontend') ||
    cleanImage.includes('conman-local-agent') ||
    cleanImage.startsWith('conman:') ||
    cleanImage.startsWith('conman/')
  );
};

export const isConmanSystemImage = (repoTags: string[] = [], imageId: string = ''): boolean => {
  if (repoTags && repoTags.length > 0) {
    for (const tag of repoTags) {
      const cleanTag = tag.toLowerCase();
      if (
        cleanTag.startsWith('conman-server') ||
        cleanTag.startsWith('conman-agent') ||
        cleanTag.startsWith('conman-backend') ||
        cleanTag.startsWith('conman-frontend') ||
        cleanTag.startsWith('conman-local-agent') ||
        cleanTag.startsWith('conman:') ||
        cleanTag.startsWith('conman/') ||
        cleanTag === 'conman'
      ) {
        return true;
      }
    }
  }

  const cleanId = imageId.toLowerCase();
  return (
    cleanId.includes('conman-server') ||
    cleanId.includes('conman-agent') ||
    cleanId.includes('conman-backend') ||
    cleanId.includes('conman-frontend')
  );
};
