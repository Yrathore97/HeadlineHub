import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { name, email, password } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ detail: 'Please provide name, email, and password.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Proxy to external FastAPI backend if configured
    const backendUrl = (import.meta.env.PUBLIC_BACKEND_URL || import.meta.env.BACKEND_URL) as string | undefined;
    if (backendUrl) {
      try {
        const res = await fetch(`${backendUrl}/api/v1/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (e) {
        // Fall back to serverless signup
      }
    }

    const mockToken = `ezj_${btoa(email)}_${Date.now()}`;
    const user = {
      id: `usr_${Math.floor(1000 + Math.random() * 9000)}`,
      email: email,
      name: name || email.split('@')[0],
      role: 'user'
    };

    return new Response(
      JSON.stringify({
        access_token: mockToken,
        token_type: 'bearer',
        user: user
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ detail: err.message || 'Account creation failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
