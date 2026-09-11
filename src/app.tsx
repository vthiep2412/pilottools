import { useEffect, useRef, useState } from 'preact/hooks'
import L from 'leaflet'
import { Plus, X, Check, Trash2, Menu, Link2 } from 'lucide-preact'
import { Waypoint, WaypointLink, MapState, Preset } from './types'
import { Sidebar } from './components/Sidebar'
import { SavePresetModal, LoadPresetModal, DeletePresetModal } from './components/Modals'
import {
  calculateDistanceNM,
  calculateTrueCourse,
  calculateReciprocalCourse,
  formatHeading,
  interpolatePoint,
  calculateBadgeOffsetsForWaypoint,
} from './utils/geo'

const STORAGE_MAP_KEY = 'pilottools_map_state'
const STORAGE_PRESETS_KEY = 'pilottools_presets'

export function App() {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const waypointsLayerRef = useRef<L.LayerGroup | null>(null)
  const linksLayerRef = useRef<L.LayerGroup | null>(null)
  const tempLineRef = useRef<L.Polyline | null>(null)

  const routeLinesRef = useRef<
    Array<{
      linkId: string
      fromId: string
      toId: string
      casingLine: L.Polyline
      line: L.Polyline
      outboundMarker: L.Marker
      inboundMarker: L.Marker
      distMarker: L.Marker
    }>
  >([])
  const editCardRef = useRef<HTMLDivElement>(null)
  const markersMapRef = useRef<Map<string, L.Marker>>(new Map())

  const [mapState, setMapState] = useState<MapState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MAP_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          center: parsed.center || [10.0, 105.5],
          zoom: parsed.zoom || 9,
          waypoints: parsed.waypoints || [],
          links: parsed.links || [],
        }
      }
    } catch {
      // Fallback
    }
    return {
      center: [10.0, 105.5],
      zoom: 9,
      waypoints: [],
      links: [],
    }
  })

  const [presets, setPresets] = useState<Preset[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PRESETS_KEY)
      if (saved) return JSON.parse(saved)
    } catch {
      // Fallback
    }
    return []
  })

  const historyPastRef = useRef<MapState[]>([])
  const historyFutureRef = useRef<MapState[]>([])
  const mapStateRef = useRef<MapState>(mapState)
  mapStateRef.current = mapState

  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(null)
  const [hoveredWaypointId, setHoveredWaypointId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{ name: string; description: string }>({ name: '', description: '' })
  const [, setRenderTick] = useState(0)

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; lat: number; lng: number } | null>(null)
  const [linkingSourceId, setLinkingSourceId] = useState<string | null>(null)
  const linkingSourceIdRef = useRef<string | null>(null)
  linkingSourceIdRef.current = linkingSourceId

  const [activeLinkId, setActiveLinkId] = useState<string | null>(null)
  const activeLinkIdRef = useRef<string | null>(null)
  activeLinkIdRef.current = activeLinkId
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false)

  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false)
  const [newPresetName, setNewPresetName] = useState<string>('')
  const [loadPresetTarget, setLoadPresetTarget] = useState<Preset | null>(null)
  const [deletePresetTarget, setDeletePresetTarget] = useState<Preset | null>(null)

  const [confirmDeleteWpId, setConfirmDeleteWpId] = useState<string | null>(null)
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveStateToStorage = (newState: MapState) => {
    try {
      localStorage.setItem(STORAGE_MAP_KEY, JSON.stringify(newState))
    } catch {
      // Ignore
    }
  }

  const saveMapPositionToStorage = (center: [number, number], zoom: number) => {
    try {
      const raw = localStorage.getItem(STORAGE_MAP_KEY)
      if (raw) {
        const existing = JSON.parse(raw)
        existing.center = center
        existing.zoom = zoom
        localStorage.setItem(STORAGE_MAP_KEY, JSON.stringify(existing))
        return
      }
      localStorage.setItem(
        STORAGE_MAP_KEY,
        JSON.stringify({ center, zoom, waypoints: [], links: [] })
      )
    } catch {
      // Ignore
    }
  }

  const savePresetsToStorage = (newPresets: Preset[]) => {
    try {
      localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(newPresets))
    } catch (err) {
      console.warn('Failed to save presets to storage', err)
    }
  }

  const cloneMapState = (source: MapState): MapState => ({
    center: [source.center[0], source.center[1]],
    zoom: source.zoom,
    waypoints: source.waypoints.map((w) => ({ ...w })),
    links: source.links.map((l) => ({ ...l })),
  })

  const pushState = (newState: MapState) => {
    historyPastRef.current.push(mapStateRef.current)
    historyFutureRef.current = []
    mapStateRef.current = newState
    setMapState(newState)
    saveStateToStorage(newState)
  }

  const undo = () => {
    if (historyPastRef.current.length === 0) return
    const prev = historyPastRef.current.pop()!
    historyFutureRef.current.unshift(mapStateRef.current)
    mapStateRef.current = prev
    setMapState(prev)
    saveStateToStorage(prev)
    setSelectedWaypointId(null)
  }

  const redo = () => {
    if (historyFutureRef.current.length === 0) return
    const next = historyFutureRef.current.shift()!
    historyPastRef.current.push(mapStateRef.current)
    mapStateRef.current = next
    setMapState(next)
    saveStateToStorage(next)
    setSelectedWaypointId(null)
  }

  const startEditWaypoint = (wp: Waypoint) => {
    setActiveLinkId(null)
    setSelectedWaypointId(wp.id)
    setEditForm({ name: wp.name, description: wp.description })
  }

  const cancelEditWaypoint = () => {
    setSelectedWaypointId(null)
  }

  const saveEditWaypoint = () => {
    if (!selectedWaypointId) return
    const nextWps = mapState.waypoints.map((w) =>
      w.id === selectedWaypointId ? { ...w, name: editForm.name.trim() || w.name, description: editForm.description.trim() } : w
    )
    pushState({ ...mapState, waypoints: nextWps })
    setSelectedWaypointId(null)
  }

  const createLinkBetweenWaypoints = (srcId: string, targetId: string): boolean => {
    if (srcId === targetId) return false
    const existing = mapStateRef.current.links.some(
      (l) =>
        (l.fromId === srcId && l.toId === targetId) ||
        (l.fromId === targetId && l.toId === srcId)
    )
    if (!existing) {
      const newLink: WaypointLink = {
        id: crypto.randomUUID(),
        fromId: srcId,
        toId: targetId,
      }
      pushState({
        ...mapStateRef.current,
        links: [...mapStateRef.current.links, newLink],
      })
      return true
    }
    return false
  }

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const map = L.map(mapContainerRef.current, {
      attributionControl: false,
      zoomControl: true,
      doubleClickZoom: false,
    }).setView(mapState.center, mapState.zoom)

    const googleNormal = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
      maxZoom: 20,
    })

    const googleSatellite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 20,
    })

    googleNormal.addTo(map)

    L.control
      .layers(
        {
          'Google Normal': googleNormal,
          'Google Satellite': googleSatellite,
        },
        undefined,
        { position: 'topright' }
      )
      .addTo(map)

    const waypointsGroup = L.layerGroup().addTo(map)
    const linksGroup = L.layerGroup().addTo(map)
    waypointsLayerRef.current = waypointsGroup
    linksLayerRef.current = linksGroup

    mapInstanceRef.current = map

    let isInitialMount = true
    let mountTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      isInitialMount = false
      mountTimer = null
    }, 500)

    map.on('moveend zoomend', () => {
      const center = map.getCenter()
      const zoom = map.getZoom()
      setMapState((curr) => {
        const next = {
          ...curr,
          center: [center.lat, center.lng] as [number, number],
          zoom,
        }
        mapStateRef.current = next
        return next
      })
      if (!isInitialMount) {
        saveMapPositionToStorage([center.lat, center.lng], zoom)
      }
    })

    // Real-time smooth tooltip repositioning while panning or zooming
    let moveRaf: number | null = null
    const onMapMove = () => {
      if (moveRaf) return
      moveRaf = requestAnimationFrame(() => {
        moveRaf = null
        setRenderTick((t) => t + 1)
      })
    }
    map.on('move zoom', onMapMove)

    // Track right mouse drag to suppress context menu
    let rightMouseDownPos: { x: number; y: number } | null = null
    let didRightDrag = false

    // Custom Context Menu on right-click
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault()
      if (linkingSourceIdRef.current || didRightDrag) return
      setContextMenu({
        x: e.containerPoint.x,
        y: e.containerPoint.y,
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      })
    })

    // Auto-close context menu and active corridor selection on map interactions
    map.on('movestart zoomstart', () => {
      setContextMenu(null)
    })

    map.on('click', (e: L.LeafletMouseEvent) => {
      const origTarget = e.originalEvent?.target as HTMLElement | undefined
      if (origTarget && origTarget.closest('.mobile-toggle-btn, .mobile-fab-add, .sidebar')) {
        return
      }
      setContextMenu(null)
      setActiveLinkId(null)
      setSelectedWaypointId(null)
      setIsDrawerOpen(false)
    })

    const handleGlobalMouseDown = (e: MouseEvent) => {
      if (e.button === 2) {
        rightMouseDownPos = { x: e.clientX, y: e.clientY }
        didRightDrag = false
      }

      const target = e.target as HTMLElement

      // If clicking anywhere outside custom-context-menu, close it immediately
      if (target && !target.closest('.custom-context-menu')) {
        setContextMenu(null)
      }
    }

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target) return

      // If clicking outside distance badge, course badge and delete button, deselect active link
      if (!target.closest('.distance-badge') && !target.closest('.delete-link-btn') && !target.closest('.course-badge')) {
        setActiveLinkId(null)
      }

      // If clicking on map background outside pins, edit card and sidebar, unselect waypoint
      if (
        !target.closest('.waypoint-pin') &&
        !target.closest('.waypoint-marker-container') &&
        !target.closest('.waypoint-edit-card') &&
        !target.closest('.sidebar') &&
        !target.closest('.custom-context-menu') &&
        !target.closest('.modal-overlay') &&
        (target.classList.contains('leaflet-container') ||
          target.classList.contains('map-view') ||
          target.classList.contains('leaflet-tile') ||
          target.closest('.leaflet-tile-pane') ||
          target.closest('.leaflet-pane'))
      ) {
        setSelectedWaypointId(null)
      }
    }

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (rightMouseDownPos) {
        const dist = Math.hypot(e.clientX - rightMouseDownPos.x, e.clientY - rightMouseDownPos.y)
        if (dist > 5) {
          didRightDrag = true
          setContextMenu(null)
        }
      }
    }

    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        rightMouseDownPos = null
      }
    }

    const handleGlobalContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setContextMenu(null)
        setLinkingSourceId(null)
        if (tempLineRef.current) {
          tempLineRef.current.remove()
          tempLineRef.current = null
        }
        setSaveModalOpen(false)
        setLoadPresetTarget(null)
        setDeletePresetTarget(null)
        setSelectedWaypointId(null)
        setActiveLinkId(null)
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault()
        redo()
        return
      }
    }

    window.addEventListener('mousedown', handleGlobalMouseDown, true)
    window.addEventListener('click', handleGlobalClick)
    window.addEventListener('mousemove', handleGlobalMouseMove)
    window.addEventListener('mouseup', handleGlobalMouseUp)
    window.addEventListener('contextmenu', handleGlobalContextMenu)
    window.addEventListener('keydown', handleGlobalKeyDown)

    return () => {
      if (mountTimer) {
        clearTimeout(mountTimer)
        mountTimer = null
      }
      if (deleteTimerRef.current) {
        clearTimeout(deleteTimerRef.current)
        deleteTimerRef.current = null
      }
      if (moveRaf) cancelAnimationFrame(moveRaf)
      window.removeEventListener('mousedown', handleGlobalMouseDown, true)
      window.removeEventListener('click', handleGlobalClick)
      window.removeEventListener('mousemove', handleGlobalMouseMove)
      window.removeEventListener('mouseup', handleGlobalMouseUp)
      window.removeEventListener('contextmenu', handleGlobalContextMenu)
      window.removeEventListener('keydown', handleGlobalKeyDown)
      map.remove()
      mapInstanceRef.current = null
    }
  }, [])

  const updateCorridorsForWaypoint = (wpId: string, currentPos: L.LatLng) => {
    const map = mapInstanceRef.current
    if (!map) return

    const connectedLegs: Array<{
      linkId: string
      isFrom: boolean
      otherLat: number
      otherLng: number
      linePxLen: number
    }> = []

    for (const item of routeLinesRef.current) {
      if (item.fromId === wpId || item.toId === wpId) {
        const isFrom = item.fromId === wpId
        const otherWpId = isFrom ? item.toId : item.fromId
        const otherWp = mapStateRef.current.waypoints.find((w) => w.id === otherWpId)
        if (otherWp) {
          const fromPt = map.latLngToContainerPoint(isFrom ? currentPos : [otherWp.lat, otherWp.lng])
          const toPt = map.latLngToContainerPoint(isFrom ? [otherWp.lat, otherWp.lng] : currentPos)
          const linePxLen = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y)
          connectedLegs.push({
            linkId: item.linkId,
            isFrom,
            otherLat: otherWp.lat,
            otherLng: otherWp.lng,
            linePxLen,
          })
        }
      }
    }

    const draggedOffsets = calculateBadgeOffsetsForWaypoint(currentPos.lat, currentPos.lng, connectedLegs)

    for (const item of routeLinesRef.current) {
      if (item.fromId === wpId || item.toId === wpId) {
        const isFrom = item.fromId === wpId
        const otherWpId = isFrom ? item.toId : item.fromId
        const otherWp = mapStateRef.current.waypoints.find((w) => w.id === otherWpId)
        if (otherWp) {
          const otherPos = L.latLng(otherWp.lat, otherWp.lng)
          const fromPos = isFrom ? currentPos : otherPos
          const toPos = isFrom ? otherPos : currentPos

          item.casingLine.setLatLngs([fromPos, toPos])
          item.line.setLatLngs([fromPos, toPos])

          const dist = calculateDistanceNM(fromPos.lat, fromPos.lng, toPos.lat, toPos.lng)
          const outboundDeg = calculateTrueCourse(fromPos.lat, fromPos.lng, toPos.lat, toPos.lng)
          const inboundDeg = calculateReciprocalCourse(toPos.lat, toPos.lng, fromPos.lat, fromPos.lng)

          const fromPt = map.latLngToContainerPoint(fromPos)
          const toPt = map.latLngToContainerPoint(toPos)
          const linePxLen = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y)

          const outOffsetPx = isFrom
            ? (draggedOffsets.get(`${item.linkId}-from`) || 48)
            : 48
          const inOffsetPx = !isFrom
            ? (draggedOffsets.get(`${item.linkId}-to`) || 48)
            : 48

          const outFrac = Math.max(0.06, Math.min(0.44, outOffsetPx / linePxLen))
          const inFrac = Math.max(0.56, Math.min(0.94, (linePxLen - inOffsetPx) / linePxLen))

          const outboundPos = interpolatePoint(fromPos.lat, fromPos.lng, toPos.lat, toPos.lng, outFrac)
          const inboundPos = interpolatePoint(fromPos.lat, fromPos.lng, toPos.lat, toPos.lng, inFrac)

          if (!isNaN(outboundPos[0]) && !isNaN(outboundPos[1])) {
            item.outboundMarker.setLatLng(outboundPos)
            const outEl = item.outboundMarker.getElement()?.querySelector('.course-badge')
            if (outEl && !isNaN(outboundDeg)) outEl.textContent = formatHeading(outboundDeg)
          }

          if (!isNaN(inboundPos[0]) && !isNaN(inboundPos[1])) {
            item.inboundMarker.setLatLng(inboundPos)
            const inEl = item.inboundMarker.getElement()?.querySelector('.course-badge')
            if (inEl && !isNaN(inboundDeg)) inEl.textContent = formatHeading(inboundDeg)
          }

          const midPos = interpolatePoint(fromPos.lat, fromPos.lng, toPos.lat, toPos.lng, 0.5)
          if (!isNaN(midPos[0]) && !isNaN(midPos[1])) {
            item.distMarker.setLatLng(midPos)
            const distEl = item.distMarker.getElement()?.querySelector('.distance-text')
            if (distEl && !isNaN(dist)) distEl.textContent = `${dist} NM`
          }
        }
      }
    }
  }

  const startUnifiedDrag = (wpId: string, e: MouseEvent | PointerEvent) => {
    if (e.button !== 0) return
    const map = mapInstanceRef.current
    const marker = markersMapRef.current.get(wpId)
    if (!marker || !map) return

    e.preventDefault()
    e.stopPropagation()

    const target = e.currentTarget as HTMLElement | null
    const pointerId = (e as PointerEvent).pointerId

    if (target && target.setPointerCapture && pointerId !== undefined) {
      try {
        target.setPointerCapture(pointerId)
      } catch {
        // Ignore
      }
    }

    const initialPinPt = map.latLngToContainerPoint(marker.getLatLng())
    const initialPointerPt = map.mouseEventToContainerPoint(e)
    const grabOffset = {
      x: initialPointerPt.x - initialPinPt.x,
      y: initialPointerPt.y - initialPinPt.y,
    }

    document.body.classList.add('is-waypoint-dragging')
    editCardRef.current?.classList.add('dragging')
    map.dragging.disable()

    let moved = false

    const onPointerMove = (moveEvt: PointerEvent) => {
      moved = true
      const curPointerPt = map.mouseEventToContainerPoint(moveEvt)
      const targetPinPt = L.point(curPointerPt.x - grabOffset.x, curPointerPt.y - grabOffset.y)
      const newLatLng = map.containerPointToLatLng(targetPinPt)
      marker.setLatLng(newLatLng)

      if (editCardRef.current) {
        editCardRef.current.style.left = `${targetPinPt.x}px`
        editCardRef.current.style.top = `${targetPinPt.y + 24}px`
      }

      updateCorridorsForWaypoint(wpId, newLatLng)
    }

    const onPointerUp = () => {
      if (target && target.releasePointerCapture && pointerId !== undefined) {
        try {
          target.releasePointerCapture(pointerId)
        } catch {
          // Ignore
        }
      }

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)

      document.body.classList.remove('is-waypoint-dragging')
      editCardRef.current?.classList.remove('dragging')
      map.dragging.enable()

      if (moved) {
        const finalPos = marker.getLatLng()
        const updatedWps = mapStateRef.current.waypoints.map((w) =>
          w.id === wpId ? { ...w, lat: finalPos.lat, lng: finalPos.lng } : w
        )
        pushState({
          ...mapStateRef.current,
          waypoints: updatedWps,
        })
      }
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  // Sync Waypoints and Links to Leaflet
  useEffect(() => {
    const map = mapInstanceRef.current
    const wGroup = waypointsLayerRef.current
    const lGroup = linksLayerRef.current
    if (!map || !wGroup || !lGroup) return

    wGroup.clearLayers()
    lGroup.clearLayers()
    routeLinesRef.current = []
    markersMapRef.current.clear()

    const wpMap = new Map<string, Waypoint>()
    mapState.waypoints.forEach((w) => wpMap.set(w.id, w))

    // Pre-calculate staggered badge offsets per waypoint to prevent collision on narrow diverging routes
    const offsetMap = new Map<string, number>()
    mapState.waypoints.forEach((wp) => {
      const connectedLegs: Array<{
        linkId: string
        isFrom: boolean
        otherLat: number
        otherLng: number
        linePxLen: number
      }> = []

      mapState.links.forEach((l) => {
        if (l.fromId === wp.id) {
          const other = wpMap.get(l.toId)
          if (other) {
            const p1 = map.latLngToContainerPoint([wp.lat, wp.lng])
            const p2 = map.latLngToContainerPoint([other.lat, other.lng])
            connectedLegs.push({
              linkId: l.id,
              isFrom: true,
              otherLat: other.lat,
              otherLng: other.lng,
              linePxLen: Math.hypot(p2.x - p1.x, p2.y - p1.y),
            })
          }
        } else if (l.toId === wp.id) {
          const other = wpMap.get(l.fromId)
          if (other) {
            const p1 = map.latLngToContainerPoint([wp.lat, wp.lng])
            const p2 = map.latLngToContainerPoint([other.lat, other.lng])
            connectedLegs.push({
              linkId: l.id,
              isFrom: false,
              otherLat: other.lat,
              otherLng: other.lng,
              linePxLen: Math.hypot(p2.x - p1.x, p2.y - p1.y),
            })
          }
        }
      })

      const wpOffsets = calculateBadgeOffsetsForWaypoint(wp.lat, wp.lng, connectedLegs)
      wpOffsets.forEach((val, key) => offsetMap.set(key, val))
    })

    // 1. Render Links with bordered, thicker and spacier dashed corridor
    mapState.links.forEach((link) => {
      const fromWp = wpMap.get(link.fromId)
      const toWp = wpMap.get(link.toId)
      if (!fromWp || !toWp) return

      const dist = calculateDistanceNM(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng)
      const outboundDeg = calculateTrueCourse(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng)
      const inboundDeg = calculateReciprocalCourse(toWp.lat, toWp.lng, fromWp.lat, fromWp.lng)

      const isSelected = activeLinkId === link.id
      const isAnyLinkSelected = Boolean(activeLinkId)
      const isDimmed = isAnyLinkSelected && !isSelected

      // Outer border / casing line
      const casingLine = L.polyline(
        [
          [fromWp.lat, fromWp.lng],
          [toWp.lat, toWp.lng],
        ],
        {
          color: isSelected ? '#78350f' : '#000000',
          weight: isSelected ? 7 : 6,
          opacity: isDimmed ? 0.15 : 0.95,
        }
      )

      // Inner dashed line: thicker and spacier
      const line = L.polyline(
        [
          [fromWp.lat, fromWp.lng],
          [toWp.lat, toWp.lng],
        ],
        {
          color: isSelected ? '#facc15' : '#f5f5f5',
          weight: isSelected ? 3.5 : 3,
          opacity: isDimmed ? 0.15 : 1,
          dashArray: isSelected ? '10, 8' : '14, 12',
        }
      )

      const toggleSelect = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e.originalEvent)
        setSelectedWaypointId(null)
        setActiveLinkId((curr) => (curr === link.id ? null : link.id))
      }

      casingLine.on('click', toggleSelect)
      line.on('click', toggleSelect)

      casingLine.addTo(lGroup)
      line.addTo(lGroup)

      // Position heading badges using staggered offsets along the corridor
      const fromPt = map.latLngToContainerPoint([fromWp.lat, fromWp.lng])
      const toPt = map.latLngToContainerPoint([toWp.lat, toWp.lng])
      const linePxLen = Math.hypot(toPt.x - fromPt.x, toPt.y - fromPt.y)

      const outOffsetPx = offsetMap.get(`${link.id}-from`) || 48
      const inOffsetPx = offsetMap.get(`${link.id}-to`) || 48

      const outFrac = Math.max(0.06, Math.min(0.44, outOffsetPx / linePxLen))
      const inFrac = Math.max(0.56, Math.min(0.94, (linePxLen - inOffsetPx) / linePxLen))

      const outboundPos = interpolatePoint(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng, outFrac)
      const inboundPos = interpolatePoint(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng, inFrac)

      // Outbound course badge (right by departure pin, staggered if close angle)
      const outboundIcon = L.divIcon({
        className: `course-badge-container ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`,
        html: `<div class="course-badge outbound">${formatHeading(outboundDeg)}</div>`,
        iconSize: [52, 26],
        iconAnchor: [26, 13],
      })
      const outboundMarker = L.marker(outboundPos, { icon: outboundIcon, interactive: true }).addTo(lGroup)

      // Inbound reciprocal course badge (right by arrival pin, staggered if close angle)
      const inboundIcon = L.divIcon({
        className: `course-badge-container ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`,
        html: `<div class="course-badge inbound">${formatHeading(inboundDeg)}</div>`,
        iconSize: [52, 26],
        iconAnchor: [26, 13],
      })
      const inboundMarker = L.marker(inboundPos, { icon: inboundIcon, interactive: true }).addTo(lGroup)

      // Center distance badge (compact and dynamically centered)
      const midPos = interpolatePoint(fromWp.lat, fromWp.lng, toWp.lat, toWp.lng, 0.5)
      const distIcon = L.divIcon({
        className: `distance-badge-container ${isSelected ? 'selected' : ''} ${isDimmed ? 'dimmed' : ''}`,
        html: `<div class="distance-badge ${isSelected ? 'selected' : ''}"><span class="distance-text">${dist} NM</span>${isSelected ? `<button class="delete-link-btn" title="Delete Link">✕</button>` : ''}</div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      })

      const distMarker = L.marker(midPos, { icon: distIcon })
      distMarker.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent)
        const target = e.originalEvent.target as HTMLElement
        if (target && target.classList.contains('delete-link-btn')) {
          const nextLinks = mapState.links.filter((l) => l.id !== link.id)
          pushState({ ...mapState, links: nextLinks })
          setActiveLinkId(null)
          return
        }
        setSelectedWaypointId(null)
        setActiveLinkId((curr) => (curr === link.id ? null : link.id))
      })
      distMarker.addTo(lGroup)

      // Allow selecting corridor by clicking heading badges
      outboundMarker.on('click', toggleSelect)
      inboundMarker.on('click', toggleSelect)

      // Hover focus elevation across corridor line and badges
      const onHoverCorridor = () => {
        if (activeLinkIdRef.current) return
        for (const item of routeLinesRef.current) {
          const isCurrent = item.linkId === link.id
          const outEl = item.outboundMarker.getElement()
          const inEl = item.inboundMarker.getElement()
          const distEl = item.distMarker.getElement()
          if (isCurrent) {
            outEl?.classList.add('focused')
            outEl?.classList.remove('dimmed')
            inEl?.classList.add('focused')
            inEl?.classList.remove('dimmed')
            distEl?.classList.add('focused')
            distEl?.classList.remove('dimmed')
          } else {
            outEl?.classList.remove('focused')
            outEl?.classList.add('dimmed')
            inEl?.classList.remove('focused')
            inEl?.classList.add('dimmed')
            distEl?.classList.remove('focused')
            distEl?.classList.add('dimmed')
          }
        }
      }

      const onLeaveCorridor = () => {
        if (activeLinkIdRef.current) return
        for (const item of routeLinesRef.current) {
          const outEl = item.outboundMarker.getElement()
          const inEl = item.inboundMarker.getElement()
          const distEl = item.distMarker.getElement()
          outEl?.classList.remove('focused', 'dimmed')
          inEl?.classList.remove('focused', 'dimmed')
          distEl?.classList.remove('focused', 'dimmed')
        }
      }

      casingLine.on('mouseover', onHoverCorridor)
      casingLine.on('mouseout', onLeaveCorridor)
      line.on('mouseover', onHoverCorridor)
      line.on('mouseout', onLeaveCorridor)
      outboundMarker.on('mouseover', onHoverCorridor)
      outboundMarker.on('mouseout', onLeaveCorridor)
      inboundMarker.on('mouseover', onHoverCorridor)
      inboundMarker.on('mouseout', onLeaveCorridor)

      routeLinesRef.current.push({
        linkId: link.id,
        fromId: link.fromId,
        toId: link.toId,
        casingLine,
        line,
        outboundMarker,
        inboundMarker,
        distMarker,
      })
    })

    // 2. Render Waypoint Markers
    mapState.waypoints.forEach((wp) => {
      const isSelected = selectedWaypointId === wp.id
      const isLinkSource = linkingSourceId === wp.id
      const isAlreadyLinked = Boolean(
        linkingSourceId &&
        mapState.links.some(
          (l) =>
            (l.fromId === linkingSourceId && l.toId === wp.id) ||
            (l.fromId === wp.id && l.toId === linkingSourceId)
        )
      )
      const isLinkCandidate = Boolean(linkingSourceId && linkingSourceId !== wp.id && !isAlreadyLinked)

      const icon = L.divIcon({
        className: 'waypoint-marker-container',
        html: `
          <div class="waypoint-pin ${isSelected ? 'selected' : ''} ${isLinkSource ? 'link-source' : ''} ${isLinkCandidate ? 'link-candidate' : ''}" data-wpid="${wp.id}">
            <div class="pin-dot"></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      })

      const marker = L.marker([wp.lat, wp.lng], {
        icon,
        draggable: false,
      })

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e.originalEvent)
        if (linkingSourceIdRef.current) {
          if (linkingSourceIdRef.current !== wp.id) {
            createLinkBetweenWaypoints(linkingSourceIdRef.current, wp.id)
            setLinkingSourceId(null)
            startEditWaypoint(wp)
            return
          } else {
            setLinkingSourceId(null)
            return
          }
        }
        startEditWaypoint(wp)
      })

      marker.on('mouseover', () => {
        if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
          setHoveredWaypointId(wp.id)
        }
      })

      marker.on('mouseout', () => {
        setHoveredWaypointId((curr) => (curr === wp.id ? null : curr))
      })

      // Right click on marker: start route corridor link drawing
      marker.on('mousedown', (e: L.LeafletMouseEvent) => {
        if (e.originalEvent.button === 2) {
          L.DomEvent.stopPropagation(e.originalEvent)
          setLinkingSourceId(wp.id)

          if (!tempLineRef.current && mapInstanceRef.current) {
            tempLineRef.current = L.polyline([[wp.lat, wp.lng], [wp.lat, wp.lng]], {
              color: '#f59e0b',
              weight: 4.5,
              opacity: 0.95,
            }).addTo(mapInstanceRef.current)
          }
        }
      })

      markersMapRef.current.set(wp.id, marker)
      marker.addTo(wGroup)

      // Direct pointer capture drag on selected waypoint pin
      if (isSelected) {
        const markerEl = marker.getElement()
        if (markerEl) {
          const pinEl = markerEl.querySelector('.waypoint-pin') as HTMLElement | null
          const targetEl = pinEl || markerEl
          targetEl.onpointerdown = (e: PointerEvent) => {
            if (e.button === 0) {
              startUnifiedDrag(wp.id, e)
            }
          }
        }
      }
    })
  }, [mapState, selectedWaypointId, activeLinkId, linkingSourceId])

  // Handle right-click linking mousemove
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!linkingSourceIdRef.current || !tempLineRef.current) return
      const srcWp = mapState.waypoints.find((w) => w.id === linkingSourceIdRef.current)
      if (!srcWp) return

      const mouseLatLng = map.mouseEventToLatLng(e)
      tempLineRef.current.setLatLngs([[srcWp.lat, srcWp.lng], [mouseLatLng.lat, mouseLatLng.lng]])
    }

    const handleMouseUp = (e: MouseEvent) => {
      if (!linkingSourceIdRef.current) return
      if (e.button === 2) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY)
        const targetPin = elements.find((el) => el.classList.contains('waypoint-pin')) as HTMLElement | undefined

        if (targetPin && targetPin.dataset.wpid) {
          const targetWpId = targetPin.dataset.wpid
          const sourceWpId = linkingSourceIdRef.current

          if (targetWpId !== sourceWpId) {
            createLinkBetweenWaypoints(sourceWpId, targetWpId)
          }
        }

        if (tempLineRef.current) {
          tempLineRef.current.remove()
          tempLineRef.current = null
        }
        setLinkingSourceId(null)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [mapState])

  const handleCreateWaypoint = () => {
    if (!contextMenu) return
    const newWp: Waypoint = {
      id: crypto.randomUUID(),
      name: `WP-${mapState.waypoints.length + 1}`,
      description: 'Checkpoint',
      lat: contextMenu.lat,
      lng: contextMenu.lng,
    }
    pushState({
      ...mapState,
      waypoints: [...mapState.waypoints, newWp],
    })
    setContextMenu(null)
    startEditWaypoint(newWp)
  }

  const handleCreateWaypointAtCenter = () => {
    const map = mapInstanceRef.current
    if (!map) return
    const center = map.getCenter()
    const newWp: Waypoint = {
      id: crypto.randomUUID(),
      name: `WP-${mapState.waypoints.length + 1}`,
      description: 'Checkpoint',
      lat: center.lat,
      lng: center.lng,
    }
    pushState({
      ...mapState,
      waypoints: [...mapState.waypoints, newWp],
    })
    setContextMenu(null)
    startEditWaypoint(newWp)
  }

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return
    const preset: Preset = {
      id: crypto.randomUUID(),
      name: newPresetName.trim(),
      createdAt: Date.now(),
      state: cloneMapState(mapState),
    }
    const updated = [preset, ...presets]
    setPresets(updated)
    savePresetsToStorage(updated)
    setNewPresetName('')
    setSaveModalOpen(false)
  }

  const handleConfirmLoadPreset = () => {
    if (!loadPresetTarget) return
    const cloned = cloneMapState(loadPresetTarget.state)
    pushState(cloned)
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(cloned.center, cloned.zoom)
    }
    setLoadPresetTarget(null)
    setIsDrawerOpen(false)
  }

  const handleConfirmDeletePreset = () => {
    if (!deletePresetTarget) return
    const updated = presets.filter((p) => p.id !== deletePresetTarget.id)
    setPresets(updated)
    savePresetsToStorage(updated)
    setDeletePresetTarget(null)
  }

  const handleDeleteWaypointClick = (wpId: string) => {
    if (confirmDeleteWpId === wpId) {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setConfirmDeleteWpId(null)
      const nextWps = mapState.waypoints.filter((w) => w.id !== wpId)
      const nextLinks = mapState.links.filter((l) => l.fromId !== wpId && l.toId !== wpId)
      pushState({ ...mapState, waypoints: nextWps, links: nextLinks })
      if (selectedWaypointId === wpId) setSelectedWaypointId(null)
    } else {
      if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current)
      setConfirmDeleteWpId(wpId)
      deleteTimerRef.current = setTimeout(() => {
        setConfirmDeleteWpId(null)
      }, 5000)
    }
  }

  const handleFlyToWaypoint = (wp: Waypoint) => {
    if (linkingSourceIdRef.current && linkingSourceIdRef.current !== wp.id) {
      createLinkBetweenWaypoints(linkingSourceIdRef.current, wp.id)
      setLinkingSourceId(null)
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([wp.lat, wp.lng], Math.max(mapInstanceRef.current.getZoom(), 11), {
        duration: 0.8,
      })
    }
    startEditWaypoint(wp)
    setIsDrawerOpen(false)
  }

  const activeWp = mapState.waypoints.find((w) => w.id === selectedWaypointId)
  let activeWpPoint: L.Point | null = null
  if (activeWp && mapInstanceRef.current) {
    activeWpPoint = mapInstanceRef.current.latLngToContainerPoint([activeWp.lat, activeWp.lng])
  }

  const hoveredWp = mapState.waypoints.find((w) => w.id === hoveredWaypointId && w.id !== selectedWaypointId)
  let hoveredWpPoint: L.Point | null = null
  if (hoveredWp && mapInstanceRef.current) {
    hoveredWpPoint = mapInstanceRef.current.latLngToContainerPoint([hoveredWp.lat, hoveredWp.lng])
  }

  // Only show Save button if content actually changed
  const isFormChanged =
    activeWp &&
    (editForm.name.trim() !== activeWp.name || editForm.description.trim() !== activeWp.description)

  return (
    <div className="app-layout">
      {isDrawerOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      <Sidebar
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        presets={presets}
        waypoints={mapState.waypoints}
        selectedWaypointId={selectedWaypointId}
        confirmDeleteWpId={confirmDeleteWpId}
        onOpenSaveModal={() => setSaveModalOpen(true)}
        onSelectLoadPreset={(p) => setLoadPresetTarget(p)}
        onSelectDeletePreset={(p) => setDeletePresetTarget(p)}
        onFlyToWaypoint={handleFlyToWaypoint}
        onDeleteWaypointClick={handleDeleteWaypointClick}
        onReorderWaypoints={(newWps) => pushState({ ...mapState, waypoints: newWps })}
        onReorderPresets={(newPresets) => {
          setPresets(newPresets)
          savePresetsToStorage(newPresets)
        }}
      />

      <div className="map-view" ref={mapContainerRef}>
        {/* Mobile Sidebar Toggle Button */}
        <button
          className="mobile-toggle-btn"
          onClick={(e) => {
            e.stopPropagation()
            setIsDrawerOpen((prev) => !prev)
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={isDrawerOpen ? 'Close sidebar drawer' : 'Open sidebar drawer'}
          title={isDrawerOpen ? 'Close sidebar drawer' : 'Open sidebar drawer'}
        >
          {isDrawerOpen ? <X size={18} /> : <Menu size={18} />}
        </button>

        {/* Mobile Floating Action Button to Add Waypoint at Center */}
        <button
          className="mobile-fab-add"
          onClick={(e) => {
            e.stopPropagation()
            handleCreateWaypointAtCenter()
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="Add waypoint at center"
          title="Add waypoint at center"
        >
          <Plus size={22} />
        </button>
        {hoveredWp && hoveredWpPoint && !selectedWaypointId && (
          <div
            className="waypoint-3d-tooltip"
            style={{
              left: `${hoveredWpPoint.x}px`,
              top: `${hoveredWpPoint.y - 20}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="tooltip-title">{hoveredWp.name}</div>
            {hoveredWp.description && <div className="tooltip-desc">{hoveredWp.description}</div>}
          </div>
        )}

        {/* Edit Card with Conditional Save and Red Delete */}
        {activeWp && activeWpPoint && (
          <div
            ref={editCardRef}
            className="waypoint-edit-card"
            style={{
              left: `${activeWpPoint.x}px`,
              top: `${activeWpPoint.y + 24}px`,
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div
              className="edit-card-header"
              onPointerDown={(e) => {
                if (
                  e.button === 0 &&
                  !(e.target as HTMLElement).closest('.close-edit-btn') &&
                  !window.matchMedia('(max-width: 48rem)').matches
                ) {
                  startUnifiedDrag(activeWp.id, e)
                }
              }}
            >
              <span>Edit Waypoint</span>
              <button className="icon-btn close-edit-btn" onClick={cancelEditWaypoint}>
                <X size={14} />
              </button>
            </div>
            <div className="edit-field">
              <label>Name</label>
              <input
                type="text"
                value={editForm.name}
                onInput={(e) => setEditForm({ ...editForm, name: (e.target as HTMLInputElement).value })}
              />
            </div>
            <div className="edit-field">
              <label>Description</label>
              <input
                type="text"
                value={editForm.description}
                onInput={(e) => setEditForm({ ...editForm, description: (e.target as HTMLInputElement).value })}
              />
            </div>
            {linkingSourceId === activeWp.id && (
              <div className="link-instruction-hint">Tap destination waypoint to create route</div>
            )}
            <div className="edit-actions">
              <div className="edit-actions-left">
                {confirmDeleteWpId === activeWp.id ? (
                  <button
                    className="icon-btn tooltip-delete-btn confirm"
                    onClick={() => handleDeleteWaypointClick(activeWp.id)}
                    title="Sure?"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <button
                    className="icon-btn tooltip-delete-btn"
                    onClick={() => handleDeleteWaypointClick(activeWp.id)}
                    title="Delete Waypoint"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
                <button
                  className={`btn btn-link-route ${linkingSourceId === activeWp.id ? 'active' : ''}`}
                  onClick={() => {
                    if (linkingSourceId === activeWp.id) {
                      setLinkingSourceId(null)
                    } else {
                      setLinkingSourceId(activeWp.id)
                    }
                  }}
                  title={linkingSourceId === activeWp.id ? 'Cancel connecting' : 'Connect to another waypoint'}
                >
                  <Link2 size={14} />
                  {linkingSourceId === activeWp.id ? 'Cancel' : 'Link'}
                </button>
              </div>
              {isFormChanged && (
                <button className="btn btn-save" onClick={saveEditWaypoint}>
                  <Check size={14} /> Save
                </button>
              )}
            </div>
          </div>
        )}

        {contextMenu && (
          <div
            className="custom-context-menu"
            style={{
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="context-menu-item" onClick={handleCreateWaypoint}>
              <Plus size={14} /> Add Waypoint Here
            </button>
          </div>
        )}
      </div>

      <SavePresetModal
        isOpen={saveModalOpen}
        presetName={newPresetName}
        onNameChange={setNewPresetName}
        onSave={handleSavePreset}
        onClose={() => setSaveModalOpen(false)}
      />

      <LoadPresetModal
        target={loadPresetTarget}
        onConfirm={handleConfirmLoadPreset}
        onClose={() => setLoadPresetTarget(null)}
      />

      <DeletePresetModal
        target={deletePresetTarget}
        onConfirm={handleConfirmDeletePreset}
        onClose={() => setDeletePresetTarget(null)}
      />
    </div>
  )
}
