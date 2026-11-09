# Account emails (Correos v1, 4 November 2026)

The account emails, with Movo's look. `supabase/config.toml` points the local stack at these files.
The hosted project does not read `config.toml`: each template is pasted into **Supabase › Auth ›
Email Templates** by hand.

| File                                 | Supabase template                       | Subject                                 | Board |
| ------------------------------------ | --------------------------------------- | --------------------------------------- | ----- |
| `confirmation.html`                  | Confirm signup                          | Confirma tu correo para entrar a Movo   | 1     |
| `recovery.html`                      | Reset password                          | Cambia tu contraseña de Movo            | 2     |
| `email_change.html`                  | Change email address                    | Confirma el cambio de tu correo de Movo | 3, 4  |
| `email_changed_notification.html`    | Email address changed (security notice) | Tu correo de Movo cambió                | 4     |
| `password_changed_notification.html` | Password changed (security notice)      | Cambiaste tu contraseña de Movo         | 5     |

## Where the files differ from the board

- **Boards 3 and 4 share one template.** With «Secure email change» on, Supabase sends the same
  «Change email address» template to the current address and to the new one. Both have to
  confirm, so `email_change.html` is worded to read right in either inbox. After the change,
  `email_changed_notification.html` tells the old address that it happened, which is what board 4
  is for.
- **The old address is not masked.** Board 4 shows `a•••••s@correo.com`, but templates cannot
  transform a variable. The notice shows the address in full, and it only goes to the account's
  own inboxes.
- **Board 6, «Tu cuenta se borró», is not here.** Supabase has no template for it. It needs an
  Edge Function called at the end of `delete_my_account()` (0029), which this change does not add.
- **No legal name or address in the footer yet.** The board marks it as pending, and so is the
  domain: `movo.app` is a placeholder.

## Before launch

1. Turn on **Confirm email** (it is off for testing; Roadmap P0 item 3).
2. Set up custom SMTP. Supabase's default sender is for testing only and sends a few emails per
   hour. Configure SPF, DKIM and DMARC on the domain.
3. Paste each file and its subject into Auth › Email Templates. Turn on the two security notices
   under «Security notifications».
4. Send each one to a Gmail and an Outlook inbox with dark mode on, and check the button, the code
   and the fallback link.
