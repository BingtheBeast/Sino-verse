import { GoogleGenAI } from "@google/genai";
import { LANGUAGE_CONFIG, GLOSSARY_SUGGESTION_PROMPT, DEFAULT_CHINESE_GLOSSARY, DEFAULT_KOREAN_GLOSSARY } from '../constants';
import { Novel } from "../types";

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Use new GoogleGenAI({ apiKey: ... }) syntax consistent with @google/genai CDN
const geminiAi = geminiApiKey ? new GoogleGenAI({ apiKey: geminiApiKey }) : null;
const GEMINI_MODEL = 'gemini-pro-latest';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const getCombinedGlossary = (novel: Novel): string => {
  const defaultGlossary = novel.sourceLanguage === 'chinese'
    ? DEFAULT_CHINESE_GLOSSARY
    : DEFAULT_KOREAN_GLOSSARY;

  return `# --- User's Custom Terms --- \n${novel.customGlossary || ''}\n\n# --- Default Glossary --- \n${defaultGlossary}`.trim();
};

async function* translateWithGeminiStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!geminiAi) throw new Error("Gemini API key (VITE_GEMINI_API_KEY) is not configured in environment variables.");

    try {
        // --- FIX: Get model first ---
        const model = geminiAi.getGenerativeModel({ model: GEMINI_MODEL });
        const basePrompt = LANGUAGE_CONFIG[novel.sourceLanguage].prompt;
        const combinedGlossary = getCombinedGlossary(novel);
        const finalPrompt = basePrompt.replace('{{GLOSSARY}}', combinedGlossary);

        // --- FIX: Start chat and send message stream ---
        const chat = model.startChat({
            history: [
                { role: 'user', parts: [{ text: finalPrompt }] },
                { role: 'model', parts: [{ text: 'Understood. I will follow all directives and the two-step translation process. Provide the text to translate.' }] },
            ],
            // generationConfig: { // Optional: Add safety settings if needed later
            //   maxOutputTokens: 8192, // Example
            // },
            // safetySettings: [ // Optional: Adjust safety if needed later
            //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            //   // ... other categories
            // ],
        });

        const result = await chat.sendMessageStream(text);

        // Stream handling remains the same
        for await (const chunk of result.stream) {
          try {
            const chunkText = chunk.text();
            if (chunkText) {
                yield chunkText;
            }
          } catch (streamError) {
             console.error('Error processing stream chunk:', streamError);
             // Decide if you want to throw or just skip the chunk
             // throw new Error(`Gemini stream processing failed: ${streamError.message}`);
          }
        }
    } catch (error) {
        console.error('Error translating with Gemini:', error);
         if (error instanceof Error) {
                 console.error('Gemini Error Message:', error.message);
                 console.error('Gemini Error Stack:', error.stack);
            }
        console.error('Raw Gemini Error Object:', JSON.stringify(error, null, 2));
        throw new Error(`Gemini translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function generateGlossaryWithGemini(context: string, sourceLanguage: 'chinese' | 'korean'): Promise<string> {
    if (!geminiAi) throw new Error("Gemini API key (VITE_GEMINI_API_KEY) is not configured in environment variables.");

    try {
        // --- FIX: Get model first ---
        const model = geminiAi.getGenerativeModel({ model: GEMINI_MODEL });
        const languageName = sourceLanguage.charAt(0).toUpperCase() + sourceLanguage.slice(1);
        const prompt = GLOSSARY_SUGGESTION_PROMPT.replace('{{CONTEXT}}', context).replace(/{{LANGUAGE_NAME}}/g, languageName);

        // --- FIX: Call generateContent on the model object ---
        const result = await model.generateContent(prompt);

        // Access response correctly
        const response = result.response;
        if (!response) {
          console.error("Gemini glossary generation returned no response object. Full result:", JSON.stringify(result, null, 2));
          throw new Error("Gemini glossary generation failed: No response object returned.");
        }
        
        // Add check for safety ratings potentially blocking content
        const safetyRatings = response.promptFeedback?.safetyRatings;
        if (safetyRatings?.some(rating => rating.blocked)) {
             console.warn("Gemini glossary generation might be blocked due to safety settings:", response.promptFeedback);
             // Consider returning a specific message or empty string
             return "# Glossary generation blocked by safety settings.";
        }
        
        // Access text content
        const text = response.text();
        if (text === undefined || text === null) {
            console.error("Gemini glossary generation response has no text content. Full response:", JSON.stringify(response, null, 2));
            throw new Error("Gemini glossary generation failed: Response text is missing.");
        }
        return text;

    } catch (error) {
        console.error('Error generating glossary with Gemini:', error);
         if (error instanceof Error) {
                 console.error('Gemini Error Message:', error.message);
                 console.error('Gemini Error Stack:', error.stack);
            }
        console.error('Raw Gemini Error Object:', JSON.stringify(error, null, 2));
        throw new Error(`Gemini glossary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

async function* translateWithGroqStream(text: string, novel: Novel): AsyncGenerator<string> {
    if (!groqApiKey) throw new Error("Groq API key (VITE_GROQ_API_KEY) is not configured in environment variables.");

    const basePrompt = LANGUAGE_CONFIG[novel.sourceLanguage].prompt;
    const combinedGlossary = getCombinedGlossary(novel);
    const finalPrompt = basePrompt.replace('{{GLOSSARY}}', combinedGlossary);

    const body = JSON.stringify({
        model: GROQ_MODEL,
        messages: [
            { role: 'user', content: finalPrompt },
            { role: 'assistant', content: 'Understood. I will follow all directives and the two-step translation process. Provide the text to translate.' },
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
             console.warn(`Unknown AI provider: ${novel.aiProvider}, defaulting to Gemini.`);
             // Default to Gemini if provider is somehow invalid
             yield* translateWithGeminiStream(text, novel);
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
            console.warn(`Unknown AI provider: ${provider}, defaulting to Gemini.`);
             // Default to Gemini if provider is somehow invalid
            return generateGlossaryWithGemini(context, sourceLanguage);
    }
};
