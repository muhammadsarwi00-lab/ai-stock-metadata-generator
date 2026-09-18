const allowedOrigins = [
  "https://ai-stock-metadata-generator.vercel.app",
  "https://muhammadsarwi00-lab.github.io"
];

export default async function handler(req, res) {

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader(
      "Access-Control-Allow-Origin",
      origin
    );
  }

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

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
- Only describe things that are visible or reasonably supported by the image.
- Do not invent brands, locations, identities, events, or unsupported details.
- Avoid trademarks and brand names.
- Do not identify people.
- Use professional stock marketplace language.

TITLE:
Write one concise professional English stock title.

DESCRIPTION:
Write one professional English description describing:
- main subject
- visible environment
- activity
- composition
- useful stock concepts

KEYWORDS:
Generate exactly 49 unique English keywords.

Rules:
- Most important keywords first.
- Relevant to the visible image.
- Use single words or short phrases.
- No duplicate keywords.
- No brands.
- No trademarks.
- No unsupported locations.
- No people's names.
- Avoid irrelevant generic keywords.

Return ONLY valid JSON.
`;

    const requestBody = {
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
        responseMimeType: "application/json",

        responseSchema: {
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
    };

    // Primary model
    const models = [
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite"
    ];

    let response = null;
    let data = null;

    for (let i = 0; i < models.length; i++) {

      const model = models[i];

      console.log(
        `Trying Gemini model: ${model}`
      );

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },

          body: JSON.stringify(requestBody)
        }
      );

      data = await response.json();

      // Success
      if (response.ok) {
        break;
      }

      console.error(
        `${model} failed:`,
        data
      );

      // Retry/fallback only for temporary overload/rate-limit errors
      if (
        response.status !== 429 &&
        response.status !== 500 &&
        response.status !== 502 &&
        response.status !== 503 &&
        response.status !== 504
      ) {
        break;
      }

      // Small delay before fallback model
      if (i < models.length - 1) {
        await new Promise(
          resolve => setTimeout(resolve, 1000)
        );
      }
    }

    if (!response || !response.ok) {

      return res.status(
        response?.status || 500
      ).json({

        error: "Gemini API request failed",

        details:
          data?.error?.message ||
          JSON.stringify(data)

      });
    }

    const text =
      data
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;

    if (!text) {

      return res.status(500).json({

        error: "Gemini returned no response",

        details:
          JSON.stringify(data)

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

    let keywords =
      Array.isArray(metadata.keywords)
        ? metadata.keywords
        : [];

    keywords = keywords
      .map(keyword =>
        String(keyword).trim()
      )
      .filter(Boolean);

    keywords = [
      ...new Set(keywords)
    ];

    metadata.keywords =
      keywords.slice(0, 49);

    return res.status(200).json({

      title:
        metadata.title || "",

      description:
        metadata.description || "",

      keywords:
        metadata.keywords || []

    });

  } catch (error) {

    console.error(
      "Server error:",
      error
    );

    return res.status(500).json({

      error: "Internal server error",

      details: error.message

    });
  }
}
