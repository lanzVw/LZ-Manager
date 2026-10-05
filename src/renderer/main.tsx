import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { OverlayApp } from './overlay/OverlayApp'
import './index.css'

const isOverlay = window.location.hash.includes('overlay') || window.location.search.includes('overlay')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isOverlay ? <OverlayApp /> : <App />}
  </React.StrictMode>
)
