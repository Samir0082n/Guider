const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ВАЖНО: Используем модель из ВАШЕГО списка
// gemini-2.5-flash-lite — это быстрая и современная модель
const MODEL_NAME = "gemini-2.5-flash-lite";

const model = genAI.getGenerativeModel({
    model: MODEL_NAME
    // Мы убрали strict JSON config, чтобы избежать ошибок совместимости.
    // Мы попросим JSON текстом в промпте — это надежнее.
});

// --- ЛОГИКА МАРШРУТОВ ---
app.post('/api/create-route', async (req, res) => {
    try {
        const { lat, lng, mode, type } = req.body;
        console.log(`[ROUTE] Запрос: ${mode}, ${type} @ ${lat},${lng}`);

        // Мощный промпт, чтобы заставить AI вернуть чистый JSON
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

        console.log("[AI RAW]:", text.substring(0, 50) + "...");

        // Очистка ответа от мусора (если AI все-таки добавит markdown)
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        let places;
        try {
            places = JSON.parse(text);
        } catch (e) {
            // Если парсинг не удался, пробуем найти массив внутри текста
            const match = text.match(/\[.*\]/s);
            if (match) {
                places = JSON.parse(match[0]);
            } else {
                throw new Error("AI вернул не JSON");
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

// --- ГОЛОСОВОЙ ЧАТ ---
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

        // Используем ту же модель, она мультимодальная
        const result = await model.generateContent(parts);
        const aiResponseText = result.response.text();

        // ElevenLabs TTS
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
