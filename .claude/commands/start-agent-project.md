# Start Agent Project

Initializes a new agent project with a structured workflow for discovery, planning, and implementation.

## Instructions

### Step 1: Gather Project Name
Ask the user for a descriptive project name using kebab-case (e.g., `user-authentication-refactor`, `api-rate-limiting`).

### Step 2: Create Project Scaffolding
Once you have the project name, run the scaffolding script:

```bash
tsx .agents/scripts/new-agent-project.ts <project-name>
```

This creates:
- `.agents/projects/<project-name>/discovery.md` - Requirements gathering
- `.agents/projects/<project-name>/planning.md` - Project planning
- `.agents/projects/<project-name>/implementation.md` - Implementation tracking

### Step 3: Begin Discovery Phase
Open `discovery.md` and gather information:

1. **Project Overview**: What is this project trying to accomplish?
2. **Functional Requirements**: What should it do?
3. **Non-Functional Requirements**: Performance, security, scalability considerations
4. **Constraints**: Technical limitations, dependencies, deadlines
5. **Questions**: What needs clarification before planning?
6. **Alignment**: Confirm understanding with the user

### Step 4: Transition to Planning
Once discovery is complete:
- Update discovery.md status to "✅ Discovery complete"
- Move to `planning.md` to create a detailed implementation plan
- Collaborate with the user to refine the plan

### Step 5: Track Implementation
During development:
- Use `implementation.md` to log progress, decisions, and challenges
- Document code changes and rationale
- Note any deviations from the plan
- Keep detailed notes for PR description creation later

## Key Principles
- **Discovery First**: Always start by understanding requirements fully
- **Iterative**: Collaborate with the user at each phase
- **Documentation**: Keep detailed notes for context across sessions
- **Flexibility**: Adapt the workflow as needed for the specific project
