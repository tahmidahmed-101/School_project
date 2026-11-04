# Architecture — <project>

Written before feature code. Every structural commit cites a section number.

## 1. Domain model
| Entity | Meaning | Key relations |
|---|---|---|

## 2. Tenancy / isolation
Invariants that must never be crossed:

## 3. Authorization
Who can do what:

## 4. Directory layout — where new code goes
| Path | Holds |
|---|---|

## 5. Production environment variables
Every var, or the deploy checklist fails.
| Var | Purpose | Set where |
|---|---|---|

## 6. Deployment
Topology, release command, rollback in one sentence. Each deploy is traced by `record_release` (`release-*` tag, `docs/DEPLOYS.md`, GitHub Release):

## 7. Anti-patterns — we do not do this here
- 

## 8. Decisions
Short ADRs live in `docs/decisions/`. Portfolio-wide ones in `~/projects/brain/decisions/`.
