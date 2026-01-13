
import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const API_KEY = process.env.API_KEY || "";

export const generateQuestions = async (topic: string, count: number): Promise<Question[]> => {
  const ai = new GoogleGenAI({ apiKey: API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate ${count} multiple choice questions about "${topic}". Suggest a time limit in seconds for each question (e.g., 30 for easy, 60 for hard).`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            id: { type: Type.STRING },
            text: { type: Type.STRING },
            options: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            correctIndex: { type: Type.INTEGER },
            timeLimit: { type: Type.INTEGER }
          },
          required: ["id", "text", "options", "correctIndex", "timeLimit"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text);
  } catch (e) {
    console.error("Failed to parse AI response", e);
    return [];
  }
};
