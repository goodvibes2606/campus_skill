import Link from "next/link";

const pageDetails = {
  Notes: { eyebrow: "Study library", title: "Your notes, in one calm place.", description: "Organise class notes and revision material as your academic workspace takes shape.", accent: "NL" },
  Assignments: { eyebrow: "Academic work", title: "Stay ahead of every deadline.", description: "Assignments will help you keep track of submissions, feedback, and the work still in progress.", accent: "AS" },
  "Thesis Mentor": { eyebrow: "Research support", title: "A clearer path for your research.", description: "Your research companion will live here, ready to help you shape questions and next steps.", accent: "TM" },
  Profile: { eyebrow: "Your academic identity", title: "Make your progress visible.", description: "Keep your academic interests, goals, and growing skill story together in one profile.", accent: "PR" },
};

export function PagePlaceholder({ page }: { page: keyof typeof pageDetails }) {
  const details = pageDetails[page];
  return <div className="placeholder-page"><div className="page-heading"><div><p className="eyebrow">{details.eyebrow}</p><h1>{details.title}</h1><p className="page-description">{details.description}</p></div><div className="placeholder-seal" aria-hidden="true">{details.accent}</div></div><section className="coming-soon-panel" aria-label={`${page} coming soon`}><div className="panel-line" /><p className="panel-label">Coming into focus</p><h2>This space is being prepared for your learning journey.</h2><p>For now, return to your dashboard to see your academic overview and quick access links.</p><Link className="text-link" href="/">Back to dashboard <span aria-hidden="true">↗</span></Link></section></div>;
}