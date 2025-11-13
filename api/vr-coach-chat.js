import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

    // Generate audio with ElevenLabs (optional)
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
}
