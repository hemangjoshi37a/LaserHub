import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { Toaster } from 'sonner';
import { Settings } from 'lucide-react';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <nav className="navbar">
          <div className="nav-container">
            <Link to="/" className="nav-brand">
              <span className="logo">⚡</span>
              LaserHub
            </Link>
            <div className="nav-links">
              <Link to="/" className="nav-link">Home</Link>
              <Link to="/admin" className="nav-link admin-link">
                <Settings size={16} />
                Admin
              </Link>
            </div>
          </div>
        </nav>

        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin/*" element={<AdminPage />} />
          </Routes>
        </main>

        <footer className="footer">
          <p>
            © 2026 LaserHub. Open Source Laser Cutting Cost Calculator.
          </p>
          <p className="footer-links">
            <a href="https://github.com/your-username/LaserHub" target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            <span>•</span>
            <a href="https://github.com/your-username/LaserHub/blob/main/CONTRIBUTING.md" target="_blank" rel="noopener noreferrer">
              Contribute
            </a>
          </p>
        </footer>

        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  );
}

export default App;
