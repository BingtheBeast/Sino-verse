/**
 * @file This service acts as a modular interface for AI-powered translation and text generation.
 * It can dynamically switch between multiple AI providers based on user selection.
 *
 * @important
 * This application now supports both Google Gemini and Groq.
 * You must provide API keys for both services in your Vercel environment variables:
 * - API_KEY: For Google Gemini (as per guidelines)
 * - GROQ_API_KEY: For Groq
 * - The app will throw an error if the key for the selected provider is missing.
 */

import { GoogleGenAI } from "@google/genai";
import { LANGUAGE_CONFIG, GLOSSARY_SUGGESTION_PROMPT } from '../constants';
import { Novel } from "../types";

// --- Provider-Specific Configurations ---

const groqApiKey = (process as any).env.GROQ_API_KEY;
const geminiApiKey = (process as any).env.API_KEY;

const geminiAi = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// --- Gemini Implementations ---

async function* translateWithGeminiStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!geminiAi) throw new Error("Gemini API key (API_KEY) is not configured in environment variables.");
    
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
            yield chunk.text;
        }
    } catch (error) {
        console.error('Error translating with Gemini:', error);
        throw new Error(`Gemini translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function generateGlossaryWithGemini(context: string, sourceLanguage: 'chinese' | 'korean'): Promise<string> {
    if (!geminiAi) throw new Error("Gemini API key (API_KEY) is not configured in environment variables.");
    
    try {
        const languageName = sourceLanguage.charAt(0).toUpperCase() + sourceLanguage.slice(1);
        const prompt = GLOSSARY_SUGGESTION_PROMPT.replace('{{CONTEXT}}', context).replace(/{{LANGUAGE_NAME}}/g, languageName);
        
        const response = await geminiAi.models.generateContent({
            model: GEMINI_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        
        return response.text;
    } catch (error) {
        console.error('Error generating glossary with Gemini:', error);
        throw new Error(`Gemini glossary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

// --- Groq (OpenAI-Compatible) Implementations ---

async function* translateWithGroqStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!groqApiKey) throw new Error("Groq API key (GROQ_API_KEY) is not configured in environment variables.");
    
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
    if (!groqApiKey) throw new Error("Groq API key (GROQ_API_KEY) is not configured in environment variables.");
    
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

// --- Public API Dispatchers ---

/**
 * Translates text by dispatching to the appropriate provider based on the novel's settings.
 */
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

/**
 * Generates glossary suggestions by dispatching to the appropriate provider.
 */
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