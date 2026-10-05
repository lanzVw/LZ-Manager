import { FlairXApi } from '../preload'

declare global {
  interface Window {
    flairx: FlairXApi
  }
}
