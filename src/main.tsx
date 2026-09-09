import { render } from 'preact'
import 'leaflet/dist/leaflet.css'
import './style.css'
import { App } from './app'

const rootEl = document.getElementById('app')
if (rootEl) {
  render(<App />, rootEl)
}
