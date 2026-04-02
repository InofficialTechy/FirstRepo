import { NextResponse } from 'next/server';
import { ruleBasedReply } from '@/lib/intents';

type Message = { role: 'user' | 'assistant'; content: string };

// Privacy note: this route is stateless and does not persist conversations.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: Message[] };
    const messages = body.messages ?? [];
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';

    const hfToken = process.env.HUGGINGFACE_API_TOKEN;
    const hfModel = process.env.HUGGINGFACE_MODEL ?? 'HuggingFaceH4/zephyr-7b-beta';

    if (!hfToken) {
      return NextResponse.json({ text: ruleBasedReply(lastUserMessage), source: 'fallback' });
    }

    const prompt = [
      'You are a concise helpful voice assistant. Keep responses under 80 words.',
      ...messages.slice(-8).map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`),
      'Assistant:'
    ].join('\n');

    const hfResp = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${hfToken}`
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 140,
          temperature: 0.6,
          return_full_text: false
        }
      })
    });

    if (!hfResp.ok) {
      throw new Error(`Hugging Face error: ${hfResp.status}`);
    }

    const data = (await hfResp.json()) as
      | Array<{ generated_text?: string }>
      | { generated_text?: string; error?: string };

    const text = Array.isArray(data) ? data[0]?.generated_text : data.generated_text;

    if (!text) {
      throw new Error('Empty model response');
    }

    return NextResponse.json({ text: text.trim(), source: 'huggingface' });
  } catch {
    return NextResponse.json({ text: 'I could not reach the language model, so I switched to safe fallback mode.' });
  }
}
