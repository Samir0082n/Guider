const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Разрешаем CORS для любых источников (важно для работы фронтенда)
app.use(cors());
app.use(express.json());

// Инициализация Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-2.5-flash-lite";

const model = genAI.getGenerativeModel({ model: MODEL_NAME });

// --- МАРШРУТ 1: Создание маршрута ---
app.post('/api/create-route', async (req, res) => {
    try {
        const { lat, lng, mode, type } = req.body;
        console.log(`[ROUTE] Request: ${mode}, ${type}`);

        const prompt = `
            Act as a local tour guide. I am at coordinates: ${lat}, ${lng}.
            Create a route strictly containing 4 REAL, EXISTING locations nearby (within 3km) suitable for a '${type}' vibe.
            
            CRITICAL INSTRUCTION:
            Return ONLY a valid JSON array. Do NOT use markdown code blocks like \`\`\`json. 
            Do NOT write any introduction text. Just the raw JSON string.
            
            JSON Structure:
            [
              { "name": "Place Name", "lat": 0.0, "lng": 0.0, "description": "Short description" }
            ]
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text(); 
        
        // Очистка
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let places;
        try {
            places = JSON.parse(text);
        } catch (e) {
            const match = text.match(/\[.*\]/s);
            if (match) {
                places = JSON.parse(match[0]);
            } else {
                throw new Error("AI returned invalid JSON");
            }
        }

        const fullRoute = [
            { name: "Start Point", lat: parseFloat(lat), lng: parseFloat(lng), description: "Your location" },
            ...places
        ];

        res.json({ places: fullRoute });

    } catch (error) {
        console.error("Route Error:", error.message);
        res.status(500).json({ error: "Failed to generate route." });
    }
});

// --- МАРШРУТ 2: Голосовой чат ---
app.post('/api/voice-chat', upload.fields([{ name: 'audio' }, { name: 'image' }]), async (req, res) => {
    try {
        console.log(`[VOICE] New request`);
        const parts = [{ text: "You are Cohana. Answer naturally, briefly and witty." }];

        if (req.files['audio']) {
            parts.push({
                inlineData: {
                    mimeType: 'audio/wav',
                    data: req.files['audio'][0].buffer.toString('base64')
                }
            });
        }
        if (req.files['image']) {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: req.files['image'][0].buffer.toString('base64')
                }
            });
            parts.push("Answer based on this image.");
        }

        const result = await model.generateContent(parts);
        const aiResponseText = result.response.text();

        // ElevenLabs
        const ttsResponse = await axios({
            method: 'post',
            url: `https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`,
            headers: {
                'xi-api-key': process.env.ELEVENLABS_API_KEY,
                'Content-Type': 'application/json'
            },
            data: {
                text: aiResponseText,
                model_id: "eleven_turbo_v2_5",
                voice_settings: { stability: 0.5, similarity_boost: 0.75 }
            },
            responseType: 'arraybuffer'
        });

        res.json({
            text: aiResponseText,
            audio: Buffer.from(ttsResponse.data).toString('base64')
        });

    } catch (error) {
        console.error("Voice Error:", error.message);
        res.status(500).json({ error: "Voice processing failed" });
    }
});

// ГЛАВНОЕ ИЗМЕНЕНИЕ ДЛЯ VERCEL:
// Мы экспортируем приложение, а не запускаем listen
module.exports = app;
