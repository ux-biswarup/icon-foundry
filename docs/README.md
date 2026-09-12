# Documentation

Six documents, each with one job. If something does not fit one of these jobs,
it does not need a document.

| Document | Job | Answers |
| --- | --- | --- |
| [PRODUCT.md](PRODUCT.md) | **Why** | What problem this solves and why it is worth solving. No architecture. |
| [COMPILER.md](COMPILER.md) | **What we are building** | The target architecture, and how a design rule becomes something a machine can act on. No status. |
| [SYSTEM.md](SYSTEM.md) | **What exists** | The system as built, factually, with the flows a person can actually complete. |
| [EXPERIENCE.md](EXPERIENCE.md) | **What a person does** | The designed experience: screens, principles, flows. |
| [DECISIONS.md](DECISIONS.md) | **Why it is shaped this way** | An append-only record of architectural decisions. |
| [PLAN.md](PLAN.md) | **In what order** | Milestones, and what would be cut first. |

`research/` holds source material and superseded documents, kept for the
record rather than for reading as current. The most load-bearing of them is
[research/icon-properties.md](research/icon-properties.md), a verified survey of
the construction rules published icon systems actually write down.

`proposals/` holds arguments and the artefacts made to review them. A proposal
is not a plan and not a description of anything built. When one is accepted it
becomes entries in `DECISIONS.md` and milestones in `PLAN.md`; the proposal
stays here as the record of the reasoning, marked with where it was wrong.

| Proposal | Argues | State |
| --- | --- | --- |
| [proposals/construction.md](proposals/construction.md) | A team should own how its parts are *constructed*, because that is where "the work of one hand" actually lives. | Accepted, built as M12–M18 |
| [proposals/language-page-concept.html](proposals/language-page-concept.html) | A working concept of the merged Language page. Open it in a browser; no build step. | Built, and the page follows it closely |
| [proposals/language-panel-concept.html](proposals/language-panel-concept.html) | v2, the right column only: a properties panel rather than a document. Scope and provenance as glyphs, the writing behind a Learn toggle, labels you drag to sweep a value. | For review |

## Which one to change

- A new architectural decision → `DECISIONS.md`, appended.
- The target changed → `COMPILER.md`.
- Something got built → `SYSTEM.md`.
- A screen changed → `EXPERIENCE.md`.
- The order changed → `PLAN.md`.
- An argument not yet agreed → `proposals/`, and nowhere else until it is.

Do not add an addendum that reverses an earlier section of the same document.
Edit the section. The history lives in Git.
