# new-second-stripe - Project Configuration

<!-- TEMPLATE_VERSION: 2025.01 -->
<!-- DO NOT REMOVE: Version tag used for auto-updates -->

This project inherits global rules from `~/.Codex/AGENTS.md`.

## Project-Specific Rules

<!-- Add project-specific rules below -->
<!-- Examples:
- Use specific coding conventions
- Reference project-specific tech stack
- Define project boundaries
-->

## Tech Stack

<!-- Uncomment and fill in relevant sections -->
<!--
- **Framework**:
- **Language**:
- **Database**:
- **Auth**:
- **Testing**:
-->

## Workflow Rules (Auto-Applied)

### Before Starting Any Implementation Task

**Step 1: Assess Scale**

| Scale | Signals | Files | Action |
|-------|---------|-------|--------|
| Quick | "fix", "bug", "typo", "update" | 1-3 | Skip to implementation |
| Standard | "feature", "add", "implement" | 4-15 | Create Control Manifest |
| Enterprise | "system", "migrate", "redesign" | 15+ | Full project docs |

**Step 2: Based on Scale**

- **Quick**: Implement directly, add test if applicable, quick review
- **Standard**:
  1. Check for Control Manifest at `.Codex/manifests/[feature].md`
  2. Create if missing using `/manifest <feature>`
  3. Follow constraints defined in manifest
- **Enterprise**:
  1. Ensure `.Codex/docs/` exists with PRD + Architecture
  2. Use `/init-docs` if missing
  3. Break work into epics/stories with Control Manifests each

**Step 3: Before Handoff Between Agents**

- Commit current work with descriptive message
- Include commit hash in handoff message
- Reference Control Manifest if exists
- Update manifest with any deviations

## Available Commands

| Command | Purpose |
|---------|---------|
| `/start <task>` | Structured task initiation with scale assessment |
| `/manifest <feature>` | Create Control Manifest for a feature |
| `/init-docs <project>` | Initialize enterprise project docs |
| `/dev/new-feature` | Scaffold a new feature |
| `/dev/refactor` | Refactor code with Boy Scout Rule |
| `/qa/test` | Generate tests (unit/integration) |
| `/review/pr` | Review a pull request |
| `/security/audit` | Security audit against OWASP |

## Project Structure

```
.Codex/
├── AGENTS.md          # This file (project rules)
├── manifests/         # Control Manifests for features
│   └── [feature].md   # Pre-implementation constraints
└── docs/              # Project documentation (Enterprise scale)
    ├── PRD.md         # Product Requirements Document
    ├── ARCHITECTURE.md # System architecture
    ├── ADR/           # Architecture Decision Records
    │   └── NNN-title.md
    └── stories/       # User stories/tasks
        └── EPIC-N/
            └── story-N.md
```

## Exclusion Zones

<!-- List files/directories that should NOT be modified -->
<!--
- `src/core/legacy/` - Legacy code, do not touch
- `config/production.ts` - Production config, requires approval
-->

## Notes

<!-- Project-specific notes, gotchas, or context -->
