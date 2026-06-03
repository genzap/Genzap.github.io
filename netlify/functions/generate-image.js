const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

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

    // Credits check karo
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single();

    if (!profile || profile.credits < cost) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Insufficient credits' })
      };
    }

    // Segmind API call
    const response = await fetch('https://api.segmind.com/v1/flux1-schnell', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.SEGMIND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: prompt,
        steps: quality === 'hd' ? 8 : 4,
        seed: Math.floor(Math.random() * 999999),
        sampler_name: 'euler',
        scheduler: 'simple',
        samples: 1,
        width: quality === 'hd' ? 1024 : 512,
        height: quality === 'hd' ? 1024 : 512,
        base64: true
      })
    });

    const imageData = await response.json();

    if (!imageData.image) {
      throw new Error('Image generation failed');
    }

    const imageUrl = `data:image/jpeg;base64,${imageData.image}`;

    // Credits deduct karo
    await supabase
      .from('profiles')
      .update({ credits: profile.credits - cost })
      .eq('id', userId);

    // History save karo
    await supabase.from('generations').insert({
      user_id: userId,
      type: 'image',
      prompt: prompt,
      credits_used: cost
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        imageUrl,
        creditsRemaining: profile.credits - cost
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
