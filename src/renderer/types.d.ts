import { LZApi, FlairXApi } from '../preload'

declare global {
  interface Window {
    lz: LZApi
    flairx: FlairXApi
  }
}
