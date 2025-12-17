# Bonchon Launcher

ศูนย์รวมโปรแกรมจาก Bonchon Studio - Electron-based Application Launcher

## Features

- 🏪 **Store** - ดาวน์โหลดโปรแกรมทั้งหมดจาก Bonchon Studio
- 📁 **Library** - จัดการโปรแกรมที่ติดตั้งแล้ว
- ⚙️ **Settings** - ตั้งค่าแอปพลิเคชัน

## Tech Stack

- Electron 28
- Vanilla JavaScript
- Custom CSS (Epic Games Store inspired)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for Windows
npm run build
```

## Project Structure

```
bonchon-launcher/
├── main.js              # Electron main process
├── package.json         # Project configuration
├── src/
│   ├── index.html       # Main HTML
│   ├── renderer.js      # Renderer process
│   ├── preload.js       # Preload script
│   ├── styles/
│   │   └── main.css     # Styling
│   └── data/
│       └── apps.json    # Apps catalog
└── assets/
    └── icons/
        └── logo.png     # App logo
```

## Screenshots

Coming soon...

## License

MIT © Bonchon Studio
