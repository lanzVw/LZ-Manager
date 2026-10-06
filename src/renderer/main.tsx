import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { OverlayApp } from './overlay/OverlayApp'
import { ThemeProvider } from './contexts/ThemeContext'
import { ToastProvider } from './components/ui/Toast'
import './index.css'

const isOverlay = window.location.hash.includes('overlay') || window.location.search.includes('overlay')

if (isOverlay) {
  document.documentElement.classList.add('overlay-mode')
  document.body.classList.add('overlay-mode')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        {isOverlay ? <OverlayApp /> : <App />}
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
)
