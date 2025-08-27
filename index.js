const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = "Dignity@4321";

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;   // Render
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // Render
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;   // Render

// Store conversation history per user
const conversations = {};  // { "user_number": [ {role, content}, ... ] }

// Message queue
const messageQueue = [];
let isProcessingQueue = false;

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

// Add message to queue
function enqueueMessage(userId, userText) {
  messageQueue.push({ userId, userText });
  if (!isProcessingQueue) processQueue();
}

// Process queue sequentially
async function processQueue() {
  isProcessingQueue = true;

  while (messageQueue.length > 0) {
    const { userId, userText } = messageQueue.shift();
    try {
      console.log(`📩 Processing message from ${userId}: ${userText}`);

      // Initialize conversation if new user
      if (!conversations[userId]) {
        conversations[userId] = [
          { role: "system", content: "You are a helpful and friendly WhatsApp AI assistant." }
        ];
      }

      // Add user message to conversation
      conversations[userId].push({ role: "user", content: userText });

      // Call OpenAI API with retry
      const botReply = await getAIReply(userId, conversations[userId]);

      // Add assistant reply to conversation
      conversations[userId].push({ role: "assistant", content: botReply });

      // Keep memory short (last 20 messages)
      if (conversations[userId].length > 20) {
        conversations[userId] = conversations[userId].slice(-20);
      }

      // Send reply via WhatsApp
      await axios.post(
        `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: userId,
          text: { body: botReply }
        },
        {
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      // Small delay to avoid hitting OpenAI too fast
      await new Promise(r => setTimeout(r, 500)); // 0.5 second
    } catch (err) {
      console.error("❌ Error processing queue:", err.message);
    }
  }

  isProcessingQueue = false;
}

// Function to call OpenAI with retry on 429
async function getAIReply(userId, messages) {
  const maxRetries = 3;
  let attempt = 0;
  let botReply = "Sorry, I'm temporarily busy. Please try again.";

  while (attempt < maxRetries) {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4o-mini",
          messages: messages.slice(-6), // last 6 messages
          max_tokens: 200
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );
      botReply = response.data.choices[0].message.content;
      break; // success
    } catch (err) {
      if (err.response?.status === 429) {
        console.log(`⚠️ OpenAI rate limit hit for ${userId}, retrying in 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        attempt++;
      } else {
        console.error("❌ OpenAI error:", err.message);
        break;
      }
    }
  }

  return botReply;
}

// Webhook events
app.post('/', (req, res) => {
  try {
    const body = req.body;
    if (body.object) {
      const entry = body.entry?.[0]?.changes?.[0]?.value;
      const message = entry?.messages?.[0];

      if (message && message.text) {
        const from = message.from;
        const userText = message.text.body;

        // Push to queue instead of processing immediately
        enqueueMessage(from, userText);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Error in webhook:", err.message);
    res.sendStatus(500);
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ AI Chatbot with memory + queue running on port ${port}`);
});
