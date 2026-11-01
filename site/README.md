# Archiebase public client preview

This folder contains the new public Archiebase First Fix site, completely separate from the legacy Archie OS app in the repository root.

## Included
- Responsive Archiebase landing page with the approved robot art direction
- Six working First Fix starter generators and copy/print actions
- Free Google review request and QR sign maker (in-browser QR library)
- No required API keys, database or user login

## Launch checklist
1. Choose a verified business contact email or booking channel and connect it.
2. Use a **new Vercel project with rootDirectory = site**, not the legacy repository root. Do not expose context/ or api/chat.js publicly.
3. Verify existing Namecheap DNS web, MX, and TXT records before any domain switch.
4. Point only the web traffic to the new project after testing.
5. Retain the original Vercel project until rollback is no longer needed.

Note: Site outputs personalized starter templates from the form inputs; it does **not** claim to have scanned the user's business or Google listing. Do not add false audit scores.
