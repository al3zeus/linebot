import axios from "axios";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const body = req.body;
  const events = body.events || [];

  for (const event of events) {
    if (event.type === "message") {
      const text = event.message.text;
      const replyToken = event.replyToken;

      await reply(replyToken, "คุณพิมพ์: " + text);
    }
  }

  return res.status(200).end();
}

async function reply(token, message) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: token,
      messages: [
        {
          type: "text",
          text: message
        }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}