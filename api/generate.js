const allowedOrigins = [
  "https://ai-stock-metadata-generator.vercel.app",
  "https://muhammadsarwi00-lab.github.io"
];

export default async function handler(req, res) {

  // ==============================
  // CORS
  // ==============================

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

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  // ==============================
  // METHOD CHECK
  // ==============================

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }


  try {

    // ==============================
    // GET REQUEST DATA
    // ==============================

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


    // ==============================
    // GEMINI API KEY
    // ==============================

    const apiKey =
      process.env.GEMINI_API_KEY;


    if (!apiKey) {
      return res.status(500).json({
        error:
          "GEMINI_API_KEY is not configured in Vercel"
      });
    }


    // ==============================
    // PROMPT
    // ==============================

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

Rules for keywords:
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


    // ==============================
    // GEMINI REQUEST
    // ==============================

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
                    mime_type:
                      mimeType || "image/jpeg",

                    data: image
                  }
                }

              ]
            }
          ],


          // ==========================
          // STRUCTURED JSON OUTPUT
          // ==========================

          generationConfig: {

            responseMimeType:
              "application/json",

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

        })

      }
    );


    // ==============================
    // READ GEMINI RESPONSE
    // ==============================

    const data =
      await response.json();


    // ==============================
    // GEMINI ERROR
    // ==============================

    if (!response.ok) {

      console.error(
        "Gemini API error:",
        data
      );

      return res.status(response.status).json({

        error:
          "Gemini API request failed",

        details:
          data?.error?.message ||
          JSON.stringify(data)

      });

    }


    // ==============================
    // GET GENERATED TEXT
    // ==============================

    const text =
      data
        ?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;


    if (!text) {

      console.error(
        "Gemini returned no text:",
        data
      );

      return res.status(500).json({

        error:
          "Gemini returned no response",

        details:
          JSON.stringify(data)

      });

    }


    // ==============================
    // PARSE JSON
    // ==============================

    let metadata;

    try {

      metadata =
        JSON.parse(text);

    } catch (error) {

      console.error(
        "Invalid JSON from Gemini:",
        text
      );

      return res.status(500).json({

        error:
          "Gemini returned invalid JSON",

        details:
          text

      });

    }


    // ==============================
    // CLEAN KEYWORDS
    // ==============================

    let keywords =
      Array.isArray(metadata.keywords)
        ? metadata.keywords
        : [];


    keywords =
      keywords
        .map(
          keyword =>
            String(keyword)
              .trim()
        )
        .filter(Boolean);


    // Remove duplicates

    keywords = [
      ...new Set(keywords)
    ];


    // Keep maximum 49

    keywords =
      keywords.slice(0, 49);


    metadata.keywords =
      keywords;


    // ==============================
    // SUCCESS
    // ==============================

    return res.status(200).json({

      title:
        metadata.title || "",

      description:
        metadata.description || "",

      keywords:
        metadata.keywords || []

    });


  } catch (error) {

    // ==============================
    // SERVER ERROR
    // ==============================

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
