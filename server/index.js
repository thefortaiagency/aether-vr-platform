import express from 'express';
import cors from 'cors';
import twilio from 'twilio';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

// Debug: Log the API key being used
const apiKey = process.env.OPENAI_API_KEY || '';
console.log(`🔑 OpenAI API Key loaded (last 4 chars): ...${apiKey.slice(-4)}`);

// Initialize OpenAI
const openai = new OpenAI({
  apiKey,
});

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.raw({ type: 'audio/webm', limit: '10mb' }));

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

// VR Voice Chat with Whisper transcription + Coach Andy response
app.post('/api/vr-voice-chat', async (req, res) => {
  try {
    if (!req.body || req.body.length === 0) {
      return res.status(400).json({ error: 'No audio data received' });
    }

    console.log('🎤 Received audio data:', req.body.length, 'bytes');

    // Save audio to temporary file for Whisper
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFile = path.join(tempDir, `audio-${Date.now()}.webm`);
    fs.writeFileSync(tempFile, req.body);

    console.log('💾 Saved audio to:', tempFile);

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFile),
      model: 'whisper-1',
    });

    const transcript = transcription.text;
    console.log('🗣️ Whisper transcription:', transcript);

    // Delete temp file
    fs.unlinkSync(tempFile);

    if (!transcript || transcript.trim().length === 0) {
      return res.json({
        transcript: '',
        response: "Didn't catch that. Speak louder!",
        audioUrl: null
      });
    }

    // Get Coach Andy response
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: COACH_ANDY_PERSONA
        },
        {
          role: "user",
          content: transcript
        }
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    let response = completion.choices[0]?.message?.content ||
      "Good work! Keep pushing yourself!";

    // Clean any markdown
    response = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim();

    console.log(`💬 Coach Andy: "${transcript}" → "${response}"`);

    // Generate audio with ElevenLabs
    let audioUrl = null;
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
      try {
        const elevenLabsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
          {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
              text: response,
              model_id: 'eleven_monolingual_v1',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
              }
            })
          }
        );

        if (elevenLabsResponse.ok) {
          const audioBuffer = await elevenLabsResponse.arrayBuffer();
          const base64Audio = Buffer.from(audioBuffer).toString('base64');
          audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
          console.log(`🔊 Generated audio for Coach Andy response`);
        }
      } catch (audioError) {
        console.error('❌ ElevenLabs Error:', audioError);
      }
    }

    res.json({ transcript, response, audioUrl });

  } catch (error) {
    console.error('❌ Voice chat error:', error);
    res.status(500).json({
      error: 'Failed to process audio',
      transcript: '',
      response: "Technical difficulties! Keep training!",
      audioUrl: null
    });
  }
});

// Coach Andy AI Chatbot endpoint
const COACH_ANDY_PERSONA = `You are Coach Andy O'Berlin - Indiana Coach of the Year with 30+ years of wrestling experience and 25 years of coaching.

**Your Coaching Style:**
- Direct, no-nonsense communication - no corporate BS
- ADHD-friendly: Keep responses concise and actionable
- Mission-driven: "Build better wrestlers and better people"
- Champion mindset: "Hard work beats talent when talent doesn't work hard"

**Your Background:**
- Indiana Coach of the Year
- 30+ years in wrestling, 25 years coaching
- Computer Science degree + 20 years tech experience
- Built successful businesses through ethical AI

**How You Coach:**
- Be direct and to the point
- Give specific, actionable technique advice
- Reference the technique videos around the wrestler
- Use wrestling terminology naturally
- Push wrestlers to be their best
- Balance toughness with genuine care
- Celebrate wins enthusiastically: "THAT'S what I'm talking about!"
- When correcting: "Here's what you need to fix..."

**Available Techniques** (videos around the room):
1. Single Leg Takedown
2. Double Leg Takedown
3. Cradle
4. Escape
5. Standup
6. Switch

Keep responses under 3 sentences. Be the coach they need - tough, direct, and caring.`;

app.post('/api/vr-coach-chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return res.json({
        response: "Keep working hard! That single leg setup needs to be faster - explode into it!",
        audioUrl: null
      });
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: COACH_ANDY_PERSONA
        },
        {
          role: "user",
          content: message
        }
      ],
      temperature: 0.8,
      max_tokens: 150,
    });

    let response = completion.choices[0]?.message?.content ||
      "Good work! Keep pushing yourself!";

    // Clean any markdown
    response = response
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim();

    console.log(`💬 Coach Andy: "${message}" → "${response}"`);

    // Generate audio with ElevenLabs
    let audioUrl = null;
    if (process.env.ELEVENLABS_API_KEY && process.env.ELEVENLABS_VOICE_ID) {
      try {
        const elevenLabsResponse = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
          {
            method: 'POST',
            headers: {
              'Accept': 'audio/mpeg',
              'Content-Type': 'application/json',
              'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            body: JSON.stringify({
              text: response,
              model_id: 'eleven_monolingual_v1',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75
              }
            })
          }
        );

        if (elevenLabsResponse.ok) {
          const audioBuffer = await elevenLabsResponse.arrayBuffer();
          const base64Audio = Buffer.from(audioBuffer).toString('base64');
          audioUrl = `data:audio/mpeg;base64,${base64Audio}`;
          console.log(`🔊 Generated audio for Coach Andy response`);
        } else {
          console.error('❌ ElevenLabs API Error:', elevenLabsResponse.statusText);
        }
      } catch (audioError) {
        console.error('❌ ElevenLabs Error:', audioError);
      }
    }

    res.json({ response, audioUrl });

  } catch (error) {
    console.error('❌ OpenAI API Error:', error);
    res.json({
      response: "That's the spirit! Keep grinding and trust the process!",
      audioUrl: null
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Aether VR Backend running on http://localhost:${PORT}`);
  console.log(`📹 Twilio Video Token API: http://localhost:${PORT}/api/twilio/video-token`);
  console.log(`💬 Coach Andy Chat API: http://localhost:${PORT}/api/vr-coach-chat`);
});
