// Navigation bar of the demo (style of the EOF-EOS validator: see styles/demo.css).
export default function Navbar() {
  return (
    <nav className="navbar">
      <span className="navbar-brand">JSON Schema Viewer</span>
      <div className="navbar-links">
        <a href="./" className="nav-link active" aria-current="page">
          UML
        </a>
      </div>
    </nav>
  );
}
