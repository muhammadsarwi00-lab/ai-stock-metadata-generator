export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { image, mimeType, category, description } = req.body;

    if (!image) {
      return res.status(400).json({
        error: "Image is required"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Gemini API key is not configured"
      });
    }

    const prompt = `
You are an expert stock photography metadata specialist.

Analyze the provided image carefully.

Create professional metadata suitable for stock content creators.

Category:
${category || "General"}

Additional user description:
${description || "None"}

Return ONLY valid JSON with this exact structure:

{
  "title": "A concise professional stock title",
  "description": "A detailed professional stock description",
  "keywords": [
    "keyword1",
    "keyword2"
  ]
}

Requirements:

- Title should be clear, descriptive and natural.
- Avoid unnecessary words.
- Description should accurately describe only what is visible or reasonably inferable.
- Generate exactly 49 relevant English keywords.
- Put the most important keywords first.
- Use single words or short keyword phrases.
- Do not include brands, trademarks, fictional claims, or unsupported details.
- Do not include duplicate keywords.
- Keywords should be useful for stock marketplaces.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.8-flash",

          input: [
            {
              type: "image",
              data: image,
              mime_type: mimeType || "image/jpeg"
            },
            {
              type: "text",
              text: prompt
            }
          ],

          response_format: {
            type: "text",
            mime_type: "application/json",
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
                  }
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

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Gemini error:", errorText);

      return res.status(response.status).json({
        error: "Gemini API request failed",
        details: errorText
      });
    }

    const data = await response.json();

    let outputText = "";

    if (data.output_text) {
      outputText = data.output_text;
    } else if (data.outputs) {
      const textOutput = data.outputs.find(
        item => item.type === "text"
      );

      if (textOutput) {
        outputText = textOutput.text;
      }
    }

    if (!outputText) {
      return res.status(500).json({
        error: "No AI output received"
      });
    }

    let metadata;

    try {
      metadata = JSON.parse(outputText);
    } catch (error) {
      console.error("JSON parsing error:", outputText);

      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw: outputText
      });
    }

    return res.status(200).json(metadata);

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      error: "Internal server error",
      message: error.message
    });
  }
}
