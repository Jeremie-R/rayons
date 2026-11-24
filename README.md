# Rayons

Mail and calendar, organised around your projects.

Rayons sits on top of Gmail and Google Calendar. Your mail stays a mail client, your calendar stays a calendar, and a **project** gathers the conversations, events, files and notes about one thing in your life: a house move, a class, a trip.

- **Inbox by tag.** Four tags (admin, event, buy, knowledge) sort the feed. Unread first, then read; archived and spam one tap away.
- **Projects.** Add a conversation or an event to a project. The project page shows its events on a timeline, every file (uploaded, or attached to its mail), your notes, and its mail with a reader beside it.
- **Calendar.** Schedule, day, week, month and year. Create or change an event and it changes in Google Calendar.
- **Nothing is copied.** Mail and events are read from Google each time. A tag is a Gmail label (`Rayons/admin`), a project is a Gmail label too (`Rayons/Projects/House move`), so everything still makes sense in Gmail, and Gmail filters can tag mail for you.

Working name; it may change. Made for one person first, open to anyone who wants it.

## Try it

```bash
bun install
bun run dev
```

Open http://localhost:5175. With no configuration it runs as a **demo**: made-up mail, events and projects, kept in your browser. Your own Gmail needs the setup in [docs/SETUP.md](docs/SETUP.md).

## How it's built

Vite, React 19, TypeScript and plain CSS on the front; Vercel functions (`api/`) talk to Gmail and Google Calendar with your Google token, which is kept encrypted in Supabase. Supabase also holds projects, notes and uploaded files. The details, and why, are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

| | |
|---|---|
| `src/screens` | Inbox, Calendar, Projects, You |
| `src/mail`, `src/calendar` | Thread list and reader, reply; calendar views and the event editor |
| `src/data` | `Backend` interface, with a demo and a live implementation; a small query cache |
| `api/`, `server/` | Gmail, Calendar and project endpoints; Google sign-in |
| `supabase/schema.sql` | Tables, row-level security, storage bucket |

Design: [Figma file](https://www.figma.com/design/kwWOiSDfXg26xfXaL1k5Bb/side-project). Icons: [Untitled UI](https://www.untitledui.com/free-icons) (MIT).

## Licence

MIT. See [LICENSE](LICENSE).
