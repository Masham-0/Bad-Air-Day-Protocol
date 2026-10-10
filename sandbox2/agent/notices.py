"""ProtocolResponse (+ basis) -> ParentNoticeResponse (contracts/parent_notice.schema.json).

One English and one Hindi notice for the day's plan, plus an English and a Hindi smoke notice when the
afternoon trace says smoke is likely. Extra fields the schema allows (open question 6): `lang` ("en" | "hi")
and `kind` ("plan" | "smoke"). GET /notices?lang=hi filters on `lang`.
"""
import uuid
from datetime import date

from agent.rules import DECISION_HI
from data.util import iso_z, ist_today_at

SEVERITY = {"all_clear": "info", "caution": "info", "restricted": "warning", "emergency": "critical"}
TITLE = {
    "all_clear": ("Outdoor activities as normal today", "आज बाहर की गतिविधियाँ सामान्य रहेंगी"),
    "caution": ("Some outdoor activities adjusted today", "आज कुछ बाहरी गतिविधियों में बदलाव"),
    "restricted": ("Outdoor activities restricted today", "आज बाहर की गतिविधियाँ सीमित रहेंगी"),
    "emergency": ("All outdoor activities stopped today", "आज सभी बाहरी गतिविधियाँ बंद रहेंगी"),
}
DECISION_EN = {"outdoors": "outdoors as planned", "indoors": "moved indoors", "restricted": "restricted"}
CLOSING_EN = ("Please send your child with a well-fitting mask for the journey to and from school. "
              "We will keep outdoor exertion to a minimum.\n\n"
              "_Indicative guidance from model forecasts and an indicative smoke trace. Official GRAP/CAQM and "
              "Directorate of Education orders always take precedence._")
CLOSING_HI = ("कृपया स्कूल आते-जाते समय बच्चे को अच्छी तरह फ़िट होने वाला मास्क पहनाकर भेजें। "
              "हम बाहर की थकाने वाली गतिविधियाँ कम से कम रखेंगे।\n\n"
              "_यह सलाह मॉडल पूर्वानुमान और धुएँ के संकेतात्मक अनुमान पर आधारित है। सरकारी GRAP/CAQM और शिक्षा "
              "निदेशालय के आदेश हमेशा मान्य होंगे।_")


def _id(protocol, kind, lang):
    """Stable per generated plan, so re-reading the notices gives the same ids."""
    key = f"badair/{protocol['school_id']}/{protocol['date']}/{protocol['generated_at']}/{kind}/{lang}"
    return str(uuid.uuid5(uuid.NAMESPACE_URL, key))


def build_notices(protocol, basis):
    day = date.fromisoformat(protocol["date"])
    issued = protocol["generated_at"]
    expires = iso_z(ist_today_at(max(s["end"] for s in basis["schedule"]), day=day))
    status, school = protocol["overall_status"], basis["school"]
    sample_en = "**SAMPLE DATA, not a real reading.**\n\n" if protocol.get("sample") else ""
    sample_hi = "**सैंपल डेटा, असली रीडिंग नहीं।**\n\n" if protocol.get("sample") else ""
    lines_en = [f"- **{a['activity']}** ({a['scheduled_time']}): {DECISION_EN[a['decision']]}"
                + (f". {a['alternative']}" if a.get("alternative") else "") for a in protocol["activities"]]
    lines_hi = [f"- **{a['hi']['activity']}** ({a['scheduled_time']}): {DECISION_HI[a['decision']]}"
                + (f"। {a['hi']['alternative']}" if a["hi"].get("alternative") else "") for a in protocol["activities"]]
    body_en = (f"{sample_en}Dear parents,\n\n{protocol['overall_message'].removeprefix('SAMPLE DATA. ')}\n\n"
               f"Plan for {school['name']} on {day:%d %b %Y}:\n" + "\n".join(lines_en) + f"\n\n{CLOSING_EN}")
    body_hi = (f"{sample_hi}प्रिय अभिभावकगण,\n\n{protocol['overall_message_hi'].removeprefix('सैंपल डेटा। ')}\n\n"
               f"{school['name']} की {day:%d-%m-%Y} की योजना:\n" + "\n".join(lines_hi) + f"\n\n{CLOSING_HI}")
    common = {"severity": SEVERITY[status], "issued_at": issued, "expires_at": expires, "kind": "plan"}
    notices = [
        {"id": _id(protocol, "plan", "en"), "title": TITLE[status][0], "body": body_en, "lang": "en", **common},
        {"id": _id(protocol, "plan", "hi"), "title": TITLE[status][1], "body": body_hi, "lang": "hi", **common},
    ]
    aft = basis["smoke"]["afternoon"]
    if aft["smoke_likely"]:
        smoke = {"severity": "warning", "issued_at": issued, "expires_at": expires, "kind": "smoke"}
        notices += [
            {"id": _id(protocol, "smoke", "en"), "title": "Farm-fire smoke likely by 14:00", "lang": "en",
             "body": f"{sample_en}{aft['headline']['en']}\n\nAfternoon outdoor activity is one step stricter. "
                     "This is an indicative wind back-trajectory, not a dispersion model.", **smoke},
            {"id": _id(protocol, "smoke", "hi"), "title": "दोपहर 2 बजे तक खेतों की आग के धुएँ की संभावना", "lang": "hi",
             "body": f"{sample_hi}{aft['headline']['hi']}\n\nदोपहर की बाहरी गतिविधियों में एक कदम ज़्यादा सावधानी। "
                     "यह हवा के रुख़ पर आधारित एक संकेतात्मक अनुमान है।", **smoke},
        ]
    return {"school_id": protocol["school_id"], "date": protocol["date"], "notices": notices}

