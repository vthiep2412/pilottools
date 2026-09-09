import { useState } from 'preact/hooks'
import { Trash2, GripVertical, Plus, Search, Check } from 'lucide-preact'
import { Waypoint, Preset } from '../types'

interface SidebarProps {
  presets: Preset[]
  waypoints: Waypoint[]
  selectedWaypointId: string | null
  confirmDeleteWpId: string | null
  onOpenSaveModal: () => void
  onSelectLoadPreset: (preset: Preset) => void
  onSelectDeletePreset: (preset: Preset) => void
  onFlyToWaypoint: (wp: Waypoint) => void
  onDeleteWaypointClick: (wpId: string) => void
  onReorderWaypoints: (wps: Waypoint[]) => void
  onReorderPresets: (presets: Preset[]) => void
}

export function Sidebar({
  presets,
  waypoints,
  selectedWaypointId,
  confirmDeleteWpId,
  onOpenSaveModal,
  onSelectLoadPreset,
  onSelectDeletePreset,
  onFlyToWaypoint,
  onDeleteWaypointClick,
  onReorderWaypoints,
  onReorderPresets,
}: SidebarProps) {
  const [presetSearch, setPresetSearch] = useState('')

  interface DragState {
    index: number
    startY: number
    currentY: number
    cardHeight: number
    targetIndex: number
    isSettling?: boolean
  }

  const [wpDrag, setWpDrag] = useState<DragState | null>(null)
  const [presetDrag, setPresetDrag] = useState<DragState | null>(null)

  const filteredPresets = presets.filter((p) =>
    p.name.toLowerCase().includes(presetSearch.toLowerCase().trim())
  )

  const startWpDrag = (index: number, e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.currentTarget as HTMLElement
    const cardEl = target.closest('.card') as HTMLElement | null
    if (!cardEl) return

    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      // Ignore
    }

    const rect = cardEl.getBoundingClientRect()
    const cardHeight = rect.height + 8
    const startY = e.clientY

    setWpDrag({
      index,
      startY,
      currentY: startY,
      cardHeight,
      targetIndex: index,
    })

    document.body.classList.add('is-sidebar-dragging')

    const onPointerMove = (moveEvt: PointerEvent) => {
      const deltaY = moveEvt.clientY - startY
      const offsetSlots = Math.round(deltaY / cardHeight)
      const targetIndex = Math.max(0, Math.min(waypoints.length - 1, index + offsetSlots))
      setWpDrag((curr) => {
        if (!curr || curr.isSettling) return curr
        return {
          ...curr,
          currentY: moveEvt.clientY,
          targetIndex,
        }
      })
    }

    const onPointerUp = (upEvt: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvt.pointerId)
      } catch {
        // Ignore
      }

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.body.classList.remove('is-sidebar-dragging')

      setWpDrag((curr) => {
        if (!curr) return null
        return {
          ...curr,
          isSettling: true,
        }
      })

      // Smooth slide into the opened slot over 160ms before committing
      setTimeout(() => {
        document.body.classList.add('is-sidebar-committing')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.body.classList.remove('is-sidebar-committing')
          })
        })

        setWpDrag((curr) => {
          if (curr && curr.index !== curr.targetIndex) {
            const updated = [...waypoints]
            const [moved] = updated.splice(curr.index, 1)
            updated.splice(curr.targetIndex, 0, moved)
            onReorderWaypoints(updated)
          }
          return null
        })
      }, 160)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  const startPresetDrag = (index: number, e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.currentTarget as HTMLElement
    const cardEl = target.closest('.card') as HTMLElement | null
    if (!cardEl) return

    try {
      target.setPointerCapture(e.pointerId)
    } catch {
      // Ignore
    }

    const rect = cardEl.getBoundingClientRect()
    const cardHeight = rect.height + 8
    const startY = e.clientY

    setPresetDrag({
      index,
      startY,
      currentY: startY,
      cardHeight,
      targetIndex: index,
    })

    document.body.classList.add('is-sidebar-dragging')

    const onPointerMove = (moveEvt: PointerEvent) => {
      const deltaY = moveEvt.clientY - startY
      const offsetSlots = Math.round(deltaY / cardHeight)
      const targetIndex = Math.max(0, Math.min(filteredPresets.length - 1, index + offsetSlots))
      setPresetDrag((curr) => {
        if (!curr || curr.isSettling) return curr
        return {
          ...curr,
          currentY: moveEvt.clientY,
          targetIndex,
        }
      })
    }

    const onPointerUp = (upEvt: PointerEvent) => {
      try {
        target.releasePointerCapture(upEvt.pointerId)
      } catch {
        // Ignore
      }

      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      document.body.classList.remove('is-sidebar-dragging')

      setPresetDrag((curr) => {
        if (!curr) return null
        return {
          ...curr,
          isSettling: true,
        }
      })

      // Smooth slide into the opened slot over 160ms before committing
      setTimeout(() => {
        document.body.classList.add('is-sidebar-committing')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            document.body.classList.remove('is-sidebar-committing')
          })
        })

        setPresetDrag((curr) => {
          if (curr && curr.index !== curr.targetIndex) {
            const updated = [...presets]
            const [moved] = updated.splice(curr.index, 1)
            updated.splice(curr.targetIndex, 0, moved)
            onReorderPresets(updated)
          }
          return null
        })
      }, 160)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
  }

  return (
    <aside className="sidebar">
      {/* Top: Presets Section */}
      <section className="sidebar-section presets-section">
        <div className="section-header">
          <span className="section-title">Saved Presets</span>
          <button
            className="icon-btn add-preset-btn"
            onClick={onOpenSaveModal}
            title="Save current map preset"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="search-bar">
          <Search size={14} className="search-icon" />
          <input
            type="text"
            placeholder="Search presets..."
            value={presetSearch}
            onInput={(e) => setPresetSearch((e.target as HTMLInputElement).value)}
          />
        </div>

        <div className="cards-list presets-list">
          {filteredPresets.length === 0 ? (
            <div className="empty-hint">No saved presets</div>
          ) : (
            filteredPresets.map((preset, idx) => {
              let transformStyle = ''
              let isSlidingActive = false
              let isSettling = false

              if (presetDrag) {
                if (idx === presetDrag.index) {
                  if (presetDrag.isSettling) {
                    const targetOffset = (presetDrag.targetIndex - presetDrag.index) * presetDrag.cardHeight
                    transformStyle = `translateY(${targetOffset}px)`
                    isSettling = true
                  } else {
                    const deltaY = presetDrag.currentY - presetDrag.startY
                    transformStyle = `translateY(${deltaY}px)`
                    isSlidingActive = true
                  }
                } else if (presetDrag.index < presetDrag.targetIndex && idx > presetDrag.index && idx <= presetDrag.targetIndex) {
                  transformStyle = `translateY(-${presetDrag.cardHeight}px)`
                } else if (presetDrag.index > presetDrag.targetIndex && idx >= presetDrag.targetIndex && idx < presetDrag.index) {
                  transformStyle = `translateY(${presetDrag.cardHeight}px)`
                }
              }

              return (
                <div
                  key={preset.id}
                  className={`card preset-card ${isSlidingActive ? 'is-sliding-active' : ''} ${isSettling ? 'is-settling' : ''}`}
                  style={transformStyle ? { transform: transformStyle } : undefined}
                >
                  {/* Dedicated Grab Zone (full height hit area) */}
                  <div
                    className="card-drag-zone"
                    onPointerDown={(e) => startPresetDrag(idx, e)}
                    title="Drag to reorder"
                  >
                    <GripVertical size={14} className="drag-handle-icon" />
                  </div>

                  {/* Content Zone */}
                  <div className="card-content-zone" onClick={() => onSelectLoadPreset(preset)}>
                    <div className="card-title">{preset.name}</div>
                    <div className="card-subtitle">
                      {preset.state.waypoints.length} points · {preset.state.links.length} routes
                    </div>
                  </div>

                  {/* Action Zone */}
                  <div className="card-action-zone">
                    <button
                      className="icon-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectDeletePreset(preset)
                      }}
                      title="Delete Preset"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>

      {/* Bottom: Current Waypoints Section */}
      <section className="sidebar-section waypoints-section">
        <div className="section-header">
          <span className="section-title">Active Waypoints ({waypoints.length})</span>
        </div>

        <div className="cards-list waypoints-list">
          {waypoints.length === 0 ? (
            <div className="empty-hint">Right-click on map to add waypoints</div>
          ) : (
            waypoints.map((wp, idx) => {
              let transformStyle = ''
              let isSlidingActive = false
              let isSettling = false

              if (wpDrag) {
                if (idx === wpDrag.index) {
                  if (wpDrag.isSettling) {
                    const targetOffset = (wpDrag.targetIndex - wpDrag.index) * wpDrag.cardHeight
                    transformStyle = `translateY(${targetOffset}px)`
                    isSettling = true
                  } else {
                    const deltaY = wpDrag.currentY - wpDrag.startY
                    transformStyle = `translateY(${deltaY}px)`
                    isSlidingActive = true
                  }
                } else if (wpDrag.index < wpDrag.targetIndex && idx > wpDrag.index && idx <= wpDrag.targetIndex) {
                  transformStyle = `translateY(-${wpDrag.cardHeight}px)`
                } else if (wpDrag.index > wpDrag.targetIndex && idx >= wpDrag.targetIndex && idx < wpDrag.index) {
                  transformStyle = `translateY(${wpDrag.cardHeight}px)`
                }
              }

              return (
                <div
                  key={wp.id}
                  className={`card waypoint-card ${selectedWaypointId === wp.id ? 'active' : ''} ${isSlidingActive ? 'is-sliding-active' : ''} ${isSettling ? 'is-settling' : ''}`}
                  style={transformStyle ? { transform: transformStyle } : undefined}
                >
                  {/* Dedicated Grab Zone (full height hit area) */}
                  <div
                    className="card-drag-zone"
                    onPointerDown={(e) => startWpDrag(idx, e)}
                    title="Drag to reorder"
                  >
                    <GripVertical size={14} className="drag-handle-icon" />
                  </div>

                  {/* Content Zone */}
                  <div className="card-content-zone" onClick={() => onFlyToWaypoint(wp)}>
                    <div className="card-title">{wp.name}</div>
                    <div className="card-subtitle">
                      {wp.lat.toFixed(4)}°, {wp.lng.toFixed(4)}°
                    </div>
                  </div>

                  {/* Action Zone */}
                  <div className="card-action-zone">
                    {confirmDeleteWpId === wp.id ? (
                      <button
                        className="icon-btn confirm-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteWaypointClick(wp.id)
                        }}
                        title="Sure?"
                      >
                        <Check size={14} />
                      </button>
                    ) : (
                      <button
                        className="icon-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteWaypointClick(wp.id)
                        }}
                        title="Delete Waypoint"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </section>
    </aside>
  )
}
