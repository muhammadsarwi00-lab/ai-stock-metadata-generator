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
        error: "GEMINI_API_KEY is not configured"
      });
    }

    const prompt = `
You are an expert stock photography metadata specialist.

Analyze the uploaded image carefully and create professional metadata for stock content creators.

Content category:
${category || "General"}

Additional user description:
${description || "None"}

IMPORTANT:
Only describe things that are visible or reasonably supported by the image.
Do not invent brands, locations, people identities, events, or unsupported details.

Return metadata in JSON format.

Requirements:

1. TITLE
- Write one concise professional English stock title.
- Clearly describe the main subject and context.
- Avoid unnecessary marketing language.

2. DESCRIPTION
- Write one professional English description.
- Describe the visible subject, environment, activity, composition, and useful concepts.
- Do not make unsupported claims.

3. KEYWORDS
- Generate exactly 49 unique English keywords.
- Put the most important keywords first.
- Use relevant single words or short phrases.
- Do not duplicate keywords.
- Avoid brands and trademarks.
- Make keywords useful for stock marketplaces.

Return ONLY the requested JSON.
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
                  inlineData: {
                    mimeType: mimeType || "image/jpeg",
                    data: image
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],

          generationConfig: {
            responseMimeType: "application/json",

            responseSchema: {
              type: "OBJECT",

              properties: {
                title: {
                  type: "STRING"
                },

                description: {
                  type: "STRING"
                },

                keywords: {
                  type: "ARRAY",

                  items: {
                    type: "STRING"
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
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error: "Gemini API request failed",
        details: data
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(500).json({
        error: "Gemini returned no text response"
      });
    }

    let metadata;

    try {
      metadata = JSON.parse(text);
    } catch (parseError) {
      console.error("Invalid JSON from Gemini:", text);

      return res.status(500).json({
        error: "Gemini returned invalid JSON"
      });
    }

    if (!Array.isArray(metadata.keywords)) {
      metadata.keywords = [];
    }

    metadata.keywords = [
      ...new Set(
        metadata.keywords
          .map(keyword => String(keyword).trim())
          .filter(Boolean)
      )
    ].slice(0, 49);

    return res.status(200).json(metadata);

  } catch (error) {

    console.error("Server error:", error);

    return res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
}
