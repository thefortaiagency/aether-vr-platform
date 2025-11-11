import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
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

export async function POST(request: NextRequest) {
  try {
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      console.error('OpenAI API key not configured');
      return NextResponse.json({
        response: "Keep working hard! That single leg setup needs to be faster - explode into it!"
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

    return NextResponse.json({ response });

  } catch (error: any) {
    console.error('OpenAI API Error:', error);
    return NextResponse.json({
      response: "That's the spirit! Keep grinding and trust the process!"
    });
  }
}

export const runtime = 'nodejs';
