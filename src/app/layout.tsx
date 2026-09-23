import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { getSessionUser } from "@/lib/session";
import { getAuthContext } from "@/lib/authz";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Campus Skill | Academic workspace",
  description: "A focused academic workspace for learning, practice, and progress.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  const ctx = user ? await getAuthContext() : null;

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppShell
          user={
            user
              ? { name: user.name || user.email, email: user.email }
              : null
          }
          roleName={ctx?.roleName ?? null}
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
