import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: Request) {
  try {
    const { text, targetLanguage, model, context = [] } = await req.json();

    if (!text || !targetLanguage) {
      return NextResponse.json({ error: 'Missing text or targetLanguage' }, { status: 400 });
    }

    let openai: OpenAI;
    let modelName = '';

    if (model === 'gpt') {
      openai = new OpenAI({
        apiKey: process.env.GPT_API_KEY,
      });
      modelName = 'gpt-4o-mini';
    } else {
      // Default to DeepSeek
      openai = new OpenAI({
        apiKey: process.env.DEEPSEEK_API_KEY,
        baseURL: 'https://api.deepseek.com/v1',
      });
      modelName = 'deepseek-chat';
    }

    const systemPrompt = `You are an expert business translator. Translate the following text into the language represented by the code "${targetLanguage}". 
Ensure the translation is natural, context-aware, and maintains the original tone. Do not provide explanations, only the translated text.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...context.map((msg: any) => ({
        role: msg.role, // 'user' or 'assistant'
        content: msg.content
      })),
      { role: 'user' as const, content: text }
    ];

    const response = await openai.chat.completions.create({
      model: modelName,
      messages: messages,
      temperature: 0.3, // Low temperature for consistent translation
    });

    const translatedText = response.choices[0].message.content?.trim();

    return NextResponse.json({ translatedText });
  } catch (error: any) {
    console.error('Translation error:', error);
    return NextResponse.json({ error: error.message || 'Translation failed' }, { status: 500 });
  }
}
