# Pilot Tools

A fast, lightweight navigation tool for pilots to plot waypoints, calculate great-circle nautical distances, compute true headings, and plan flight corridors on top of a clean map canvas.

## Tech Stack

- **Runtime & Package Manager**: Bun
- **Build Tool**: Vite
- **Frontend Framework**: Preact with TypeScript
- **Mapping**: Leaflet with Google Normal and Satellite layers
- **Icons**: Lucide Preact

## Quick Start

### 1. Install Dependencies
```bash
bun install
```

### 2. Start Local Development Server
```bash
bun run dev
```

### 3. Build for Production
```bash
bun run build
```

## Core Features

- **Persistent Canvas State**: Automatically saves and restores map center, zoom level, waypoints, and routes from local storage on reload.
- **Custom Context Menu**: Right-click on the map to add new waypoints at exact geographic coordinates without browser interference.
- **Shortcut Controls**: Blocks browser default context menu and Ctrl+S page-save. Supports Ctrl+Z for undo and Ctrl+Shift+Z or Ctrl+Y for redo across waypoint and route actions.
- **3D Hover Tooltips**: Hovering any waypoint pin displays an elevated 3D tooltip with its title and operational description.
- **Click to Edit**: Clicking a waypoint locks open an inline editor for name and description with instant save.
- **Direct Waypoint Dragging**: Selected waypoints can be dragged directly across the map canvas. Connected corridor lines, aeronautical heading badges, distance badges, and edit cards follow the cursor live at 60 FPS.
- **Right-Click Drag Linking**: Right-click and drag between two waypoints to draw flight legs.
- **Aeronautical Leg Badges**: Each flight route displays outbound true course degrees near departure, reciprocal inbound degrees near arrival, and Great-Circle distance in Nautical Miles (NM) at the midpoint.
- **Route Severing**: Clicking a route or its distance badge reveals a delete button to disconnect legs.
- **Saved Presets**: Save, filter, reorder, load, or delete route corridors and map setups through confirmation modals.
- **Sidebar Waypoint Management**: Reorder waypoints with drag handles on the first 20% of cards, fly to points by clicking card bodies, or delete waypoints using a 5-second confirmation countdown button.
- **Cockpit Dark Theme**: Styled strictly with rem units and high-contrast neutral dark shades with zero gradients.
