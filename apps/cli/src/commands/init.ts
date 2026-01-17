import { existsSync, writeFileSync } from 'node:fs';
import { generateExampleConfig } from '@work-chronicler/core';
import { Command } from 'commander';

const ENV_EXAMPLE_CONTENT = `# work-chronicler environment variables
# Fill in your API tokens below

# GitHub Personal Access Token
# Create at: https://github.com/settings/tokens
# Required scopes: repo (or public_repo for public repos only)
GITHUB_TOKEN=

# JIRA API Token
# Create at: https://id.atlassian.com/manage-profile/security/api-tokens
JIRA_TOKEN=
`;

export const initCommand = new Command('init')
  .description('Create configuration files (.env and work-chronicler.yaml)')
  .option('-f, --force', 'Overwrite existing files')
  .action(async (options) => {
    const configPath = 'work-chronicler.yaml';
    const envPath = '.env';
    const createdFiles: string[] = [];

    // Create work-chronicler.yaml
    if (existsSync(configPath) && !options.force) {
      console.log(
        `Skipping ${configPath} (already exists, use --force to overwrite)`,
      );
    } else {
      const content = generateExampleConfig();
      writeFileSync(configPath, content, 'utf-8');
      createdFiles.push(configPath);
    }

    // Create .env
    if (existsSync(envPath) && !options.force) {
      console.log(
        `Skipping ${envPath} (already exists, use --force to overwrite)`,
      );
    } else {
      writeFileSync(envPath, ENV_EXAMPLE_CONTENT, 'utf-8');
      createdFiles.push(envPath);
    }

    if (createdFiles.length > 0) {
      console.log(`\nCreated: ${createdFiles.join(', ')}`);
    }

    console.log('\nNext steps:');
    console.log('1. Add your API tokens to .env');
    console.log(
      '2. Edit work-chronicler.yaml with your GitHub username and orgs',
    );
    console.log('3. Run: work-chronicler fetch:all');
  });
