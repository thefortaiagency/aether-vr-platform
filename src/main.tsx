import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// StrictMode disabled - causes double-mounting which breaks Three.js texture loading
createRoot(document.getElementById('root')!).render(
  <App />
)
