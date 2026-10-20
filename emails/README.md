# SikaFlow auth emails

Branded HTML for the emails Supabase Auth sends. These files are the source of
truth; the project's live templates should match them.

| File | Supabase template | Fields |
| --- | --- | --- |
| `confirmation.html` | Confirm signup | `mailer_templates_confirmation_content`, `mailer_subjects_confirmation` |
| `magic-link.html` | Magic link (used by "Sign in with email code") | `mailer_templates_magic_link_content`, `mailer_subjects_magic_link` |
| `otp-code.html` | Reauthentication | `mailer_templates_reauthentication_content`, `mailer_subjects_reauthentication` |
| `password-reset.html` | Reset password | `mailer_templates_recovery_content`, `mailer_subjects_recovery` |

Template variables (Go syntax) are used as Supabase provides them:
`{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`. In `magic-link.html` the
code shown is `{{ .Token }}` — that is what the app's "Sign in with email code"
screen verifies with `verifyOtp`.

## Applied — custom SMTP is configured

Custom SMTP (Resend, `smtp.resend.com:587`) is configured on the project, which
lifts Supabase's default-mailer restriction on template editing
([changelog, 3 June 2026](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier))
as well as the 2-emails/hour cap. All four bodies and subjects from this folder
are live on project `ijlchsfygkmmyhltguqj`, applied 2026-10-20 and verified by
reading the config back through the Management API.

Editing them again:

1. Authentication → Emails, then *Confirm sign up* / *Magic link or OTP* /
   *Reauthentication* / *Reset password* — paste the file body into the Source
   editor and update the Subject.
2. Or PATCH `https://api.supabase.com/v1/projects/<ref>/config/auth` with the
   corresponding `mailer_subjects_*` and `mailer_templates_*_content` fields.

The shared Supabase MCP integration used inside Freebuff only exposes a subset
of auth fields and silently drops `mailer_*` ones, so template writes have to go
through the dashboard or a direct Management API call.

## Notes

- The wordmark is type-set rather than an image: the hosted `sikaflow.app`
  deployment currently answers every path with the SPA shell, so a linked
  `/icons/icon-192.png` would render as a broken image. Once assets are served,
  the seal can replace the `SIKAFLOW` wordmark in each file.
- `{{ .ConfirmationURL }}` must stay a plain `https://` link. Gmail and Outlook
  strip scripts and do not render `data:` images, so the templates are
  table-based with inline styles only, 560px wide.
