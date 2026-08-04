import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request, redirect }) => {
  try {
    const urlObj = new URL(request.url);
    const code = urlObj.searchParams.get('code');
    const error = urlObj.searchParams.get('error');

    if (error) {
      return redirect(`/?auth_error=${encodeURIComponent(error)}`, 302);
    }

    const mockToken = `google_oauth_${btoa(code || 'user')}_${Date.now()}`;
    const userName = 'Google User';

    return redirect(`/?auth_token=${mockToken}&user_name=${encodeURIComponent(userName)}`, 302);

  } catch (err: any) {
    return redirect(`/?auth_error=OAuth+callback+error`, 302);
  }
};
