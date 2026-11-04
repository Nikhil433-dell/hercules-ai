# Live desktop acceptance checklist

1. Start Hercules. Confirm no window appears until the H menu-bar icon is clicked.
2. Click H. Verify current headlines, last checked time, category dropdown, and
   refresh. Change category; verify there is no historical-alert burst.
3. Click outside the panel or press Escape. Verify it hides and monitoring continues.
4. On a genuinely new story, verify the popup is 250px wide and 160px high. It must
   not open the full panel or steal focus. Click elsewhere to dismiss it.
5. Click a new popup or a feed headline. Verify a separate article window shows
   the headline, source, publication time, description, and original article link.
6. Confirm source-provided symbols have quote prices, currency when available,
   and quote time. If the quote provider is unavailable, confirm the UI says so
   and news still works. No fabricated ticker or zero-price placeholders.
7. Open the stock link and original article link. Confirm the correct destinations.
8. Stop the backend and refresh. Verify the connection error is visible, prior
   stories remain, and no sample stories appear. Restart the backend and retry.
9. Quit and restart. Confirm startup stays hidden and previously seen stories do
   not alert again. The first response establishes a quiet baseline; subsequent
   new stories can alert.
10. Test dark/light appearance and long headlines at the narrow panel width.
11. Confirm the main panel cannot be dragged. Resize it from its edges, then
    hide and reopen it; verify its new dimensions remain. At 480px or wider,
    verify the news feed uses two columns; at shorter heights it must scroll.

Automated tests cover feed normalization, category baselines, deduplication,
restart history, stale request races, provider failures, and quote/feed caching.
The app must remain running and the Mac awake for background checks. It does
not guarantee complete or real-time coverage of stock-moving events.
