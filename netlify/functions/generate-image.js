exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: ''
    };
  }

  try {
    const { prompt, quality, userId } = JSON.parse(event.body);
    const cost = quality === 'hd' ? 10 : 5;

    // Supabase REST API directly use karenge (no package needed)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    // Credits check
    const profileRes = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=credits`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });
    const profiles = await profileRes.json();
    const credits = profiles[0]?.credits;

    if (!credits || credits < cost) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Insufficient credits' })
      };
    }

    // Segmind image generate karo
    const segRes = await fetch('https://api.segmind.com/v1/flux1-schnell', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.SEGMIND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        steps: quality === 'hd' ? 8 : 4,
        seed: Math.floor(Math.random() * 999999),
        samples: 1,
        width: quality === 'hd' ? 1024 : 512,
        height: quality === 'hd' ? 1024 : 512,
        base64: true
      })
    });

    const imageData = await segRes.json();
    if (!imageData.image) throw new Error('Generation failed');

    const imageUrl = `data:image/jpeg;base64,${imageData.image}`;

    // Credits deduct karo
    await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ credits: credits - cost })
    });

    // History save karo
    await fetch(`${supabaseUrl}/rest/v1/generations`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: userId,
        type: 'image',
        prompt: prompt,
        credits_used: cost
      })
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ imageUrl, creditsRemaining: credits - cost })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
