# ZenFlow OS - System Mindmodel

## Architecture
- **Monolithic File, Modular Logic**: The application is contained in a single HTML file but logically organized into components.
- **State Management**: Centralized state object with reactive updates (using simple JS Proxies or custom event emitter).
- **Persistence**: Browser `localStorage` for all user data.

## Component Structure
1. **Shell**: The main layout and background.
2. **Window Manager**: Handles dragging, layering, and closing of application windows.
3. **Registry**: A central registry for all installed "apps" or widgets.
