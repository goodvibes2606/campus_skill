"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { authClient } from "@/lib/auth-client";

function VerifyEmailPanel() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  async function handleVerify() {
    if (!token) return;
    setStatus("working");
    try {
      const { error } = await authClient.verifyEmail({ query: { token } });
      if (error) {
        setStatus("error");
        setMessage(error.message || "Verification link is invalid or expired.");
        return;
      }
      setStatus("done");
      setMessage("Email verified.");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  async function handleResend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL: `${origin}/verify-email`,
      });
      if (error) {
        setStatus("error");
        setMessage(error.message || "Unable to send verification email.");
        return;
      }
      setStatus("done");
      setMessage("If that email can be verified, a new link was sent.");
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  if (token) {
    return (
      <section className="auth-panel" aria-label="Verify email">
        <div className="panel-line" />
        <p className="panel-label">Email verification</p>
        {status === "idle" && (
          <>
            <p className="placement-body">
              Confirm this email address for your Campus Skill account.
            </p>
            <button className="auth-submit" type="button" onClick={handleVerify}>
              Verify email
            </button>
          </>
        )}
        {status === "working" && (
          <p className="placement-muted">Working…</p>
        )}
        {message && (
          <p className={status === "error" ? "auth-error" : "placement-success"} role="status">
            {message}
          </p>
        )}
        <p className="auth-switch">
          <Link href="/sign-in">Back to sign in</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="auth-panel" aria-label="Resend verification">
      <div className="panel-line" />
      <p className="panel-label">Verify your email</p>
      <p className="placement-body">
        Open the link in your inbox, or request a new verification email.
      </p>
      <form className="auth-form" onSubmit={handleResend}>
        <label className="auth-field" htmlFor="verify-email">
          <span>Email</span>
          <input
            id="verify-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@college.edu"
          />
        </label>
        <button className="auth-submit" type="submit" disabled={status === "working"}>
          {status === "working" ? "Sending…" : "Send verification link"}
        </button>
      </form>
      {message && (
        <p className={status === "error" ? "auth-error" : "placement-success"} role="status">
          {message}
        </p>
      )}
      <p className="auth-switch">
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </section>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="placeholder-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Verify your email.</h1>
          <p className="page-description">
            Verification keeps password recovery and institutional notices
            reliable.
          </p>
        </div>
        <div className="placeholder-seal" aria-hidden="true">EV</div>
      </div>
      <Suspense fallback={<p className="placement-muted">Loading…</p>}>
        <VerifyEmailPanel />
      </Suspense>
    </div>
  );
}
