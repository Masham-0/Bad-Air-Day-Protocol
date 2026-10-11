"""Agent view of the smoke traces (indicative wind back-trajectory matched to NASA FIRMS fires)."""

KEEP = ("kind", "target_time", "source", "smoke_likely", "fire_count", "frp_total_mw", "upwind_from_deg",
        "by_district", "headline")


def smoke_summary(basis):
    """{'now': {...}, 'afternoon': {...}}; cite as /smoke/<key>/<field>."""
    return {k: {f: t[f] for f in KEEP} for k, t in basis["smoke"].items()}
