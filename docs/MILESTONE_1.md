# Desktop alert milestone

## Scope

An Electron menu-bar launcher, a React news panel, background news monitoring,
and an explicit demo flow establish the desktop experience before selecting a
financial-news provider. The app uses the existing backend for optional live
business headlines. The broader blueprint remains a roadmap, not a description
of completed earnings or AI functionality.

## Manual acceptance

1. Run `npm start` in `desktop`. Confirm the H menu-bar icon and panel appear.
2. In Demo mode, verify that samples are clearly marked and have separate stock
   and article actions. Open each action and confirm the expected destination.
3. Hide the panel; use the menu-bar context menu to send a test alert. Reopen
   the panel and confirm the new sample is present. If desktop notifications
   are enabled, click the notification to reopen the panel.
4. Toggle light/dark appearance and confirm all text remains legible.
5. Select Live news with the backend stopped. Confirm the error is visible and
   samples are not presented as live news. Return to Demo to continue testing.
6. With a configured backend, select Live news. Confirm publication timestamps
   come from articles, no old-headline notification burst occurs, and refresh
   does not repeat alerts for previously seen stories.
7. Quit and restart. Confirm the menu bar is the only launcher, mode persists,
   and previously seen live stories remain deduplicated.

## Next milestone

- Select one financial feed after checking ticker metadata, latency, limits,
  earnings coverage, and pricing against the intended personal-use budget.
- Add a persisted ticker watchlist and source-provided ticker associations.
- Distinguish scheduled earnings dates from actual releases and guidance.
- Add quiet hours, alert priorities, source-health status, and news history.
- Evaluate optional short AI summaries after raw headline delivery is reliable.

The current app must remain running to monitor. It does not monitor while the
Mac is asleep or after Quit. General business headlines do not guarantee
complete or timely coverage of stock-moving events.
