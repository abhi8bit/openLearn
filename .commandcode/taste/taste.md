# Taste

## Workflow

- Directs implementation work from a written spec file in the repo (e.g. an `*-update.md`), rather than describing changes inline in chat. Confidence: 0.7
- Keeps this app in sync with a sibling project by handing over its newest spec file and asking for the deltas to be applied here — expects the agent to diff old vs new spec and implement only what's actually missing. Confidence: 0.55
- Wants a clear handoff of the manual steps they must perform themselves after the agent's implementation (run migrations, run sync scripts, verify with SQL checks, smoke-test), not just a changelog of edits. Confidence: 0.75
- When handoff steps involve manual ops (e.g. running SQL/migrations), expects explicit, detailed, copy-pasteable instructions: exact commands, where to run them, expected outputs/values, and a verification query per step. Confidence: 0.7
- Delegates git operations to the agent: expects it to commit the work and push to `origin/main` itself as part of finishing a task. Confidence: 0.55
