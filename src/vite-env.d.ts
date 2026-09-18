/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'gun' {
  const Gun: (options?: Record<string, unknown>) => any
  export default Gun
}
