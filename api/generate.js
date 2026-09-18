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
        error:
          "GEMINI_API_KEY is not configured in Vercel"
      });
    }

    const prompt = `
You are a professional stock photography metadata specialist.

Analyze the uploaded image carefully and create metadata suitable for commercial stock photography marketplaces such as Adobe Stock.

CONTENT CATEGORY:
${category || "General"}

USER DESCRIPTION:
${description || "None"}

IMPORTANT IMAGE ANALYSIS RULES:
- Analyze only what is actually visible in the image.
- Do not invent information.
- Do not guess exact locations.
- Do not identify people.
- Do not invent brands or trademarks.
- Do not mention fictional objects or activities.
- If something is uncertain, do not include it.
- Prioritize visually important subjects.
- Consider composition, food/object type, colors, setting, activity, concept, and commercial stock usage.

TITLE:
Create one concise, natural English stock title.
The title should describe the main visible subject clearly.
Avoid unnecessary adjectives.
Do not use brands.
Do not use keyword stuffing.
Prefer approximately 8-18 words.

DESCRIPTION:
Write one professional English stock description.
Describe the main subject, visible environment, activity, composition, and useful commercial concepts.
Keep it natural and factual.
Do not invent information.

KEYWORDS:
Generate exactly 49 unique English keywords or short keyword phrases.

KEYWORD ORDER:
Place the most important and visually relevant keywords first.

KEYWORD RULES:
- Exactly 49 keywords.
- Every keyword must be unique.
- English language.
- Relevant to the image.
- Prioritize the main subject.
- Include useful concepts for stock buyers.
- Include visual characteristics when relevant.
- Include food/object/material/context terms when visible.
- Do not include brands.
- Do not include trademarks.
- Do not include people's names.
- Do not include unsupported locations.
- Do not include unrelated generic words.
- Avoid keyword stuffing.
- Use single words or short phrases.
- Do not repeat the same concept unnecessarily.

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

    const models = [
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite"
    ];

    let response = null;
    let data = null;

    for (let i = 0; i < models.length; i++) {

      const model = models[i];

      console.log(
        `Trying model: ${model}`
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

      if (response.ok) {
        break;
      }

      console.error(
        `${model} failed:`,
        data
      );

      if (
        response.status !== 429 &&
        response.status !== 500 &&
        response.status !== 502 &&
        response.status !== 503 &&
        response.status !== 504
      ) {
        break;
      }

      if (i < models.length - 1) {
        await new Promise(
          resolve => setTimeout(resolve, 1200)
        );
      }
    }

    if (!response || !response.ok) {

      return res.status(
        response?.status || 500
      ).json({

        error:
          "Gemini API request failed",

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

        error:
          "Gemini returned no response",

        details:
          JSON.stringify(data)

      });
    }

    let metadata;

    try {

      metadata = JSON.parse(text);

    } catch (error) {

      return res.status(500).json({

        error:
          "Gemini returned invalid JSON",

        details:
          text

      });
    }

    let keywords =
      Array.isArray(metadata.keywords)
        ? metadata.keywords
        : [];

    keywords = keywords
      .map(keyword =>
        String(keyword)
          .trim()
      )
      .filter(Boolean);

    const uniqueKeywords = [];

    for (const keyword of keywords) {

      const normalized =
        keyword.toLowerCase();

      if (
        !uniqueKeywords.some(
          existing =>
            existing.toLowerCase() === normalized
        )
      ) {
        uniqueKeywords.push(keyword);
      }
    }

    if (uniqueKeywords.length < 49) {

      return res.status(500).json({

        error:
          "Gemini generated fewer than 49 unique keywords",

        details:
          `Generated ${uniqueKeywords.length} unique keywords.`

      });
    }

    const finalKeywords =
      uniqueKeywords.slice(0, 49);

    return res.status(200).json({

      title:
        String(metadata.title || "").trim(),

      description:
        String(metadata.description || "").trim(),

      keywords:
        finalKeywords

    });

  } catch (error) {

    console.error(
      "Server error:",
      error
    );

    return res.status(500).json({

      error:
        "Internal server error",

      details:
        error.message

    });
  }
}
