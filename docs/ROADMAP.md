# Analyst workflow and roadmap

The current source build supports article triage, evidence-backed company identification across eight categories, local event history, company dossiers and on-demand stock research. The public 1.0.2 installer previews the earlier menu-bar news experience. The [original blueprint](BLUEPRINT.md) records the initial project ideas. The proposals below have no committed release dates.

| Proposed extension | Analyst question | Evidence needed before shipping |
| --- | --- | --- |
| Corroborate a headline with a filing | What exactly did the issuer disclose about this guidance change? | Resolve the issuer to a CIK, deduplicate by accession, retain the real acceptance timestamp, and link to the paragraph and filing. |
| Track management commitments | Which milestones from the last earnings call are still open? | Store the original dated quotation, due date and later disclosure. Mark a commitment delivered or revised only when a source addresses it. |
| Measure market reaction | How did the company perform relative to its benchmark after publication? | Align publication time to exchange sessions, handle corporate actions, and record observed stock and benchmark prices for the same horizon. Show when the observation window is still open. |
| Watchlist and earnings calendar | What should I prepare for across the companies I cover? | Persist user-selected issuers and verify scheduled earnings dates, time zones and rescheduling with a suitable provider. |

For a daily research note, start with the article excerpt and a verified ticker, use the dossier to check earlier coverage, then use the thesis view to identify evidence still missing. Reference the original publisher and its date in the note. A change in the mix of saved news describes the archive and depends on the collection period.
