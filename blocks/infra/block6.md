# Infra 6: Daily alert

Scope: infra/template.yaml, infra/README.md

Tasks:
- Confirm the EventBridge rule cron(30 0 * * ? *) targets the alert Lambda, which is 06:00 IST
- Subscribe a real team email to the SNS topic and confirm the subscription
- Call POST /schools/{id}/alert/test after a plan exists, because it times out at 29 s without one
- Confirm the alert is recorded in the alerts table
- Email is the demo channel. Do not set up SMS

Done when: A real email arrives from the alert test and the schedule rule shows as enabled in the console.
