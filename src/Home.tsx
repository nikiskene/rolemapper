import { Planner } from './Planner'
import './home.css'

export function Brand() {
  return <a className="site-brand" href="/" aria-label="Rolemapper home">
    <img src="/brand/logo.png" alt="Rolemapper" width="640" height="213"/>
  </a>
}

function SiteHeader() {
  return <header className="site-header"><div className="site-wrap site-nav">
    <Brand/>
    <nav aria-label="Main navigation">
      <a href="/#about">About</a>
      <a href="/#pricing">Pricing</a>
      <a href="/planner">Team planner</a>
    </nav>
    <a className="site-button secondary login-link" href="/login">Log in</a>
  </div></header>
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="site-wrap footer-layout">
    <div><Brand/><p>Operated by IACy International FZCO.</p></div>
    <nav aria-label="Legal"><a href="/legal">Legal notice</a><a href="/privacy">Privacy & GDPR</a><a href="/terms">Terms</a><a href="/cookies">Cookies & storage</a></nav>
  </div></footer>
}

export function Homepage() {
  return <div className="marketing">
    <SiteHeader/>
    <main id="main">
      <section className="site-hero" aria-labelledby="hero-title">
        <picture className="hero-art" aria-hidden="true">
          <source media="(max-width: 720px)" srcSet="/brand/hero-mobile.webp"/>
          <img src="/brand/hero-desktop.webp" alt="" width="1672" height="941" fetchPriority="high"/>
        </picture>
        <div className="site-wrap hero-content"><div>
          <h1 id="hero-title">Map your team.<br/><em>Plan your growth.</em></h1>
          <p>See who’s around your company, spot the roles you’re missing, and put a budget behind your next hires.</p>
          <div className="site-actions">
            <a className="site-button" href="/signup">Start for free</a>
            <a className="site-button secondary" href="/planner">Plan my team <span aria-hidden="true">↗</span></a>
          </div>
        </div></div>
      </section>
      <section id="about" className="site-wrap site-section">
        <div className="section-intro"><p className="site-kicker">About Rolemapper</p><h2>Make the people around your company visible.</h2></div>
        <div className="about-columns">
          <article><h3>See who’s involved</h3><p>Put founders, employees, advisors, investors and partners on one private map. Move cards as roles change.</p></article>
          <article><h3>See where the gaps are</h3><p>Give open roles a place on the map. Make it clear which responsibilities are covered and which still need an owner.</p></article>
          <article><h3>Decide what comes next</h3><p>Use the team planner to turn a growth goal into a suggested starting team, hiring phases and a budget.</p></article>
        </div>
      </section>
      <section className="site-planner-callout">
        <div className="site-wrap callout-layout"><div><h2>What team would get you to your next goal?</h2><p>Start with a few questions about your team and your target. Use your own cost estimates to see how the hiring plan adds up.</p></div>
        <a className="site-button" href="/planner">Try the team planner <span aria-hidden="true">↗</span></a></div>
      </section>
      <section id="pricing" className="site-wrap site-section">
        <div className="section-intro"><p className="site-kicker">Pricing</p><h2>Five people free.</h2><p>One person can hold several roles and still counts once.</p></div>
        <div className="price-grid">
          <article className="price-card"><h3>Free</h3><p className="price"><strong>$0</strong></p><p>Map up to five people.</p><a className="site-button secondary" href="/signup">Create a free account</a></article>
          <article className="price-card paid"><h3>Paid plan</h3><p className="price"><strong>$10</strong> USD / year / company</p><p>For maps with six or more people.</p><p className="plan-note">Paid subscriptions are coming soon.</p></article>
        </div>
      </section>
    </main>
    <SiteFooter/>
  </div>
}

export function PlannerPage() {
  return <div className="marketing"><SiteHeader/><main className="site-wrap site-section planner-page">
    <p className="site-kicker">Team planner</p><h1>Build a hiring plan</h1>
    <p>Get a suggested starting team, hiring phases and an estimated budget. Your answers stay in this page.</p>
    <Planner/>
  </main><SiteFooter/></div>
}

const contact = <a href="mailto:hello@iacy.com">hello@iacy.com</a>
const privacy = <>
  <h2>Who is responsible for your data?</h2>
  <p>IACy International FZCO, United Arab Emirates, operates Rolemapper and is the controller for account and site operations. Contact {contact} for privacy questions and requests.</p>
  <h2>What we process and why</h2>
  <p>We use your email and account information to create and authenticate your account. Supabase Auth manages credentials. We store the company details and map content you enter so you can use the private workspace. The team planner runs in your browser and does not send your answers to us.</p>
  <p>Where GDPR applies, we process account and service data to provide the service you request. We use technical logs, which may include IP addresses and request information, for our legitimate interests in securing and maintaining the service. Where required, we process information to comply with legal obligations.</p>
  <p>When a workspace owner adds information about other people, the owner determines why that information is entered and is responsible for having a lawful basis, providing any required notice and responding to requests about that data. Rolemapper stores it to provide the workspace.</p>
  <h2>Providers and international processing</h2>
  <p>We use Netlify to host the site and Supabase for authentication and workspace storage. These providers may process data outside the country where you live. Contact us for information about the locations, transfer safeguards and how to obtain a copy of applicable safeguards.</p>
  <h2>Retention and your rights</h2>
  <p>We keep account and workspace data for as long as needed to provide the service. After a deletion request, data may remain for a limited period where needed for backups, security, dispute resolution or legal obligations.</p>
  <p>Depending on the law that applies, you can request access, correction, deletion, restriction or portability, object to processing, and complain to a relevant supervisory authority. Email {contact} to make a request. We may need to verify your identity.</p>
</>

const legalPages = {
  '/legal': {title:'Legal notice', content:<><h2>Operator</h2><p>Rolemapper is operated by IACy International FZCO, United Arab Emirates.</p><h2>Contact</h2><p>{contact}</p></>},
  '/privacy': {title:'Privacy & GDPR', content:privacy},
  '/terms': {title:'Terms of use', content:<>
    <h2>Using Rolemapper</h2><p>Rolemapper is a company mapping and planning service operated by IACy International FZCO. Keep your sign-in details secure and only add information you are entitled to use. You are responsible for the content you enter into your workspace.</p>
    <h2>Planning estimates</h2><p>The team planner uses the assumptions you enter and provides illustrative suggestions. Review hiring assumptions, local costs and legal requirements before acting on a plan.</p>
    <h2>Subscriptions</h2><p>Paid subscriptions are not available yet. Any future checkout will show the applicable price and billing terms before you subscribe.</p>
    <h2>Questions and account requests</h2><p>Contact {contact} for help with the service or to request account closure.</p>
  </>},
  '/cookies': {title:'Cookies & storage', content:<>
    <h2>Sign-in and workspace preferences</h2><p>The app uses browser storage to keep you signed in and remember which company you selected for the current browser session. Signing out ends your app session. You can clear stored information using your browser controls.</p>
    <h2>Marketing site and planner</h2><p>Rolemapper does not load analytics or advertising trackers. The planner keeps answers in the page while it is open. Reloading or closing it clears those answers.</p>
  </>},
} as const

export function LegalPage({path}:{path:string}) {
  const page = legalPages[path as keyof typeof legalPages]
  if (!page) return null
  return <div className="marketing"><SiteHeader/><main className="site-wrap site-section legal-page">
    <h1>{page.title}</h1>{page.content}
  </main><SiteFooter/></div>
}

export const isLegalPath = (path:string) => Object.hasOwn(legalPages,path)
