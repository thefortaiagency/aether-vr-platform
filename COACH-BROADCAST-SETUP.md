# Coach Broadcast System - Quick Setup Guide

This guide explains how to set up and use the coach broadcast feature for real-time video streaming between coaches and athletes in VR.

## Architecture

```
Coach Browser (Desktop)          Athlete VR (Quest 2)
      ↓                                  ↓
CoachBroadcast.tsx              TwilioVideoTexture.tsx
      ↓                                  ↓
      └──────────> Twilio Video <───────┘
                    (Video Rooms)
```

## Prerequisites

1. **Twilio Account** with Video capabilities
   - Sign up at https://www.twilio.com/console
   - Navigate to Account → Keys & Credentials → API Keys
   - Create a new API Key and save the SID and Secret

2. **Node.js 18+** installed

## Setup Instructions

### 1. Install Dependencies

```bash
# Install frontend dependencies (if not already done)
npm install

# Install backend server dependencies
npm run server:install
```

### 2. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Backend API - Twilio Video Credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here

# Frontend (optional)
VITE_API_URL=https://aethervtc.ai
```

**Where to find these values:**
- `TWILIO_ACCOUNT_SID`: Twilio Console → Account Info → Account SID
- `TWILIO_API_KEY`: Twilio Console → Account → API Keys → Create new key
- `TWILIO_API_SECRET`: Shown only once when creating API key (save it!)

### 3. Start the Application

**Option A: Run both frontend and backend together**
```bash
npm run dev:all
```

**Option B: Run separately (for debugging)**
```bash
# Terminal 1 - Backend server
npm run server:dev

# Terminal 2 - Frontend (Vite)
npm run dev
```

The application will start:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **API Endpoint**: http://localhost:3001/api/twilio/video-token

## Usage

### For Coaches (Desktop Browser)

1. Open the coach interface:
   ```
   http://localhost:5173/coach?room=wrestling-test-room&coach=CoachSmith
   ```

2. Click **"Start Broadcasting"** to begin streaming

3. Use the controls:
   - 🎥 **Video Toggle**: Turn camera on/off
   - 🎤 **Mic Toggle**: Mute/unmute audio
   - 🚪 **End Broadcast**: Disconnect from room

4. Share the athlete URL with your athletes:
   ```
   http://localhost:5173/?room=wrestling-test-room&user=Athlete1
   ```

### For Athletes (VR Headset)

1. Open the Meta Quest browser

2. Navigate to the athlete URL:
   ```
   http://localhost:5173/?room=wrestling-test-room&user=Athlete1
   ```

3. Click **"Enter VR"** button (top right)

4. In VR, you'll see:
   - 📹 **Coach video panel** on the right (position: [2.5, 1.5, -3])
   - 🎬 **Technique video** on the left (position: [-2.5, 1.5, -3])
   - 🏛️ **360° gymnasium background**

5. Use the controls at the bottom to toggle panels on/off

## URL Parameters

### Coach Interface (`/coach`)
- `room`: Video room name (default: `wrestling-test-room`)
- `coach`: Coach display name (default: `Coach`)

### Athlete Interface (`/`)
- `room`: Video room name (must match coach's room)
- `user`: Athlete display name (default: `Wrestler`)

## Testing Locally

### Quick Test (Same Computer)

1. **Terminal 1**: Start services
   ```bash
   npm run dev:all
   ```

2. **Browser Tab 1**: Coach view
   ```
   http://localhost:5173/coach?room=test&coach=MyCoach
   ```
   Click "Start Broadcasting"

3. **Browser Tab 2**: Athlete view
   ```
   http://localhost:5173/?room=test&user=Athlete1
   ```
   You should see the coach video panel

### Testing with VR Headset

1. **Find your local IP address**:
   ```bash
   # Mac/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1

   # Windows
   ipconfig
   ```

2. **Start services** on your computer:
   ```bash
   npm run dev:all
   ```

3. **Access URLs using your local IP**:
   - Coach (desktop): `http://192.168.1.XXX:5173/coach?room=test&coach=Coach`
   - Athlete (Quest): `http://192.168.1.XXX:5173/?room=test&user=Athlete`

**Note**: Replace `192.168.1.XXX` with your actual local IP address.

## API Endpoint Details

### POST /api/twilio/video-token

Generates a Twilio Video access token for a participant.

**Request Body**:
```json
{
  "room": "wrestling-test-room",
  "identity": "CoachSmith-coach-1234567890"
}
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "room": "wrestling-test-room",
  "identity": "CoachSmith-coach-1234567890"
}
```

**Error Response**:
```json
{
  "error": "Missing required fields: room and identity"
}
```

## Troubleshooting

### Backend server won't start
- **Error**: `Missing Twilio credentials`
- **Solution**: Check your `.env` file has all three Twilio variables set

### Coach video not showing in VR
- **Check**: Both coach and athlete are using the same `room` parameter
- **Check**: Coach clicked "Start Broadcasting" before athlete entered VR
- **Check**: VR headset has network access to your local IP

### "Failed to get token" error
- **Check**: Backend server is running (`npm run server:dev`)
- **Check**: Vite proxy is configured correctly (vite.config.ts)
- **Check**: Twilio credentials are valid

### No video in coach preview
- **Check**: Browser has camera permissions
- **Check**: Camera is not being used by another application
- **Try**: Refresh the page and allow camera access when prompted

## Production Deployment

For production use, you'll need to:

1. **Deploy backend** to a service like:
   - Railway
   - Render
   - Heroku
   - Your own VPS

2. **Update environment variables** in production:
   ```env
   TWILIO_ACCOUNT_SID=production_value
   TWILIO_API_KEY=production_value
   TWILIO_API_SECRET=production_value
   PORT=3001
   ```

3. **Update Vite config** to point to production API:
   ```typescript
   // For production, update CoachBroadcast.tsx to use:
   const API_URL = import.meta.env.PROD
     ? 'https://api.aethervtc.ai'
     : '';
   ```

4. **Deploy frontend** to Vercel/Netlify with backend API URL configured

## Room Management Best Practices

1. **Unique room names**: Use descriptive names like `team-wrestling-session-2024-11-11`
2. **Time-based rooms**: Include date/time in room name for organization
3. **Multiple sessions**: Each training session should have its own room
4. **Security**: In production, add authentication to room access

## Next Steps

- [ ] Add authentication/authorization for room access
- [ ] Implement room list/management UI
- [ ] Add recording functionality
- [ ] Implement screen sharing for coach demonstrations
- [ ] Add text chat between coach and athletes
- [ ] Create coach dashboard for managing multiple athletes

## Support

For issues or questions:
- Check the console logs in both browser and backend server
- Review the Twilio Video logs at https://www.twilio.com/console/video/logs
- Contact: thefortaiagency@gmail.com

---

**Built with**: React + Three.js + Twilio Video + Express
**Last Updated**: November 2024
