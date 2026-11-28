const failure = (res, status, code, message) =>
  res.status(status).json({ error: { code, message } });

const IMAGE_LIMIT = 3_000_000;

function detectMime(bytes) {
  if (bytes.subarray(0, 3).toString('hex') === 'ffd8ff') return 'image/jpeg';
  if (bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'image/png';
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) return 'image/webp';
  return null;
}

export default async function generateImage(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return failure(res, 405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  }

  const { imageBase64, mimeType, prompt } = req.body ?? {};

  if (
    typeof imageBase64 !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof prompt !== 'string' ||
    !prompt.trim() ||
    prompt.length > 5000
  ) {
    return failure(res, 400, 'INVALID_INPUT', 'Invalid image or prompt.');
  }

  const bytes = Buffer.from(imageBase64, 'base64');
  const actualMime = detectMime(bytes);

  if (
    !actualMime ||
    actualMime !== mimeType ||
    bytes.length > IMAGE_LIMIT ||
    bytes.toString('base64') !== imageBase64
  ) {
    return failure(res, 400, 'INVALID_IMAGE', 'Upload a valid JPG, PNG, or WEBP image of 3 MB or less.');
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const model = '@cf/black-forest-labs/flux-2-klein-4b';

  if (!accountId || !apiToken) {
    return failure(
      res,
      503,
      'AI_UNAVAILABLE',
      'Cloudflare Workers AI credentials are missing on the server.'
    );
  }

  try {
    const form = new FormData();

    const enhancedPrompt =
      'Use image 0 as the source photo. Edit that photo to match the redesign. ' +
      'Preserve the original object identity, main shape, proportions, and camera viewpoint. ' +
      'Keep the result photorealistic and realistic for a furniture/object redesign. ' +
      'Change only what is needed for the redesign. ' +
      'Redesign instructions: ' + prompt;

    form.append('prompt', enhancedPrompt);
    form.append('width', '1024');
    form.append('height', '768');
    form.append('guidance', '4');

    const blob = new Blob([bytes], { type: mimeType });
    form.append('input_image_0', blob, 'reference-image');

    const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${model}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
        },
        body: form,
        signal: AbortSignal.timeout(90000),
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.success) {
      console.error('[Cloudflare Image Error]', {
        status: response.status,
        errors: data?.errors,
        messages: data?.messages,
      });

      if (response.status === 401 || response.status === 403) {
        return failure(
          res,
          503,
          'AI_UNAVAILABLE',
          'Cloudflare Workers AI access is unavailable. Check your API token and account permissions.'
        );
      }

      if (response.status === 429) {
        return failure(
          res,
          429,
          'RATE_LIMITED',
          'The image generation limit has been reached. Try again later.'
        );
      }

      return failure(
        res,
        502,
        'IMAGE_GENERATION_FAILED',
        data?.errors?.[0]?.message ||
          data?.messages?.[0] ||
          'Cloudflare image generation failed.'
      );
    }

    const generatedBase64 = data?.result?.image;

    if (typeof generatedBase64 !== 'string' || !generatedBase64.trim()) {
      return failure(
        res,
        502,
        'NO_IMAGE_RETURNED',
        'Cloudflare did not return a generated image.'
      );
    }

    const outBytes = Buffer.from(generatedBase64, 'base64');
    const outMime = detectMime(outBytes) || 'image/png';

    return res.status(200).json({
      imageBase64: generatedBase64,
      mimeType: outMime,
    });
  } catch (error) {
    console.error('[Cloudflare Image Error]', error);

    if (error.name === 'TimeoutError') {
      return failure(
        res,
        504,
        'IMAGE_TIMEOUT',
        'Image generation timed out. Please try again.'
      );
    }

    return failure(
      res,
      502,
      'IMAGE_GENERATION_FAILED',
      'Image generation is temporarily unavailable.'
    );
  }
}