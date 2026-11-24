# Rayons — notes for Claude

- Read `docs/ARCHITECTURE.md` before changing data flow: Google (Gmail labels, event extended properties) is the record for mail and events; Supabase holds projects, notes, files and encrypted Google tokens.
- Screens only talk to the `Backend` interface (`src/data/backend.ts`). Any change to it must land in both `demoBackend.ts` and `liveBackend.ts` (and `server/` + `api/` for live). The demo must keep working with no env vars.
- Styling is plain CSS with tokens in `src/styles/tokens.css`; tag colours come from `data-tag` attributes. No Tailwind. Icons come from `@untitledui/icons` via `src/components/icons.ts`.
- Desktop layout follows the Figma file (`kwWOiSDfXg26xfXaL1k5Bb`); the phone layout (< 720px) is ours.
- Dev server: `bun run dev` on port 5175 (also runs `api/` functions). Check with `bun run build` (type-check + build).
- Secrets never get a `VITE_` name. Google tokens are only ever handled in `server/`.
