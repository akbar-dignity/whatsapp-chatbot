const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const port = process.env.PORT || 3000;
const verifyToken = "Dignity@4321";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; // Set in Render later
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID; // Set in Render later

// Webhook verification
app.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('WEBHOOK VERIFIED');
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
        const from = message.from;  // User number
        const text = message.text.body;
        console.log(`📩 Message from ${from}: ${text}`);

        // Send reply
        await axios.post(
          `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
          {
            messaging_product: "whatsapp",
            to: from,
            text: { body: "Hello 👋, thanks for messaging!" }
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

app.listen(port, () => console.log(`✅ Server running on port ${port}`));
