export interface Waypoint {
  id: string
  name: string
  description: string
  lat: number
  lng: number
}

export interface WaypointLink {
  id: string
  fromId: string
  toId: string
}

export interface MapState {
  center: [number, number]
  zoom: number
  waypoints: Waypoint[]
  links: WaypointLink[]
}

export interface Preset {
  id: string
  name: string
  createdAt: number
  state: MapState
}
