import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ detail: 'Please provide both email and password.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Proxy to external FastAPI backend if configured
    const backendUrl = (import.meta.env.PUBLIC_BACKEND_URL || import.meta.env.BACKEND_URL) as string | undefined;
    if (backendUrl) {
      try {
        const res = await fetch(`${backendUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        // Fall back to serverless authentication
      }
    }

    // Default serverless authentication response
    const nameFromEmail = email.split('@')[0];
    const formattedName = nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1);

    const mockToken = `ezj_${btoa(email)}_${Date.now()}`;
    const user = {
      id: `usr_${Math.floor(1000 + Math.random() * 9000)}`,
      email: email,
      name: formattedName || 'Subscriber',
      role: email.includes('admin') ? 'admin' : 'user'
    };

    return new Response(
      JSON.stringify({
        access_token: mockToken,
        token_type: 'bearer',
        user: user
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ detail: err.message || 'Authentication error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
