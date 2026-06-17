const GITHUB_URL    = "https://github.com/AkshithSai-24/DynamicBI";
const PORTFOLIO_URL = "https://akshithsai.co.in";

const badgeBase = {
  display: "inline-flex", alignItems: "center", gap: 5,
  textDecoration: "none", fontSize: 12, fontWeight: 800,
  border: "1px solid #2a3550", borderRadius: 7, padding: "5px 10px",
  background: "#1a2030", transition: "color 0.15s",
};

/* Globe / portfolio icon */
const PortfolioIcon = ({ size = 14 }) => (
  <svg height={size} width={size} viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
       aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const GithubIcon = ({ size = 14 }) => (
  <svg height={size} width={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
      0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13
      -.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07
      -1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12
      0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82
      .44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
      0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/>
  </svg>
);

/** Two compact header badges: Portfolio + GitHub */
export default function GithubBadge() {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      {/* Portfolio */}
      <a href={PORTFOLIO_URL} target="_blank" rel="noopener noreferrer"
        title="Akshith Sai Kondamadugu — Portfolio"
        style={{ ...badgeBase, color: "#b0bdd4" }}
        onMouseOver={e => e.currentTarget.style.color = "#00e5a0"}
        onMouseOut={e  => e.currentTarget.style.color = "#b0bdd4"}
      >
        <PortfolioIcon /> Portfolio
      </a>

      {/* GitHub */}
      <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
        title="DynamicBI on GitHub"
        style={{ ...badgeBase, color: "#b0bdd4" }}
        onMouseOver={e => e.currentTarget.style.color = "#00d4ff"}
        onMouseOut={e  => e.currentTarget.style.color = "#b0bdd4"}
      >
        <GithubIcon /> GitHub
      </a>
    </div>
  );
}
