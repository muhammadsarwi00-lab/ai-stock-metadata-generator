export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      image,
      mimeType,
      category,
      description
    } = req.body || {};

    if (!image) {
      return res.status(400).json({
        error: "Image is required"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY is not configured in Vercel"
      });
    }

    const prompt = `
You are an expert stock photography metadata specialist.

Analyze the uploaded image carefully.

Content category:
${category || "General"}

Additional description:
${description || "None"}

Create professional metadata for stock marketplaces.

IMPORTANT:
- Only describe what is visible or reasonably supported by the image.
- Do not invent brands, locations, identities, events, or unsupported details.
- Avoid trademarks and brand names.

Requirements:

TITLE:
Write one concise professional English stock title.

DESCRIPTION:
Write one professional English description describing the visible subject, environment, activity, composition and useful concepts.

KEYWORDS:
Generate exactly 49 unique English keywords.
Put the most important keywords first.
Use relevant single words or short phrases.
Do not duplicate keywords.
Do not use brands or trademarks.

Return ONLY valid JSON.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },

        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: prompt
                },
                {
                  inline_data: {
                    mime_type: mimeType || "image/jpeg",
                    data: image
                  }
                }
              ]
            }
          ],

          generationConfig: {
            responseFormat: {
              text: {
                mimeType: "application/json",

                schema: {
                  type: "object",

                  properties: {
                    title: {
                      type: "string"
                    },

                    description: {
                      type: "string"
                    },

                    keywords: {
                      type: "array",

                      items: {
                        type: "string"
                      },

                      minItems: 49,
                      maxItems: 49
                    }
                  },

                  required: [
                    "title",
                    "description",
                    "keywords"
                  ]
                }
              }
            }
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error: "Gemini API request failed",
        details: data?.error?.message || data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned no response",
        details: data
      });
    }

    let metadata;

    try {
      metadata = JSON.parse(text);
    } catch (error) {
      return res.status(500).json({
        error: "Gemini returned invalid JSON",
        details: text
      });
    }

    const keywords = Array.isArray(metadata.keywords)
      ? metadata.keywords
          .map(k => String(k).trim())
          .filter(Boolean)
      : [];

    metadata.keywords = [
      ...new Set(keywords)
    ].slice(0, 49);

    return res.status(200).json(metadata);

  } catch (error) {

    console.error("Server error:", error);

    return res.status(500).json({
      error: "Internal server error",
      details: error.message
    });
  }
}
