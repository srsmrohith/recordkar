"use client";

import { useActionState, useState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export function LoginForm({ linkError }: { linkError?: string }) {
  const [state, action, sending] = useActionState(sendMagicLink, { status: "idle", email: "" } as LoginState);
  const [changeEmail, setChangeEmail] = useState(false);

  if (state.status === "sent" && !changeEmail) {
    return (
      <div className="space-y-4 text-sm" role="status">
        <p className="font-medium">Check your email</p>
        <p className="text-ink-2">
          We sent a sign-in link to <strong className="text-ink">{state.email}</strong>. Open it in this browser to sign in.
        </p>
        <button type="button" className="btn-ghost w-full" onClick={() => setChangeEmail(true)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form action={(fd) => { setChangeEmail(false); action(fd); }} className="space-y-4">
      {linkError && !state.error && (
        <p className="field-error" role="alert">{linkError}</p>
      )}
      <div>
        <label htmlFor="email" className="label">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required defaultValue={state.email} className="input" />
      </div>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={sending}>{sending ? "Sending…" : "Email me a sign-in link"}</button>
    </form>
  );
}
