export interface WebRTCResult {
  publicIps: string[]
  leakDetected: boolean
}

const PRIVATE_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^::1$/,
  /^fc[0-9a-f]{2}:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
]

function isPublicIp(ip: string): boolean {
  return !PRIVATE_PATTERNS.some(re => re.test(ip))
}

function extractIps(candidate: string): string[] {
  const v4 = candidate.match(/\b(\d{1,3}\.){3}\d{1,3}\b/g) ?? []
  // Simple IPv6 extraction — match segments after 'raddr ' or between spaces
  const v6 = candidate.match(/\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/gi) ?? []
  return [...v4, ...v6]
}

async function gatherViaStun(stunUrls: string[]): Promise<string[]> {
  return new Promise(resolve => {
    const ips = new Set<string>()
    let done = false

    const finish = () => {
      if (done) return
      done = true
      try { pc.close() } catch { /* ignore */ }
      resolve([...ips])
    }

    let pc: RTCPeerConnection
    try {
      pc = new RTCPeerConnection({ iceServers: stunUrls.map(urls => ({ urls })) })
    } catch {
      return resolve([])
    }

    pc.createDataChannel('')
    pc.onicecandidate = e => {
      if (!e.candidate) { finish(); return }
      extractIps(e.candidate.candidate).forEach(ip => ips.add(ip))
    }
    pc.onicegatheringstatechange = () => {
      if (pc.iceGatheringState === 'complete') finish()
    }
    pc.createOffer()
      .then(o => pc.setLocalDescription(o))
      .catch(finish)

    // Hard timeout in case ICE gathering stalls
    setTimeout(finish, 4000)
  })
}

const STUN_GROUPS = [
  ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
  ['stun:stun.cloudflare.com:3478'],
  ['stun:stun.stunprotocol.org:3478'],
]

export async function detectWebRTCLeak(reportedPublicIp: string | null): Promise<WebRTCResult> {
  if (typeof RTCPeerConnection === 'undefined') {
    return { publicIps: [], leakDetected: false }
  }

  let allIps: string[] = []
  for (const group of STUN_GROUPS) {
    const ips = await gatherViaStun(group)
    allIps = [...allIps, ...ips]
    if (allIps.some(isPublicIp)) break
  }

  const publicIps = [...new Set(allIps.filter(isPublicIp))]

  const leakDetected =
    reportedPublicIp !== null &&
    publicIps.length > 0 &&
    !publicIps.includes(reportedPublicIp)

  return { publicIps, leakDetected }
}
