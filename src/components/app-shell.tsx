"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  /** Roles that see this item. Omit = every signed-in role. */
  roles?: string[];
};

/**
 * Role-aware navigation (Milestone 7).
 * Filtering is defense-in-depth for UX only — route access is still
 * enforced server-side in each page/API via getAuthContext + services.
 */
const navigation: NavItem[] = [
  { label: "Dashboard", href: "/", icon: "grid" },
  {
    label: "My Subjects",
    href: "/subjects",
    icon: "book",
    roles: ["student"],
  },
  {
    label: "Notes",
    href: "/notes",
    icon: "book",
    roles: ["student", "faculty", "hod", "admin", "director_dean"],
  },
  {
    label: "Syllabus",
    href: "/syllabus",
    icon: "book",
    roles: ["student", "faculty", "hod", "admin", "director_dean"],
  },
  {
    label: "Calendar",
    href: "/calendar",
    icon: "grid",
    roles: [
      "student",
      "faculty",
      "hod",
      "admin",
      "director_dean",
      "system_admin",
    ],
  },
  {
    label: "Daily Work",
    href: "/daily-work",
    icon: "check",
    roles: ["faculty", "hod", "admin", "director_dean"],
  },
  {
    label: "Assignments",
    href: "/assignments",
    icon: "check",
    roles: ["student", "faculty", "hod", "admin", "director_dean"],
  },
  {
    label: "Thesis Mentor",
    href: "/thesis-mentor",
    icon: "spark",
    roles: ["student"],
  },
  {
    label: "Placement",
    href: "/placement",
    icon: "spark",
    roles: [
      "student",
      "faculty",
      "hod",
      "admin",
      "director_dean",
      "tpo",
    ],
  },
  {
    label: "AI Assist",
    href: "/ai",
    icon: "spark",
    roles: [
      "student",
      "faculty",
      "hod",
      "admin",
      "director_dean",
      "tpo",
      "system_admin",
    ],
  },
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Profile", href: "/profile", icon: "user" },
];

const WORKSPACE_LABELS: Record<string, string> = {
  student: "Student workspace",
  faculty: "Faculty workspace",
  hod: "HOD workspace",
  director_dean: "Director / Dean",
  admin: "Institution admin",
  system_admin: "System administration",
  tpo: "Placement cell",
  recruiter: "Recruiter (catalog)",
};

export type ShellUser = {
  name: string;
  email: string;
} | null;

export type ShellRole = string | null;

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

function visibleNavigation(roleName: ShellRole): NavItem[] {
  if (!roleName) {
    // Signed-out (sign-in/sign-up pages): keep shell minimal — no dead academic links.
    return navigation.filter((item) => item.href === "/");
  }
  return navigation.filter(
    (item) => !item.roles || item.roles.includes(roleName)
  );
}

export function AppShell({
  children,
  user,
  roleName,
}: {
  children: React.ReactNode;
  user?: ShellUser;
  roleName?: ShellRole;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const items = visibleNavigation(roleName ?? null);
  const workspaceLabel = roleName
    ? (WORKSPACE_LABELS[roleName] ?? "Workspace")
    : "Signed out";

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

  const contextLabel =
    pathname === "/"
      ? "Overview"
      : (items.find(
          (item) =>
            item.href !== "/" &&
            (pathname === item.href || pathname.startsWith(`${item.href}/`))
        )?.label ??
        "Overview");

  return (
    <div className="app-shell">
      <aside className={`sidebar ${isMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark">CS</div>
          <div>
            <p className="brand-name">Campus Skill</p>
            <p className="brand-caption">Learn. Apply. Grow.</p>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <p className="nav-heading">{workspaceLabel}</p>
          {items.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href ||
                  pathname.startsWith(`${item.href}/`);
            return (
              <Link
                className={`nav-item ${isActive ? "nav-item-active" : ""}`}
                href={item.href}
                key={item.href}
                onClick={() => setIsMenuOpen(false)}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
                {isActive && (
                  <span className="nav-active-dot" aria-hidden="true" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-tip">
            <span className="tip-icon" aria-hidden="true">
              i
            </span>
            <div>
              <p>Keep building</p>
              <span>Small progress adds up.</span>
            </div>
          </div>
          <p className="sidebar-version">Campus Skill · {workspaceLabel}</p>
        </div>
      </aside>
      {isMenuOpen && (
        <button
          aria-label="Close navigation"
          className="sidebar-overlay"
          onClick={() => setIsMenuOpen(false)}
          type="button"
        />
      )}
      <div className="main-column">
        <header className="topbar">
          <button
            aria-expanded={isMenuOpen}
            aria-label="Open navigation"
            className="menu-toggle"
            onClick={() => setIsMenuOpen(true)}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
          <div className="topbar-context">
            <span className="context-kicker">{workspaceLabel}</span>
            <span className="context-divider" aria-hidden="true" />
            <span>{contextLabel}</span>
          </div>
          <div className="topbar-actions">
            {roleName ? (
              <Link
                className="icon-button"
                aria-label="Notifications"
                href="/notifications"
              >
                <span className="bell-icon" aria-hidden="true" />
                <span className="notification-dot" aria-hidden="true" />
              </Link>
            ) : null}
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
              <Link className="sign-in-link" href="/sign-in">
                Sign in
              </Link>
            )}
          </div>
        </header>
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
