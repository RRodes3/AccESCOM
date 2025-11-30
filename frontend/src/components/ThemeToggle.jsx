// frontend/src/components/ThemeToggle.jsx
import { useTheme } from '../context/ThemeContext';
import '../styles/darkMode.css';

export default function ThemeToggle({ label = true, className = '' }) {
  const { isDark, toggleTheme } = useTheme();

  return (
    <div className={`d-flex align-items-center gap-2 ${className}`}>
      {label && <span style={{ fontSize: '0.9rem' }}>Modo oscuro</span>}
      <label className="theme-toggle">
        <input
          type="checkbox"
          checked={isDark}
          onChange={toggleTheme}
          aria-label="Alternar modo oscuro"
        />
        <span className="theme-toggle-slider"></span>
      </label>
    </div>
  );
}