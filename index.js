const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = "Dignity@4321";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;   // Set in Render
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // Set in Render
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;   // Set in Render

// Store conversation history per user
const conversations = {};  // { "user_number": [ {role, content}, ... ] }

// Webhook verification
app.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Webhook verified');
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
        const from = message.from;        // user number
        const userText = message.text.body;

        console.log(`📩 Message from ${from}: ${userText}`);

        // Initialize history if new user
        if (!conversations[from]) {
          conversations[from] = [
            { role: "system", content: "You are a helpful and friendly WhatsApp AI assistant." }
          ];
        }

        // Add user message to conversation
        conversations[from].push({ role: "user", content: userText });

        // Call OpenAI with conversation history
        const aiResponse = await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-4o-mini",
            messages: conversations[from],
            max_tokens: 200
          },
          {
            headers: {
              "Authorization": `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json"
            }
          }
        );

        const botReply = aiResponse.data.choices[0].message.content;

        // Add assistant reply to conversation
        conversations[from].push({ role: "assistant", content: botReply });

        // Keep memory short (last 20 messages)
        if (conversations[from].length > 20) {
          conversations[from] = conversations[from].slice(-20);
        }

        // Send reply back via WhatsApp
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

// Start the server
app.listen(port, () => {
  console.log(`✅ AI Chatbot with memory running on port ${port}`);
});
