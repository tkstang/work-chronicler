#!/usr/bin/env tsx

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';

interface CreateProjectOptions {
  projectName: string;
}

/**
 * Creates a new agent project directory with scaffolded documentation files.
 */
async function createProject({
  projectName,
}: CreateProjectOptions): Promise<void> {
  if (!projectName) {
    console.error('Error: Project name is required');
    console.log('Usage: tsx new-agent-project.ts <project-name>');
    process.exit(1);
  }

  // Validate project name (basic check for safe directory names)
  if (!/^[a-z0-9-_]+$/i.test(projectName)) {
    console.error(
      'Error: Project name should only contain letters, numbers, hyphens, and underscores',
    );
    process.exit(1);
  }

  const projectsDir = join(cwd(), '.agents', 'projects');
  const projectDir = join(projectsDir, projectName);

  try {
    // Create project directory
    await mkdir(projectDir, { recursive: true });
    console.log(
      `✓ Created project directory: .agents/projects/${projectName}/`,
    );

    // Create discovery.md
    const discoveryContent = `# ${projectName} - Discovery

## Project Overview

<!-- Brief description of what this project aims to accomplish -->

## Requirements Gathering

### Functional Requirements

<!-- What should this project do? -->

### Non-Functional Requirements

<!-- Performance, security, scalability, maintainability considerations -->

### Constraints

<!-- Technical constraints, dependencies, limitations -->

## Questions and Clarifications

<!-- Open questions that need answers before planning -->

## Alignment Check

<!-- Confirm understanding with stakeholders/team -->

---

**Status**: 🔍 Discovery in progress
**Next Step**: Complete discovery, then move to planning phase
`;

    await writeFile(join(projectDir, 'discovery.md'), discoveryContent);
    console.log(`✓ Created discovery.md`);

    // Create planning.md
    const planningContent = `# ${projectName} - Planning

## Approach

<!-- High-level approach to implementing this project -->

## Architecture Decisions

### Decision 1

**Context**: <!-- What is the issue we're addressing? -->

**Decision**: <!-- What did we decide? -->

**Rationale**: <!-- Why did we make this decision? -->

**Alternatives Considered**: <!-- What other options did we consider? -->

## Implementation Plan

### Phase 1: <!-- Phase name -->

- [ ] Task 1
- [ ] Task 2

### Phase 2: <!-- Phase name -->

- [ ] Task 1
- [ ] Task 2

## Risks and Mitigations

<!-- Potential risks and how we'll address them -->

## Testing Strategy

<!-- How will we verify this works correctly? -->

## Deployment Considerations

<!-- Any special deployment requirements or considerations -->

---

**Status**: 📋 Planning in progress
**Next Step**: Finalize plan, then move to implementation phase
`;

    await writeFile(join(projectDir, 'planning.md'), planningContent);
    console.log(`✓ Created planning.md`);

    // Create implementation.md
    const implementationContent = `# ${projectName} - Implementation

## Implementation Log

<!-- Track progress and decisions made during development -->

### Session 1 - [Date]

**Goals**:
-

**Completed**:
-

**Decisions Made**:
-

**Challenges**:
-

**Next Steps**:
-

---

## Code Changes

### Files Modified

<!-- List of files changed with brief descriptions -->

### Key Implementation Details

<!-- Important implementation notes and rationale -->

## Deviations from Plan

<!-- Any changes from the original plan and why -->

## Testing Notes

<!-- Testing performed and results -->

## Documentation Updates Needed

<!-- What documentation should be created/updated -->

---

**Status**: 🚧 Implementation in progress
**Next Step**: Complete implementation, then create PR description
`;

    await writeFile(
      join(projectDir, 'implementation.md'),
      implementationContent,
    );
    console.log(`✓ Created implementation.md`);

    console.log('\n✨ Project scaffolding complete!');
    console.log(`\nNext steps:`);
    console.log(`1. Open .agents/projects/${projectName}/discovery.md`);
    console.log(`2. Start gathering requirements and asking questions`);
    console.log(`3. Once discovery is complete, move to planning.md`);
    console.log(
      `4. After planning is finalized, track implementation in implementation.md`,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error creating project:', error.message);
    } else {
      console.error('Error creating project:', error);
    }
    process.exit(1);
  }
}

// Get project name from command line arguments
const projectName = process.argv[2];

createProject({ projectName });
