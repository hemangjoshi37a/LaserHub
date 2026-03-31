import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { AdminPage } from './pages/AdminPage';
import { Toaster } from 'sonner';
import { Settings, Sun, Moon } from 'lucide-react';
import './App.css';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

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
              <button 
                onClick={toggleDarkMode} 
                className="theme-toggle"
                aria-label="Toggle theme"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>
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
          <p>&copy; 2026 LaserHub &middot; Open-source laser cutting cost calculator</p>
        </footer>

        <Toaster position="top-right" richColors />
      </div>
    </BrowserRouter>
  );
}

export default App;
