# Architecture

## The model

| Object | Lives in | Holds | Links |
|---|---|---|---|
| Mail thread | Gmail | subject, messages, read/unread, archived, spam | one tag, 0–1 project |
| Calendar event | Google Calendar | title, time, place, notes | one tag, 0–1 project, 0–1 mail thread |
| Project | Supabase | name, notes, active/archived | 0–many threads, events, files |
| File | Supabase Storage, or a Gmail attachment | the file | one project |
| Tag | fixed set | admin, event, buy, knowledge; none = "other" | threads and events |

A project's tags are never set by hand: they roll up from its threads and events.

## Google is the record

Rayons doesn't copy mail or events. It stores links *in Google*:

| In Rayons | In Google |
|---|---|
| Tag on a thread | Gmail label `Rayons/<tag>` |
| Thread in a project | Gmail label `Rayons/Projects/<project name>` (label id kept on the project row) |
| Tag, project or mail on an event | private extended properties `rayonsTag`, `rayonsProject`, `rayonsThread` on the event |
| Unread, archived, spam, trash | Gmail's own `UNREAD`, `INBOX`, `SPAM`, `TRASH` |

Why:
- Nothing to keep in sync, so nothing gets out of sync. Change a label in Gmail and Rayons sees it.
- Gmail filters can tag and file mail for you (a filter that adds `Rayons/buy` to receipts, say).
- If you stop using Rayons, your organisation is still there in Gmail.
- Private extended properties stay on *your* copy of an event, even one someone else organised.

The cost: every screen asks Google, so lists take a few hundred milliseconds, and there are no notifications yet. When that starts to hurt, the next step is a cache table in Supabase fed by Gmail push notifications (`users.watch` through Pub/Sub) and Calendar sync tokens. The screens wouldn't change; only `liveBackend` would.

An event can belong with a mail without any project (an invitation, a booking): it carries the thread id, and the conversation shows those events in a small calendar rail. "New event from this mail" takes its title from the subject and its date from the first date written in the mail, when there is one (`src/lib/guessDate.ts`).

Speed: the browser keeps recent lists and conversations on the device (localStorage, live accounts only, cleared on sign-out) and shows them at once while fresh ones load; archive, trash and spam take the row out of the list before the server answers; hovering a row, and the conversations either side of the open one, load ahead. On the server, inbox rows come from one Gmail batch request rather than one request each, the sign-in token is checked locally against Supabase's published keys, and every api/ response carries a `Server-Timing` header (auth, account, list, threads, total) to see where time goes.

Projects keep two numbers from Google so the project list loads instantly: the rolled-up `tags` and `unread_count`. The server refreshes them after a change and every few minutes when the list is open (`server/projects.ts`).

## Behaviour decided in the spec

From the object model doc, and the answers in it:
- Tags are a closed set of four, one per thread or event; untagged is "other".
- Adding an event to a thread does not tag it `event`: the tag and the calendar are independent.
- The mail client stays a mail client: a thread in a project still shows in the inbox and its tag.
- Archiving a project archives its mail. Archiving mail never archives a project. New mail in an archived project doesn't reopen it; the project shows "n new" in the archived list.
- Mail attachments and uploaded files appear together in the project's files. An event needs a project to hold files.
- A thread in a project shows a strip ("House move · next: Furniture delivery…") that opens the project page with that thread selected. An event in a project shows the project at the top of its editor.

Still open (next steps):
- Turn "here is an event you're attending" mail into events, and so into projects (invitations and `.ics` first).
- Merge two projects.
- Reply with a file from the project, or upload one.
- Several Google accounts per person (the tables allow it; the screens assume one).
- Dragging events to move them; notifications; offline.

## Sign-in and tokens

```
Browser ──(1) authorization code + PKCE──▶ Google consent (our domain on it)
Browser ◀─(2) one-time code at /auth/callback
Browser ──(3) code──▶ api/google/connect ──▶ Google token endpoint (with client secret)
                          │  refresh token → AES-256-GCM → google_tokens
                          │  ID token → Supabase signInWithIdToken
Browser ◀─(4) Supabase session
Browser ──(5) Bearer <Supabase JWT>──▶ api/gmail, api/calendar, api/projects ──▶ Google APIs
```

- The client secret and Google tokens never reach the browser. Tokens are encrypted with `TOKEN_ENCRYPTION_KEY` before they're stored; `google_tokens` has row-level security on and no policies, so only the server's secret key can read it.
- Scopes: `gmail.modify` (read, label, archive, send; not permanent delete), `calendar.events`, `calendar.calendarlist.readonly`.
- If Google refuses the refresh token (access revoked, password changed, 7-day expiry in testing mode), the account is marked `reconnect` and the app shows a "Sign in again" bar.

## Mail safety

- HTML mail is sanitised with DOMPurify, then shown in an `<iframe sandbox>` without `allow-scripts`. Links open in a new tab; styles in the mail are dropped.
- Attachments download as blobs; HTML-ish types are served as `application/octet-stream`.
- One-click unsubscribe (RFC 8058) is sent by the server only to public `https` addresses; otherwise the app opens the unsubscribe page or `mailto:` for you to finish.

## Front end

- `src/data/backend.ts` is the only thing screens talk to. `demoBackend` (in-browser, seeded by `demoSeed.ts`) and `liveBackend` implement it, so every screen works without an account and the demo is a real test of the UI.
- `src/data/store.tsx`: `useQuery(key, fetcher)` plus `invalidate(prefix)`. Keys are listed in `keys`.
- Layout: a 64px rail, a 352px list and a detail pane from 720px up; below that one pane at a time with a tab bar. Desktop follows the Figma file; the phone layout is our proposal.
- Styles are plain CSS with tokens in `src/styles/tokens.css`. Contrast changes from the Figma file are listed at the top of that file.
