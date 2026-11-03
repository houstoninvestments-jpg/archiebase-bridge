# Archiebase public client website

**Status:** Prototype site is live at https://archiebase-public.vercel.app. Domain `archiebase.com` is NOT switched.

## Business model
- Free, manually reviewed written business audit with three prioritized opportunities
- Three narrowly scoped services: Conversion Page ($750), Lead Follow-Up ($950), Admin Quick Win ($650)
- Written communication and fixed-scope implementation first. No required sales call.
- Business owns and pays any software accounts, texting usage and hosting directly.

## Routes
- `/` — new client-facing site with free written audit, productized packages and inquiry form
- `/tools.html` — preserved free First Fix generator and review QR kit
- `/api/contact` — same-origin validated contact relay. Recipient held in the `CONTACT_EMAIL` encrypted Vercel environment variable.

## Verification and go-live gates
- [x] Main landing page, packages and free tools serve successfully from Vercel
- [x] Contact endpoint exists and responds to GET with 405
- [ ] Submit one real test request and verify it arrives in the target inbox
- [ ] Activate FormSubmit delivery via email if prompted
- [ ] Add payment checkout only when the offer and delivery process are proven
- [ ] Review public GitHub history for legacy context leakage
- [ ] Verify DNS/MX/TXT records before changing the real Archiebase domain

**Do not deploy the repository root** for the client site; use the isolated `site/` directory. The prior Archie OS remains in the public repository root and must not be published with this project.

Source is plain HTML/CSS/JavaScript on purpose: it keeps launch overhead near zero. Upgrade to Next.js only when the functional needs justify it.
