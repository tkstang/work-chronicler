// Types
export {
  type GlobalConfig,
  GlobalConfigSchema,
  ProfileNameSchema,
} from './types';

// Resolver utilities
export {
  getWorkspaceRoot,
  isWorkspaceMode,
  getProfilesDir,
  getProfileDir,
  getProfileConfigPath,
  getProfileEnvPath,
  getWorkLogDir,
  getAnalysisDir,
  getOutputsDir,
  getGlobalConfigPath,
  ensureWorkspaceRoot,
  ensureProfileDirs,
  profileExists,
} from './resolver';

// Global config
export {
  loadGlobalConfig,
  saveGlobalConfig,
  getActiveProfile,
  setActiveProfile,
} from './global-config';

// Profile manager
export {
  validateProfileName,
  listProfiles,
  createProfile,
  deleteProfile,
  loadProfileConfig,
  saveProfileConfig,
  saveProfileEnv,
  initializeWorkspaceWithProfile,
} from './profile-manager';
