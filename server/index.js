import express from 'express';
import cors from 'cors';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Twilio credentials from environment
const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
} = process.env;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'aether-vr-backend' });
});

// Generate Twilio Video access token
app.post('/api/twilio/video-token', (req, res) => {
  try {
    const { room, identity } = req.body;

    if (!room || !identity) {
      return res.status(400).json({
        error: 'Missing required fields: room and identity'
      });
    }

    if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET) {
      return res.status(500).json({
        error: 'Server configuration error: Missing Twilio credentials'
      });
    }

    // Create access token
    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      { identity }
    );

    // Create Video grant
    const videoGrant = new VideoGrant({
      room,
    });

    // Add grant to token
    token.addGrant(videoGrant);

    // Generate JWT
    const jwt = token.toJwt();

    console.log(`✅ Generated token for identity: ${identity}, room: ${room}`);

    res.json({
      token: jwt,
      room,
      identity,
    });

  } catch (error) {
    console.error('❌ Error generating token:', error);
    res.status(500).json({
      error: 'Failed to generate token',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Aether VR Backend running on http://localhost:${PORT}`);
  console.log(`📹 Twilio Video Token API: http://localhost:${PORT}/api/twilio/video-token`);
});
