// 全局类型声明。
// 注意：本文件必须保持为"环境声明文件"（无顶层 import/export，也不用 declare global 包装——
// 那只在模块文件中有效），interface Window 直接声明在全局作用域即可生效。
interface Window {
  lz: import('../preload').LZApi
  flairx: import('../preload').FlairXApi
}

declare module '*.css'
declare module '*.png' {
  const content: string
  export default content
}
declare module '*.webp' {
  const content: string
  export default content
}
declare module '*.svg' {
  const content: string
  export default content
}
