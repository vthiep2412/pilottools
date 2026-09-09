export interface Coordinates {
  lat: number
  lng: number
}

export interface NavigationResult {
  distanceNM: number
  trueCourseDeg: number
  reciprocalCourseDeg: number
}

const R_NM = 3440.065

export const toRad = (deg: number): number => deg * (Math.PI / 180)
export const toDeg = (rad: number): number => rad * (180 / Math.PI)

/**
 * Great-circle distance in Nautical Miles using the Haversine formula
 */
export function calculateDistanceNM(p1: Coordinates, p2: Coordinates): number {
  const phi1 = toRad(p1.lat)
  const phi2 = toRad(p2.lat)
  const deltaPhi = toRad(p2.lat - p1.lat)
  const deltaLambda = toRad(p2.lng - p1.lng)

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R_NM * c
}

/**
 * Initial True Course (Great-circle forward azimuth)
 */
export function calculateTrueCourse(p1: Coordinates, p2: Coordinates): number {
  const phi1 = toRad(p1.lat)
  const phi2 = toRad(p2.lat)
  const deltaLambda = toRad(p2.lng - p1.lng)

  const y = Math.sin(deltaLambda) * Math.cos(phi2)
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda)

  const bearing = toDeg(Math.atan2(y, x))
  return (bearing + 360) % 360
}

/**
 * Full navigational calculation between two coordinates
 */
export function calculateNavigation(p1: Coordinates, p2: Coordinates): NavigationResult {
  const distanceNM = calculateDistanceNM(p1, p2)
  const trueCourseDeg = calculateTrueCourse(p1, p2)
  const reciprocalCourseDeg = (trueCourseDeg + 180) % 360

  return {
    distanceNM,
    trueCourseDeg,
    reciprocalCourseDeg,
  }
}

/**
 * Aviation format for coordinates with cardinal points
 */
export function formatAviationCoordinates(coords: Coordinates): string {
  const latDir = coords.lat >= 0 ? 'N' : 'S'
  const lngDir = coords.lng >= 0 ? 'E' : 'W'
  const absLat = Math.abs(coords.lat).toFixed(4)
  const absLng = Math.abs(coords.lng).toFixed(4)
  return `${absLat}° ${latDir}, ${absLng}° ${lngDir}`
}
