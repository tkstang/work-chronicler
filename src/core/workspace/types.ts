import { z } from 'zod';

/**
 * Global config schema for ~/.work-chronicler/config.json
 * This is machine-managed and should not be manually edited.
 */
export const GlobalConfigSchema = z.object({
  version: z.string().default('0.1.0'),
  activeProfile: z.string().default('default'),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

/**
 * Profile name validation
 * - alphanumeric + hyphens
 * - no spaces
 * - 1-50 characters
 */
export const ProfileNameSchema = z
  .string()
  .min(1, 'Profile name cannot be empty')
  .max(50, 'Profile name must be 50 characters or less')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-]*$/,
    'Profile name must start with alphanumeric and contain only alphanumeric characters and hyphens',
  );

export type ProfileName = z.infer<typeof ProfileNameSchema>;

/**
 * Validate a profile name
 *
 * @throws Error if profile name is invalid
 */
export function validateProfileName(name: string): void {
  const result = ProfileNameSchema.safeParse(name);
  if (!result.success) {
    throw new Error(result.error.errors[0]?.message ?? 'Invalid profile name');
  }
}
