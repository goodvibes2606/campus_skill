import Link from "next/link";

const quickAccess = [
  { title: "Review notes", detail: "Pick up where you left off", href: "/notes", className: "quick-card-blue", icon: "book" },
  { title: "Plan assignments", detail: "Keep your week moving", href: "/assignments", className: "quick-card-gold", icon: "check" },
  { title: "Thesis Mentor", detail: "Shape your next idea", href: "/thesis-mentor", className: "quick-card-green", icon: "spark" },
];

export default function Home() {
  return (
    <div className="dashboard-page">
      <section className="welcome-section"><div><p className="eyebrow">Monday, 22 September 2026</p><h1>Good morning, student.</h1><p className="welcome-copy">Make today count. One thoughtful step at a time.</p></div><div className="welcome-art" aria-hidden="true"><span>✦</span></div></section>
      <section className="overview-grid" aria-label="Academic overview">
        <div className="overview-card overview-card-main"><div className="card-heading"><span className="card-label">Academic pulse</span><span className="status-pill">This week</span></div><div className="progress-row"><div><strong>72%</strong><span>overall progress</span></div><div className="progress-ring"><span>72</span></div></div><div className="progress-bar"><span /></div><p className="muted-copy">You&apos;re building a steady rhythm. Keep showing up.</p></div>
        <div className="overview-card stat-card"><span className="stat-icon stat-icon-orange">◎</span><strong>4</strong><span>active subjects</span><small>+1 this month</small></div>
        <div className="overview-card stat-card"><span className="stat-icon stat-icon-teal">↗</span><strong>08</strong><span>tasks completed</span><small>2 due this week</small></div>
      </section>
      <section className="content-section"><div className="section-heading"><div><p className="eyebrow">Move forward</p><h2>Quick access</h2></div><span className="section-note">Your essentials</span></div><div className="quick-grid">{quickAccess.map((item) => <Link className={`quick-card ${item.className}`} href={item.href} key={item.title}><span className={`quick-icon quick-icon-${item.icon}`} aria-hidden="true">{item.icon === "book" ? "▤" : item.icon === "check" ? "✓" : "✦"}</span><span><strong>{item.title}</strong><small>{item.detail}</small></span><span className="arrow" aria-hidden="true">↗</span></Link>)}</div></section>
      <section className="lower-grid"><div className="activity-panel"><div className="section-heading"><div><p className="eyebrow">Keep track</p><h2>Recent activity</h2></div><button className="quiet-button" type="button">View all</button></div><div className="activity-list"><div className="activity-item"><span className="activity-marker marker-blue" /><div><strong>Marketing Management notes</strong><small>Reviewed yesterday · 18 min read</small></div><span className="activity-arrow">›</span></div><div className="activity-item"><span className="activity-marker marker-orange" /><div><strong>Case study reflection</strong><small>Submitted 3 days ago · Awaiting feedback</small></div><span className="activity-arrow">›</span></div><div className="activity-item"><span className="activity-marker marker-green" /><div><strong>New learning streak</strong><small>Three focused days in a row</small></div><span className="activity-arrow">›</span></div></div></div><aside className="focus-card"><span className="focus-spark" aria-hidden="true">✦</span><p className="eyebrow">A small nudge</p><h2>What do you want to understand better today?</h2><p>Curiosity is a good place to begin. Choose one idea and give it your full attention.</p><Link className="focus-link" href="/notes">Open your notes <span aria-hidden="true">↗</span></Link></aside></section>
    </div>
  );
}