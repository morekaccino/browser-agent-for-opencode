/** Minimal declarations for the Bun runtime that hosts the opencode service. */
declare const Bun: {
  serve(options: {
    hostname?: string
    port?: number
    fetch: (request: Request, server: any) => Response | undefined
    websocket: {
      open: (ws: any) => void
      message: (ws: any, raw: any) => void
      close: (ws: any) => void
    }
  }): any
}
