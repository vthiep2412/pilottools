// Earth radius in Nautical Miles (6371 km / 1.852 km/NM)
const EARTH_RADIUS_NM = 3440.065

/**
 * Calculates Great-Circle distance between two coordinates in Nautical Miles (NM)
 */
export function calculateDistanceNM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distance = EARTH_RADIUS_NM * c
  return Math.round(distance * 10) / 10
}

/**
 * Calculates initial True Course (degrees clockwise from True North: 000° to 359°)
 */
export function calculateTrueCourse(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = (lat1 * Math.PI) / 180
  const phi2 = (lat2 * Math.PI) / 180
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)
  const theta = Math.atan2(y, x)
  const bearing = ((theta * 180) / Math.PI + 360) % 360
  return Math.round(bearing)
}

/**
 * Calculates reciprocal inbound course (back from point 2 to point 1)
 */
export function calculateReciprocalCourse(lat2: number, lon2: number, lat1: number, lon1: number): number {
  return calculateTrueCourse(lat2, lon2, lat1, lon1)
}

/**
 * Formats degrees into a 3-digit aeronautical heading string (e.g. 044°, 106°)
 */
export function formatHeading(deg: number): string {
  const normalized = (Math.round(deg) % 360 + 360) % 360
  const val = normalized === 0 ? 360 : normalized
  return `${val.toString().padStart(3, '0')}°`
}

/**
 * Calculates midpoint between two coordinates
 */
export function calculateMidpoint(lat1: number, lon1: number, lat2: number, lon2: number): [number, number] {
  return [(lat1 + lat2) / 2, (lon1 + lon2) / 2]
}

/**
 * Linearly interpolates a coordinate between two coordinates at a given fraction (0 to 1)
 */
export function interpolatePoint(lat1: number, lon1: number, lat2: number, lon2: number, fraction: number): [number, number] {
  return [lat1 + (lat2 - lat1) * fraction, lon1 + (lon2 - lon1) * fraction]
}

/**
 * Calculates radial distance offsets in pixels for course badges radiating from a waypoint.
 * Staggers badges when corridors depart at narrow angular separations below 36 degrees to prevent overlap.
 */
export function calculateBadgeOffsetsForWaypoint(
  wpLat: number,
  wpLng: number,
  connectedLegs: Array<{
    linkId: string
    isFrom: boolean
    otherLat: number
    otherLng: number
    linePxLen: number
  }>
): Map<string, number> {
  const result = new Map<string, number>()
  if (connectedLegs.length === 0) return result

  const BASE_OFFSET = 48
  const STEP_PX = 28

  if (connectedLegs.length === 1) {
    const leg = connectedLegs[0]
    const maxOffset = Math.max(24, leg.linePxLen * 0.38)
    result.set(`${leg.linkId}-${leg.isFrom ? 'from' : 'to'}`, Math.min(BASE_OFFSET, maxOffset))
    return result
  }

  // Calculate radiating departure bearing for each leg leaving this waypoint
  const legsWithBearing = connectedLegs.map((leg) => ({
    ...leg,
    bearing: calculateTrueCourse(wpLat, wpLng, leg.otherLat, leg.otherLng),
  }))

  // Sort clockwise 0 to 360
  legsWithBearing.sort((a, b) => a.bearing - b.bearing)

  const angleDiff = (deg1: number, deg2: number) => {
    const diff = Math.abs(deg1 - deg2) % 360
    return diff > 180 ? 360 - diff : diff
  }

  const n = legsWithBearing.length
  const steps = new Array(n).fill(0)

  for (let i = 1; i < n; i++) {
    if (angleDiff(legsWithBearing[i].bearing, legsWithBearing[i - 1].bearing) < 36) {
      steps[i] = steps[i - 1] + 1
    }
  }

  // Check circular wrap around between sorted 0 and n - 1
  if (n > 1 && angleDiff(legsWithBearing[0].bearing, legsWithBearing[n - 1].bearing) < 36) {
    if (steps[0] === steps[n - 1]) {
      steps[0] = steps[n - 1] + 1
      for (let i = 1; i < n; i++) {
        if (angleDiff(legsWithBearing[i].bearing, legsWithBearing[i - 1].bearing) < 36 && steps[i] <= steps[i - 1]) {
          steps[i] = steps[i - 1] + 1
        } else {
          break
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const leg = legsWithBearing[i]
    const stepLevel = steps[i] % 3
    const desiredOffset = BASE_OFFSET + stepLevel * STEP_PX
    const maxOffset = Math.max(24, leg.linePxLen * 0.38)
    const finalOffset = Math.min(desiredOffset, maxOffset)
    result.set(`${leg.linkId}-${leg.isFrom ? 'from' : 'to'}`, finalOffset)
  }

  return result
}

