# NewsOverlay Pro

A complete MERN stack web application for adding professional news channel style overlays to videos. Supports both landscape and portrait orientations with customizable colors, reporter names, and scrolling news tickers.

## Features

- **Video Upload**: Drag & drop or browse to upload MP4 videos
- **Auto Orientation Detection**: Automatically detects landscape (width > height) or portrait videos
- **Two Overlay Templates**:
  - **Landscape**: Red logo, blue designation bar, purple reporter bar, orange crawler
  - **Portrait**: Gray logo, purple designation bar, orange reporter bar, green crawler
- **Customizable Elements**:
  - Reporter Name (Hindi text support)
  - News Crawler Text (scrolling)
  - 5 Color pickers for all overlay elements
- **Real-time Preview**: See overlay changes instantly
- **FFmpeg Processing**: Professional video processing with permanent overlay burn
- **Hindi Text Support**: Full Devanagari script support

## Tech Stack

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS
- shadcn/ui components
- React Dropzone (file upload)
- Axios (API calls)

### Backend
- Node.js + Express
- Multer (file upload)
- Fluent-FFmpeg (video processing)
- Canvas (overlay generation)

## Project Structure

```
newsoverlay-pro/
├── backend/
│   ├── package.json
│   ├── server.js          # Main server file
│   ├── uploads/           # Uploaded videos (auto-created)
│   ├── outputs/           # Processed videos (auto-created)
│   └── temp/              # Temporary files (auto-created)
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── App.tsx        # Main application
│   │   ├── App.css        # Custom styles
│   │   └── ...
│   └── ...
└── README.md
```

## Prerequisites

1. **Node.js** (v18 or higher)
2. **FFmpeg** (must be installed on system)
3. **Noto Sans Devanagari** font (for Hindi text)

### Install FFmpeg

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ffmpeg
sudo apt install fonts-noto-devanagari
```

**macOS:**
```bash
brew install ffmpeg
brew install font-noto-sans-devanagari
```

**Windows:**
Download from https://ffmpeg.org/download.html and add to PATH

## Installation & Setup

### 1. Backend Setup

```bash
cd backend
npm install
```

### 2. Frontend Setup

```bash
cd frontend
npm install
```

## Running the Application

### Development Mode

**Terminal 1 - Start Backend:**
```bash
cd backend
npm start
# Server runs on http://localhost:5000
```

**Terminal 2 - Start Frontend:**
```bash
cd frontend
npm run dev
# App runs on http://localhost:5173
```

### Production Build

**Build Frontend:**
```bash
cd frontend
npm run build
# Output in dist/ folder
```

## Usage Guide

1. **Upload Video**: Drag & drop or click to select a video file (MP4, MOV, AVI, MKV up to 500MB)

2. **Customize Overlay**:
   - Edit Reporter Name (Hindi supported)
   - Edit News Crawler Text
   - Use color pickers to customize all overlay elements

3. **Preview**: See real-time preview of overlay on your video

4. **Generate**: Click "Generate Final Video" to process

5. **Download**: Download the final video with permanent overlay

## Overlay Template Details

### Landscape Template (16:9)
- **Logo**: Circular, left side (default: red)
- **Upper Bar**: "संवाददाता" text (default: blue)
- **Lower Bar**: Reporter name (default: purple)
- **Crawler Bar**: Full width at bottom (default: orange)
- **Left Line**: Thin vertical line on crawler (default: yellow)

### Portrait Template (9:16)
- **Logo**: Circular, left side (default: gray)
- **Upper Bar**: "संवाददाता" text (default: purple)
- **Lower Bar**: Reporter name (default: orange)
- **Crawler Bar**: Full width at bottom (default: green)
- **Left Line**: Thin vertical line on crawler (default: yellow)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload video file |
| `/api/process` | POST | Process video with overlay |
| `/api/download/:filename` | GET | Download processed video |
| `/api/preview` | POST | Generate preview overlay image |

## Environment Variables

Create `.env` file in backend folder:

```env
PORT=5000
UPLOAD_DIR=./uploads
OUTPUT_DIR=./outputs
TEMP_DIR=./temp
```

## Troubleshooting

### FFmpeg not found
- Ensure FFmpeg is installed and in system PATH
- Check with: `ffmpeg -version`

### Hindi text not rendering
- Install Noto Sans Devanagari font
- On Linux: `sudo apt install fonts-noto-devanagari`

### Large video processing fails
- Increase Node.js memory: `NODE_OPTIONS="--max-old-space-size=4096"`
- Check file size limit in server.js (default: 500MB)

### CORS errors
- Ensure backend is running on port 5000
- Check CORS settings in server.js

## License

MIT License

## Credits

Built with React, Express, FFmpeg, and Node Canvas
