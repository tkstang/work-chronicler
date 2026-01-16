# Agent Instructions

This document provides guidance for creating and managing AI agent rules across different platforms.

## Agent Project Structure

This project supports multiple AI coding assistants through a structured approach:

- `.agents/` - Agent-agnostic documentation and project structure
- `.cursor/` - Cursor-specific configuration and rules
- `agents.md` - New format for agent instructions (future implementation)
- `CLAUDE.md` - Claude-specific instructions (gitignored, opt-in by copying from example or use your own)
- `CLAUDE.example.md` - Example Claude instructions generated from Cursor rules
- Various agent-specific files as needed (e.g., GitHub Copilot, Codeium configurations)

## Agent-Agnostic Project Structure

The `.agents/` directory contains documentation that works with any AI coding assistant (Cursor, GitHub Copilot, Claude, etc.):

- `.agents/projects/` - Personal project documentation (gitignored)
- `.agents/rules/` - Future location for agent-agnostic rules that can be synced to agent-specific instruction files
- `.agents/README.md` - This documentation file

### Projects Directory Structure

The `.agents/projects/` directory supports two organizational approaches:

#### Option 1: Project-Specific Directories
For complex features or multi-session development work:

```
.agents/projects/
├── keep.md
├── user-authentication-refactor/
│   ├── discovery.md
│   ├── planning.md
│   ├── implementation.md
│   └── pr-description.md
└── api-rate-limiting/
    ├── discovery.md
    ├── planning.md
    ├── implementation.md
    └── pr-description.md
```

#### Option 2: Standalone PR Descriptions
For quick fixes, small changes, or one-off improvements:

```
.agents/projects/
├── keep.md
├── pr-descriptions/
│   ├── keep.md
│   ├── quick-bug-fix.md
│   ├── JIRA-1234.md
│   └── hotfix-security-patch.md
```

### Creating a New Project

Use the scaffolding script to quickly set up a new agent project from the project root:

```bash
tsx .agents/scripts/new-agent-project.ts <project-name>
```

Or use the `/start-project-prompt` command in Cursor to have the AI assistant guide you through the process.

This creates a new directory in `.agents/projects/<project-name>/` with three files:
- `discovery.md` - Requirements gathering and alignment
- `planning.md` - Detailed implementation planning
- `implementation.md` - Progress tracking and documentation

### Typical Development Workflow

1. **Discovery Phase** (`discovery.md`)
   - Gather and document project requirements
   - Ask clarifying questions and identify constraints
   - Understand functional and non-functional requirements
   - Confirm alignment with stakeholders before planning

2. **Planning Phase** (`planning.md`)
   - Outline project requirements and approach
   - Collaborate with AI assistant to refine the plan
   - Reference existing codebase patterns and constraints
   - Document architectural decisions and alternatives considered

3. **Implementation Phase** (`implementation.md`)
   - Track progress and decisions made during development
   - Document code changes and rationale
   - Note any deviations from the original plan
   - Record challenges encountered and solutions found
   - Maintain detailed notes to serve as reference for PR description

4. **PR Creation Phase** (`pr-description.md` or standalone file)
   - Review implementation.md for comprehensive context
   - Reference planning and discovery docs to understand project catalyst
   - Create comprehensive PR description for GitHub
   - Include testing notes and deployment considerations
   - Use the PR Description Rules for guidance on structure and placement
   - Use the `/create-pr` Cursor command to guide PR creation workflow

### Benefits of This Approach

- **Continuity**: Maintain context across coding sessions
- **AI Collaboration**: Assistants can reference previous decisions and context
- **Personal Documentation**: Keep working notes private to your local machine (if/once you're ready to create finalized documentation for the team, use the MkDocs app and reference these files)
- **PR Quality**: Rich context for creating comprehensive PR descriptions
- **Agent Agnostic**: Works with any AI coding assistant


## Creating Cursor Rules

Cursor rules are stored in `.cursor/rules/` directory as `.mdc` files with front matter:

```markdown
---
description: Brief description of the rule
globs: file/pattern/to/match/**/*.ext
alwaysApply: false
---

# Rule Title

Rule content in markdown format...
```

### Front Matter Options:
- `description`: Brief explanation of what the rule does
- `globs`: File patterns where this rule applies (comma-separated for multiple patterns)
- `alwaysApply`: Set to `true` if rule should always be active, `false` if context-dependent

### Best Practices:
- Use descriptive filenames (e.g., `pr-description-rules.mdc`)
- Include clear examples and use cases
- Specify appropriate glob patterns to target relevant files
- Document when to use vs. when not to use the rule

## Creating Claude Markdown Rules

Claude rules are stored in `CLAUDE.md` file in the project root. They use a simpler format without front matter:

```markdown
# Rule Title

Rule content in markdown format...
```

### Example File and Opt-in Approach

This project includes `CLAUDE.example.md` as a reference template generated from the Cursor rules using the conversion tool. The actual `CLAUDE.md` file is gitignored to make it opt-in - it won't automatically appear in your codebase.

To use Claude instructions, you can:

1. Copy `CLAUDE.example.md` to `CLAUDE.md` to use the converted rules
2. Use the example as a starting point and customize `CLAUDE.md` for your needs
3. Create your own `CLAUDE.md` from scratch

This opt-in approach ensures developers only get Claude instructions if they explicitly want them.

## Converting Cursor Rules to Claude Rules

Use the `cursor-rules-to-claude` tool to convert Cursor rules to Claude format:

```bash
npx cursor-rules-to-claude [options]

Options:
  --overwrite        Overwrite CLAUDE.md instead of appending (default: false)
  --rules-dir <dir>  Cursor rules directory (default: ".cursor/rules")
  --output <file>    Output file (default: "CLAUDE.md")
  --help             Display help
  --version          Display version
```

### Examples:

```bash
# Convert all rules and append to CLAUDE.md
npx cursor-rules-to-claude

# Overwrite CLAUDE.md with converted rules
npx cursor-rules-to-claude --overwrite

# Generate the example file (how CLAUDE.example.md was created)
npx cursor-rules-to-claude --output CLAUDE.example.md --overwrite

# Convert rules from custom directory
npx cursor-rules-to-claude --rules-dir .agents/rules

# Output to custom file
npx cursor-rules-to-claude --output AI-INSTRUCTIONS.md
```

### Using the Example File:

```bash
# Copy example to create your own CLAUDE.md
cp CLAUDE.example.md CLAUDE.md

# Or customize it as needed for your workflow
```
