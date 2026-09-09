import { X } from 'lucide-preact'
import { Preset } from '../types'

interface SaveModalProps {
  isOpen: boolean
  presetName: string
  onNameChange: (name: string) => void
  onSave: () => void
  onClose: () => void
}

export function SavePresetModal({ isOpen, presetName, onNameChange, onSave, onClose }: SaveModalProps) {
  if (!isOpen) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Save Current Preset</h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <label>Preset Name</label>
          <input
            type="text"
            placeholder="e.g. Rach Gia Corridor"
            value={presetName}
            onInput={(e) => onNameChange((e.target as HTMLInputElement).value)}
            autoFocus
          />
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onSave}>Save Preset</button>
        </div>
      </div>
    </div>
  )
}

interface LoadModalProps {
  target: Preset | null
  onConfirm: () => void
  onClose: () => void
}

export function LoadPresetModal({ target, onConfirm, onClose }: LoadModalProps) {
  if (!target) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Load Preset</h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p>Load preset <strong>"{target.name}"</strong>?</p>
          <p className="modal-subtext">
            This will restore map position, waypoints, and flight routes.
          </p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm}>Load Now</button>
        </div>
      </div>
    </div>
  )
}

interface DeleteModalProps {
  target: Preset | null
  onConfirm: () => void
  onClose: () => void
}

export function DeletePresetModal({ target, onConfirm, onClose }: DeleteModalProps) {
  if (!target) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Delete Preset</h3>
          <button className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">
          <p>Delete preset <strong>"{target.name}"</strong>?</p>
          <p className="modal-subtext">This action cannot be undone.</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  )
}
