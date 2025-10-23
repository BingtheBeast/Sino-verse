import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";
import { LANGUAGE_CONFIG, GLOSSARY_SUGGESTION_PROMPT, DEFAULT_CHINESE_GLOSSARY, DEFAULT_KOREAN_GLOSSARY } from '../constants';
import { Novel } from "../types";

const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
const geminiApiKey = import.meta.env.VITE_GEMINI_API_KEY;

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
        const basePrompt = LANGUAGE_CONFIG[novel.sourceLanguage].prompt;
        const combinedGlossary = getCombinedGlossary(novel);
        const finalPrompt = basePrompt.replace('{{GLOSSARY}}', combinedGlossary);

        const streamResult = await geminiAi.models.generateContentStream({
            model: GEMINI_MODEL,
            contents: [
                { role: 'user', parts: [{ text: finalPrompt }] },
                { role: 'model', parts: [{ text: 'Understood. I will follow all directives and the two-step translation process. Provide the text to translate.' }] },
                { role: 'user', parts: [{ text }] }
            ],
            // safetySettings: [ // Optional: Uncomment and adjust if needed
            //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            //   { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            //   { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            //   { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            // ],
        });

        if (streamResult.response && !streamResult.stream) {
             const response = await streamResult.response;
             const promptFeedback = response.promptFeedback;
             if (promptFeedback?.blockReason) {
                 console.warn("Gemini translation blocked immediately:", promptFeedback.blockReason, promptFeedback.safetyRatings);
                 throw new Error(`Gemini translation blocked: ${promptFeedback.blockReason}`);
             }
             const candidate = response.candidates?.[0];
              if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
                 console.warn(`Gemini translation finished immediately due to ${candidate.finishReason}. Safety Ratings:`, candidate.safetyRatings);
                 if (candidate.finishReason === 'SAFETY') {
                      throw new Error(`Gemini translation blocked due to ${candidate.finishReason}`);
                 }
             }
        }

        if (streamResult.stream) {
            for await (const chunk of streamResult.stream) {
              try {
                const chunkFeedback = chunk.promptFeedback;
                 if (chunkFeedback?.blockReason) {
                    console.warn("Gemini stream chunk blocked:", chunkFeedback.blockReason, chunkFeedback.safetyRatings);
                    yield `\n[Translation blocked mid-stream: ${chunkFeedback.blockReason}]\n`;
                    return;
                 }
                const chunkText = chunk.text();
                if (chunkText) {
                    yield chunkText;
                }
              } catch (streamError) {
                 console.error('Error processing stream chunk:', streamError);
              }
            }
        } else if (!streamResult.response) {
            console.error("Gemini translation returned no stream and no initial response.");
            throw new Error("Gemini translation failed: No response or stream received.");
        }

    } catch (error) {
        console.error('Error translating with Gemini:', error);
         if (error instanceof Error) {
                 console.error('Gemini Error Message:', error.message);
                 console.error('Gemini Error Stack:', error.stack);
            }
        console.error('Raw Gemini Error Object:', JSON.stringify(error, null, 2));
        const message = error instanceof Error ? error.message : 'Unknown error';
        if (message.includes("blocked")) {
             throw new Error(`Gemini translation failed: ${message}`);
        }
        throw new Error(`Gemini translation failed: ${message}`);
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
            // safetySettings: [ // Optional: Uncomment and adjust if needed
            //   { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
            // ],
        });

        const response = result.response;

        if (!response) {
          console.error("Gemini glossary generation returned no response object. Full result:", JSON.stringify(result, null, 2));
          if (result?.promptFeedback?.blockReason) {
              console.warn("Glossary generation likely blocked:", result.promptFeedback.blockReason);
              return `# Glossary generation blocked: ${result.promptFeedback.blockReason}`;
          }
          throw new Error("Gemini glossary generation failed: No response object returned.");
        }

        const promptFeedback = response.promptFeedback;
        if (promptFeedback?.blockReason) {
            console.warn("Glossary generation blocked:", promptFeedback.blockReason, promptFeedback.safetyRatings);
            return `# Glossary generation blocked: ${promptFeedback.blockReason}`;
        }
        const candidate = response.candidates?.[0];
        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
             console.warn(`Glossary generation finished due to ${candidate.finishReason}. Safety Ratings:`, candidate.safetyRatings);
             if (candidate.finishReason === 'SAFETY') {
                  return `# Glossary generation blocked due to ${candidate.finishReason}`;
             }
        }

        try {
            const text = response.text();
             if (text === undefined || text === null) {
                 if (candidate?.finishReason === 'SAFETY' || promptFeedback?.blockReason) {
                     return `# Glossary generation blocked by safety settings.`;
                 }
                 console.error("Gemini glossary generation response has no text content. Full response:", JSON.stringify(response, null, 2));
                 throw new Error("Gemini glossary generation failed: Response text is missing.");
             }
            return text;
        } catch (e) {
             console.error("Error calling response.text():", e, "Full response:", JSON.stringify(response, null, 2));
             throw new Error("Gemini glossary generation failed: Could not extract text from response.");
        }

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

    const provider = novel.aiProvider === 'gemini' || novel.aiProvider === 'groq' ? novel.aiProvider : 'gemini';

    switch (provider) {
        case 'gemini':
            yield* translateWithGeminiStream(text, novel);
            break;
        case 'groq':
            yield* translateWithGroqStream(text, novel);
            break;
        default:
             console.warn(`Unknown AI provider encountered: ${novel.aiProvider}, defaulting to Gemini.`);
             yield* translateWithGeminiStream(text, novel);
    }
}

export const generateGlossarySuggestions = async (
    context: string,
    sourceLanguage: 'chinese' | 'korean',
    provider: 'gemini' | 'groq'
): Promise<string> => {
    if (!context) return '';

    const effectiveProvider = provider === 'gemini' || provider === 'groq' ? provider : 'gemini';

    switch (effectiveProvider) {
        case 'gemini':
            return generateGlossaryWithGemini(context, sourceLanguage);
        case 'groq':
            return generateGlossaryWithGroq(context, sourceLanguage);
        default:
            console.warn(`Unknown AI provider encountered: ${provider}, defaulting to Gemini.`);
            return generateGlossaryWithGemini(context, sourceLanguage);
    }
};
