# Profile & Settings — implementation notes

## Identity boundary

Clerk remains the authority for authentication and identity. The Profile page reads and updates Clerk user data directly. AdSyntra does not store passwords, MFA seeds, recovery codes, verification codes, or session tokens in MongoDB.

The API preferences route derives the owner from the verified Clerk Express request context and updates only the matching `UserModel` document by `clerkUserId`.

## Persistence decision

The project already has a `User` model and a `users` collection with a unique `clerkUserId` field and legacy `preferences` fields. The implementation extends that model in place to keep older preference consumers and existing user records compatible. It does not create a second settings collection.

## First-slice scope

### Delivered

- Custom account menu with avatar, name, primary email, Profile, Settings, and Sign out.
- Clerk-backed name and profile-photo edits.
- Contact method verification status display.
- External sign-in identities display.
- General and Workspace preference editors with save/discard states and toast feedback.
- User-scoped MongoDB settings GET/PATCH route.
- Dark / Light / System preference synchronization.
- Initial dashboard landing-page preference.

### Deferred for safety or missing delivery integration

- Email/phone add, remove, and primary-address changes.
- Password, MFA, passkey, recovery-code and active-session management.
- Email/in-app notification delivery.
- Data export and account deletion.
- Consuming saved default report range/provider across every existing dashboard/reporting view.
- Applying date-format/timezone preferences to every existing table and chart.

## Route registration

Add `userSettingsRouter` to the current API server before the 404 handler. The supplied patch contains only the import and mount so that newer routes in an active local `server.ts` are not overwritten.
