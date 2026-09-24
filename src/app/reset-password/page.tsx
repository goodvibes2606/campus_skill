"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

import { authClient } from "@/lib/auth-client";

function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error: resetError } = await authClient.resetPassword({
        newPassword: password,
        token,
      });
      if (resetError) {
        setError(resetError.message || "Unable to reset password.");
        return;
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <>
        <p className="placement-success">
          Password updated. Sign in with your new password.
        </p>
        <p className="auth-switch">
          <Link href="/sign-in">Go to sign in</Link>
        </p>
      </>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="auth-field" htmlFor="new-password">
        <span>New password</span>
        <input
          id="new-password"
          name="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="auth-field" htmlFor="confirm-password">
        <span>Confirm password</span>
        <input
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </label>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? "Saving…" : "Set password"}
      </button>
    </form>
  );
}

function ResetPasswordPanel() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const urlError = searchParams.get("error");

  if (urlError === "INVALID_TOKEN" || (!token && urlError)) {
    return (
      <section className="auth-panel" aria-label="Password reset">
        <div className="panel-line" />
        <p className="panel-label">Reset link</p>
        <p className="auth-error" role="alert">
          This reset link is invalid or has expired. Request a new one.
        </p>
        <p className="auth-switch">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="auth-panel" aria-label="Password reset">
        <div className="panel-line" />
        <p className="panel-label">Reset link</p>
        <p className="placement-body">
          This page is opened from an email reset link. Open the link again, or
          request a new one.
        </p>
        <p className="auth-switch">
          <Link href="/forgot-password">Request a new link</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="auth-panel" aria-label="Set new password">
      <div className="panel-line" />
      <p className="panel-label">Set a new password</p>
      <ResetPasswordForm token={token} />
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account recovery</p>
          <h1>Choose a new password.</h1>
          <p className="page-description">
            Open the secure link from your email, then set a new password for
            your account.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">
          NP
        </div>
      </div>
      <Suspense fallback={<p className="placement-muted">Loading…</p>}>
        <ResetPasswordPanel />
      </Suspense>
    </div>
  );
}
