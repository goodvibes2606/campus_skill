"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

const navigation = [
  { label: "Dashboard", href: "/", icon: "grid" },
  { label: "Notes", href: "/notes", icon: "book" },
  { label: "Syllabus", href: "/syllabus", icon: "book" },
  { label: "Calendar", href: "/calendar", icon: "grid" },
  { label: "Daily Work", href: "/daily-work", icon: "check" },
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Assignments", href: "/assignments", icon: "check" },
  { label: "Thesis Mentor", href: "/thesis-mentor", icon: "spark" },
  { label: "Profile", href: "/profile", icon: "user" },
];

export type ShellUser = {
  name: string;
  email: string;
} | null;

function NavIcon({ name }: { name: string }) {
  return <span aria-hidden="true" className={`nav-icon nav-icon-${name}`} />;
}

function initials(name: string, email: string): string {
  const source = name?.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: ShellUser;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/sign-in");
            router.refresh();
          },
        },
      });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">CS</div>
          <div><p className="brand-name">Campus Skill</p><p className="brand-caption">Learn. Apply. Grow.</p></div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-heading">Workspace</p>
          {navigation.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return <Link className={`nav-item ${isActive ? "nav-item-active" : ""}`} href={item.href} key={item.href} onClick={() => setIsMenuOpen(false)}><NavIcon name={item.icon} /><span>{item.label}</span>{isActive && <span className="nav-active-dot" aria-hidden="true" />}</Link>;
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-tip"><span className="tip-icon" aria-hidden="true">i</span><div><p>Keep building</p><span>Small progress adds up.</span></div></div>
          <p className="sidebar-version">Campus Skill · Student workspace</p>
        </div>
      </aside>
      {isMenuOpen && <button aria-label="Close navigation" className="sidebar-overlay" onClick={() => setIsMenuOpen(false)} type="button" />}
      <div className="main-column">
        <header className="topbar">
          <button aria-expanded={isMenuOpen} aria-label="Open navigation" className="menu-toggle" onClick={() => setIsMenuOpen(true)} type="button"><span /><span /><span /></button>
          <div className="topbar-context"><span className="context-kicker">Student workspace</span><span className="context-divider" aria-hidden="true" /><span>{pathname === "/" ? "Overview" : navigation.find((item) => pathname.startsWith(item.href) && item.href !== "/")?.label}</span></div>
          <div className="topbar-actions">
            <Link className="icon-button" aria-label="Notifications" href="/notifications"><span className="bell-icon" aria-hidden="true" /><span className="notification-dot" aria-hidden="true" /></Link>
            {user ? (
              <div className="user-chip">
                <span className="avatar">{initials(user.name, user.email)}</span>
                <span className="user-chip-copy">
                  <strong>{user.name || user.email}</strong>
                  <small>{user.email}</small>
                </span>
                <button
                  className="sign-out-button"
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            ) : (
              <Link className="sign-in-link" href="/sign-in">Sign in</Link>
            )}
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
