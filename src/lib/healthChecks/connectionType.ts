export interface ConnectionInfo {
  type: string | null
  effectiveType: string | null
}

export function getConnectionType(): ConnectionInfo {
  type NavWithConn = Navigator & {
    connection?: { type?: string; effectiveType?: string }
  }
  const conn = (navigator as NavWithConn).connection
  if (!conn) return { type: null, effectiveType: null }
  return {
    type: conn.type ?? null,
    effectiveType: conn.effectiveType ?? null,
  }
}
