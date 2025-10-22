import { GoogleGenAI } from "@google/genai";
import { LANGUAGE_CONFIG, GLOSSARY_SUGGESTION_PROMPT } from '../constants';
import { Novel } from "../types";

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

const geminiAi = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const GEMINI_MODEL = 'gemini-pro';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function* translateWithGeminiStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!geminiAi) throw new Error("Gemini API key (VITE_GEMINI_API_KEY) is not configured in environment variables.");
    
    try {
        const basePrompt = LANGUAGE_CONFIG[novel.sourceLanguage].prompt;
        const finalPrompt = basePrompt.replace('{{GLOSSARY}}', novel.customGlossary || '');
        
        const response = await geminiAi.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [
                { role: 'user', parts: [{ text: finalPrompt }] },
                { role: 'model', parts: [{ text: 'Understood. I will follow all directives. Provide the text to translate.' }] },
                { role: 'user', parts: [{ text }] }
            ],
        });

        for await (const chunk of response) {
            const chunkText = chunk.text();
            if (chunkText) {
                yield chunkText;
            }
        }
    } catch (error) {
        console.error('Error translating with Gemini:', error);
        throw new Error(`Gemini translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function generateGlossaryWithGemini(context: string, sourceLanguage: 'chinese' | 'korean'): Promise<string> {
    if (!geminiAi) throw new Error("Gemini API key (VITE_GEMINI_API_KEY) is not configured in environment variables.");
    
    try {
        const languageName = sourceLanguage.charAt(0).toUpperCase() + sourceLanguage.slice(1);
        const prompt = GLOSSARY_SUGGESTION_PROMPT.replace('{{CONTEXT}}', context).replace(/{{LANGUAGE_NAME}}/g, languageName);
        
        const result = await geminiAi.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        
        const response = result.response;
        return response.text();
    } catch (error) {
        console.error('Error generating glossary with Gemini:', error);
        throw new Error(`Gemini glossary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function* translateWithGroqStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!groqApiKey) throw new Error("Groq API key (VITE_GROQ_API_KEY) is not configured in environment variables.");
    
    const basePrompt = LANGUAGE_CONFIG[novel.sourceLanguage].prompt;
    const finalPrompt = basePrompt.replace('{{GLOSSARY}}', novel.customGlossary || '');

    const body = JSON.stringify({
        model: GROQ_MODEL,
        messages: [
            { role: 'system', content: finalPrompt },
            { role: 'user', content: text }
        ],
        stream: true,
    });

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body,
    });

    if (!response.ok || !response.body) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} ${response.statusText}. ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));
        
        for (const line of lines) {
            const jsonStr = line.replace('data: ', '');
            if (jsonStr === '[DONE]') return;
            try {
                const parsed = JSON.parse(jsonStr);
                const content = parsed.choices[0]?.delta?.content;
                if (content) yield content;
            } catch (error) {
                console.error('Error parsing Groq stream chunk:', error);
            }
        }
    }
}

async function generateGlossaryWithGroq(context: string, sourceLanguage: 'chinese' | 'korean'): Promise<string> {
    if (!groqApiKey) throw new Error("Groq API key (VITE_GROQ_API_KEY) is not configured in environment variables.");
    
    const languageName = sourceLanguage.charAt(0).toUpperCase() + sourceLanguage.slice(1);
    const prompt = GLOSSARY_SUGGESTION_PROMPT.replace('{{CONTEXT}}', context).replace(/{{LANGUAGE_NAME}}/g, languageName);

    const body = JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
    });

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqApiKey}`, 'Content-Type': 'application/json' },
        body,
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error: ${response.status} ${response.statusText}. ${errorText}`);
    }
    
    const data = await response.json();
    return data.choices[0]?.message?.content || '';
}

export async function* translateTextStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!text) return;
    
    switch (novel.aiProvider) {
        case 'gemini':
            yield* translateWithGeminiStream(text, novel);
            break;
        case 'groq':
            yield* translateWithGroqStream(text, novel);
            break;
        default:
            throw new Error(`Unknown AI provider: ${novel.aiProvider}`);
    }
}

export const generateGlossarySuggestions = async (
    context: string,
    sourceLanguage: 'chinese' | 'korean',
    provider: 'gemini' | 'groq'
): Promise<string> => {
    if (!context) return '';

    switch (provider) {
        case 'gemini':
            return generateGlossaryWithGemini(context, sourceLanguage);
        case 'groq':
            return generateGlossaryWithGroq(context, sourceLanguage);
        default:
            throw new Error(`Unknown AI provider: ${provider}`);
    }
};
