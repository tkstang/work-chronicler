# Create PR Description

Use the cursor rule at `.cursor/rules/pr-description-rules.mdc` for this task.

## Parameters

These parameters may be provided directly as arguments to the command, for example:
```
/create-pr gitsha <abc123> jira <BOARD-1234> detail <minimum|moderate|maximum>
```

- **Git SHA** (`gitsha`): The commit SHA to analyze (e.g., for `git diff`)
- **Jira Ticket** (`jira`): The relevant Jira ticket identifier (e.g., `BOARD-1234`)
- **Detail Level** (`detail`): Level of description requested (`minimum`, `moderate`, or `maximum`)

## Instructions

Follow the PR Description Creation Rules to create a comprehensive PR description document.

If the git SHA parameter is provided, run `git diff {{ gitsha }}` to analyze the changes and assess complexity.

If the Jira ticket parameter is provided, use it when creating the PR description. Otherwise, ask the user if they have a Jira ticket to reference.

Follow all steps outlined in the PR description rules, including:
1. Asking for file location (standalone vs project-specific)
2. Asking for filename
3. Asking if there are additional reference materials useful for generating the PR description
4. Determining detail level (minimum/moderate/maximum) - ask if a detail parameter is not provided
5. Analyzing changes if git SHA provided
6. Recommending structure (standard template vs expanded)
7. Creating the complete PR description document
