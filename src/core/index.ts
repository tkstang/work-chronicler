// Types

export {
  findConfigPath,
  generateExampleConfig,
  getOutputDirectory,
  loadConfig,
} from '@config/loader';

// Config
export {
  type AnalysisConfig,
  AnalysisConfigSchema,
  type Config,
  ConfigSchema,
  type FetchConfig,
  type GitHubConfig,
  GitHubConfigSchema,
  type GitHubOrgConfig,
  type JiraConfig,
  JiraConfigSchema,
  type JiraInstanceConfig,
  type OutputConfig,
} from '@config/schema';
// Storage
export {
  DIRECTORIES,
  ensureDirectory,
  getAnalysisFilePath,
  getEffectiveOutputDir,
  getJiraDirectory,
  getPRDirectory,
  getPRFilePath,
  getTicketFilePath,
  type MarkdownFrontmatter,
  readAllPRs,
  readAllTickets,
  readPR,
  readTicket,
  writeMarkdownFile,
} from '@storage/index';
export {
  type JiraTicket,
  type JiraTicketFile,
  JiraTicketSchema,
  type PRImpact,
  PRImpactSchema,
  type ProjectConfidence,
  ProjectConfidenceSchema,
  type ProjectGrouping,
  ProjectGroupingSchema,
  type ProjectSignal,
  ProjectSignalSchema,
  type ProjectSignals,
  ProjectSignalsSchema,
  type ProjectsAnalysis,
  ProjectsAnalysisSchema,
  type PullRequest,
  type PullRequestFile,
  PullRequestSchema,
  type TimelineAnalysis,
  TimelineAnalysisSchema,
  type TimelineMonth,
  TimelineMonthSchema,
  type TimelinePR,
  TimelinePRSchema,
  type TimelineTicket,
  TimelineTicketSchema,
  type TimelineWeek,
  TimelineWeekSchema,
} from '@wc-types/index';

// Workspace (global config and profiles)
export {
  createProfile,
  deleteProfile,
  ensureProfileDirs,
  ensureWorkspaceRoot,
  // Types
  type GlobalConfig,
  GlobalConfigSchema,
  getActiveProfile,
  getGlobalConfigPath,
  getProfileConfigPath,
  getProfileDir,
  getProfileEnvPath,
  getProfilesDir,
  getWorkLogDir,
  // Resolver utilities
  getWorkspaceRoot,
  initializeWorkspaceWithProfile,
  isWorkspaceMode,
  listProfiles,
  // Global config
  loadGlobalConfig,
  loadProfileConfig,
  ProfileNameSchema,
  profileExists,
  saveGlobalConfig,
  saveProfileConfig,
  saveProfileEnv,
  setActiveProfile,
  // Profile manager
  validateProfileName,
} from '@workspace/index';
