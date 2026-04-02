import { NextResponse } from 'next/server';

// Privacy note: this endpoint does not store user data; it only proxies city->forecast lookup.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const city = searchParams.get('city');

  if (!city) {
    return NextResponse.json({ error: 'Missing city query param.' }, { status: 400 });
  }

  try {
    const geoResp = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`,
      { cache: 'no-store' }
    );
    if (!geoResp.ok) {
      throw new Error('Unable to geocode location.');
    }

    const geoData = (await geoResp.json()) as {
      results?: Array<{ latitude: number; longitude: number; name: string; country?: string }>;
    };

    const location = geoData.results?.[0];
    if (!location) {
      return NextResponse.json({ error: `Could not find weather for ${city}.` }, { status: 404 });
    }

    const weatherResp = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`,
      { cache: 'no-store' }
    );

    if (!weatherResp.ok) {
      throw new Error('Unable to fetch weather data.');
    }

    const weatherData = (await weatherResp.json()) as {
      current?: { temperature_2m: number; apparent_temperature: number; weather_code: number };
    };

    return NextResponse.json({
      city: location.name,
      country: location.country,
      current: weatherData.current
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Weather request failed.' },
      { status: 500 }
    );
  }
}
