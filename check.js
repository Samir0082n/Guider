const axios = require('axios');
require('dotenv').config();

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("ОШИБКА: Нет ключа в файле .env");
    return;
}

console.log("Проверяем доступные модели для вашего ключа...");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

axios.get(url)
    .then(response => {
        console.log("\n✅ УСПЕХ! Ваш ключ работает.");
        console.log("Вот список моделей, которые вы можете использовать:");
        console.log("------------------------------------------------");

        const models = response.data.models;
        // Фильтруем только нужные нам модели (Gemini)
        const geminiModels = models.filter(m => m.name.includes('gemini'));

        geminiModels.forEach(model => {
            // Убираем приставку "models/", оставляем чистое имя
            console.log(`"${model.name.replace('models/', '')}"`);
        });
        console.log("------------------------------------------------");
    })
    .catch(error => {
        console.error("\n❌ ОШИБКА ПОДКЛЮЧЕНИЯ:");
        if (error.response) {
            console.error(`Код ошибки: ${error.response.status}`);
            console.error("Ответ сервера:", JSON.stringify(error.response.data, null, 2));
        } else {
            console.error(error.message);
            console.error("Совет: Проверьте интернет или включите VPN.");
        }
    });