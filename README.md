# SecondLife AI backend

I owns the photo analysis endpoint. Deploy the Vercel Node function from the repository root. Set `GEMINI_API_KEY` in the server environment. `GEMINI_MODEL` optionally overrides `gemini-3.1-flash-lite`. Verify free-tier availability and quota in Google AI Studio.

## Frontend contract

Send `POST /api/analyze` with `Content-Type: application/json`.

| Field | Value |
| --- | --- |
| `imageBase64` | Base64 string without the data URL prefix |
| `mimeType` | `image/jpeg`, `image/png`, or `image/webp`, matching the image bytes |
| `style` | Minimalist, Modern, Vintage, Japandi, Industrial, Bohemian, Creative, or Surprise me |
| `budgetThb` | Nonnegative integer maximum in Thai baht |
| `condition` | Description of the object's condition |
| `materials`, `difficulty` | Optional strings |

Accept source photos up to 5 MB. Resize and re-encode large photos before submission. Target at most 3 MB of image bytes so the base64 JSON fits Vercel's default 4.5 MB body limit. Use the MIME type of the re-encoded image.

A successful response contains `observations` and `assumptions` arrays plus exactly three `ideas`. Each idea has `title`, `description`, `newPurpose`, `estimatedCostThb`, `materials`, `difficulty`, `estimatedMinutes`, `safetyNotes`, `diySteps`, and `imageEditingPrompt`. Pass the selected idea's `imageEditingPrompt` to the visualization workflow. Render generated text as plain text.

Errors from the function have the shape `{ "error": { "code": "...", "message": "..." } }`. Handle HTTP 413 for oversized requests, 422 for unsuitable photos, 429 for quota or request limits, and 5xx for temporary analysis failure. The function's request limit is ten analysis calls per minute per running instance. Gemini enforces the project-wide quota.

Disclose Gemini processing before upload and ask users to exclude private photos and documents. The function does not persist photos.

## Test with Gemini before the frontend is ready

With Node.js 22 or newer, create a local .env file in the repository root and set GEMINI_API_KEY to your own key. Git ignores .env. From the repository root, run:

    node --env-file=.env scripts/smoke-test.mjs "C:\path\to\box.jpg"

Use a clear photo of a household object. The command calls the same handler as the Vercel function and prints the JSON response. It uses the Minimalist style and a THB 100 budget. Check that the observations describe the photographed object and that the three ideas include practical DIY steps. This tests the live Gemini call and backend validation. Test HTTP routing separately after deployment.
