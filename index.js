const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = "Dignity@4321";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;   // From Render
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // From Render
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;   // From Render

// Webhook verification
app.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.status(403).end();
  }
});

// Webhook events
app.post('/', async (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      const entry = body.entry?.[0]?.changes?.[0]?.value;
      const message = entry?.messages?.[0];

      if (message && message.text) {
        const from = message.from;
        const userText = message.text.body;

        console.log(`📩 Message from ${from}: ${userText}`);

        // 🔹 Call OpenAI API
        const aiResponse = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",  // lightweight + fast
            messages: [
              { role: "system", content: "You are a friendly WhatsApp chatbot." },
              { role: "user", content: userText }
            ]
          },
          {
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        const botReply = aiResponse.data.choices[0].message.content;

        // 🔹 Send reply back via WhatsApp API
        await axios.post(
          `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: { body: botReply }
          },
          {
            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              "Content-Type": "application/json"
            }
          }
        );
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error:", err.message);
    res.sendStatus(500);
  }
});

app.listen(port, () => console.log(`✅ AI Chatbot running on port ${port}`));
