"""Build a retrospective company briefing from verified, deduplicated news events."""
from collections import Counter
from datetime import datetime, timedelta, timezone
import re

# Keep numbers in their source context. Product model numbers alone are not financial figures.
FIGURE = re.compile(r"(?:[$€£]\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:billion|million|trillion|[BMK])\b)?|[+-]?\d+(?:,\d{3})*(?:\.\d+)?\s?%)", re.I)


def reported_figures(excerpt):
    return list(dict.fromkeys(FIGURE.findall(excerpt)))[:6]


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc) if parsed.tzinfo else None
    except (ValueError, AttributeError, OverflowError):
        return None


def build_dossier(symbol, context, rows, history_available=True):
    anchor = timestamp(context.get("published_at"))
    excerpt = context.get("evidence", "")
    result = {"symbol": symbol, "anchor": context.get("published_at"), "excerpt": excerpt,
              "figures": reported_figures(excerpt), "impact_channel": context.get("impact_channel", "unclear"),
              "history_available": history_available, "recent_count": 0, "baseline_count": 0,
              "negative_share_change": None, "recurring": [], "connections": [], "timeline": []}
    if not anchor or not history_available:
        return result
    recent, baseline, types, peers, timeline = [], [], Counter(), {}, []
    for row in rows:
        when = timestamp(row["published_at"])
        if not when or not anchor - timedelta(days=180) <= when < anchor or row["event_id"] == context["event_id"]:
            continue
        companies = row["analysis"].get("companies", [])
        company = next((c for c in companies if c.get("symbol") == symbol), None)
        if not company:
            continue
        source = {"title": row["title"], "source": row["source"], "url": row["url"],
                  "published_at": when.isoformat(), "event_type": row["event_type"],
                  "evidence": company.get("evidence", ""), "direction": company.get("direction", "uncertain")}
        timeline.append(source)
        if when < anchor - timedelta(days=30):
            baseline.append(source)
            continue
        recent.append(source)
        types[row["event_type"]] += 1
        # Only attribute a spillover to a single verified direct subject.
        direct = [c for c in companies if c.get("relationship") == "direct"]
        if len(direct) != 1:
            continue
        for other in companies:
            if other.get("relationship") != "indirect" or not other.get("connection") or not other.get("evidence"):
                continue
            if symbol not in (other["symbol"], direct[0]["symbol"]):
                continue
            pair = (direct[0]["symbol"], other["symbol"])
            link = peers.setdefault(pair, {"from": pair[0], "to": pair[1], "count": 0, "source": source})
            link["count"] += 1
            if source["published_at"] >= link["source"]["published_at"]:
                link.update(source=source, mechanism=other["connection"], evidence=other["evidence"])
    result.update(recent_count=len(recent), baseline_count=len(baseline),
                  recurring=[{"type": k, "count": n} for k, n in types.most_common() if n >= 2],
                  connections=sorted(peers.values(), key=lambda x: (-x["count"], x["from"], x["to"]))[:5],
                  timeline=sorted(timeline, key=lambda x: x["published_at"], reverse=True)[:8])
    if min(len(recent), len(baseline)) >= 3:
        def share(items):
            return 100 * sum(item["direction"] == "negative" for item in items) / len(items)
        result["negative_share_change"] = round(share(recent) - share(baseline), 1)
    return result
