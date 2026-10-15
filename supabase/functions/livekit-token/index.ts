// ============================================================================
// Supabase Edge Function: livekit-token
// Purpose: Secure, server-side LiveKit access token generation for Route M8.
// Security:
//   1. Validates caller's Supabase JWT session via auth.getUser().
//   2. Ensures delivery exists and status is 'matched' or 'in_transit'.
//   3. Ensures caller is strictly the delivery requester or assigned transporter.
//   4. Enforces room name pattern 'delivery-<deliveryId>' (blocks arbitrary room access).
//   5. LiveKit API Secret is never exposed to client applications.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AccessToken } from 'npm:livekit-server-sdk';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // 1. Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed. Only POST is accepted.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. Verify Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or malformed Authorization bearer header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: 'Supabase server environment variables not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 3. Authenticate caller
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid or expired authentication session.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Parse request payload
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON request payload.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { deliveryId } = body;
    if (!deliveryId || typeof deliveryId !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid parameter: "deliveryId" (UUID string) is required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 5. Query delivery request and verify authorization
    const { data: delivery, error: deliveryError } = await supabase
      .from('delivery_requests')
      .select('id, requester_id, transporter_id, status, title')
      .eq('id', deliveryId)
      .maybeSingle();

    if (deliveryError) {
      return new Response(
        JSON.stringify({ error: `Database error querying delivery: ${deliveryError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!delivery) {
      return new Response(
        JSON.stringify({ error: 'Delivery request not found.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 6. Enforce delivery active state: must be 'matched' or 'in_transit'
    if (delivery.status !== 'matched' && delivery.status !== 'in_transit') {
      return new Response(
        JSON.stringify({
          error: `Audio calling is only permitted for active deliveries in 'matched' or 'in_transit' status. Current status is '${delivery.status}'.`,
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 7. Enforce participant authorization: must be requester or assigned transporter
    const isRequester = user.id === delivery.requester_id;
    const isTransporter = user.id === delivery.transporter_id;

    if (!isRequester && !isTransporter) {
      return new Response(
        JSON.stringify({
          error: 'Forbidden: You are not an authorized participant (requester or transporter) for this delivery.',
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 8. Enforce deterministic delivery room name
    const roomName = `delivery-${delivery.id}`;
    const participantRole = isTransporter ? 'Transporter' : 'Customer';
    const participantName = `${participantRole} (${user.email ? user.email.split('@')[0] : user.id.slice(0, 8)})`;

    // 9. Read LiveKit Server Credentials
    const livekitApiKey = Deno.env.get('LIVEKIT_API_KEY');
    const livekitApiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const livekitUrl = Deno.env.get('LIVEKIT_URL') || Deno.env.get('VITE_LIVEKIT_URL') || '';

    if (!livekitApiKey || !livekitApiSecret || !livekitUrl) {
      return new Response(
        JSON.stringify({
          error: 'LiveKit server credentials are not fully configured on the Edge Function. Please set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL secrets.',
          missingConfig: true,
          configured: {
            hasApiKey: Boolean(livekitApiKey),
            hasApiSecret: Boolean(livekitApiSecret),
            hasUrl: Boolean(livekitUrl),
          },
        }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 10. Generate scoped AccessToken
    const at = new AccessToken(livekitApiKey, livekitApiSecret, {
      identity: user.id,
      name: participantName,
      metadata: JSON.stringify({
        deliveryId: delivery.id,
        role: participantRole,
        title: delivery.title,
      }),
    });

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return new Response(
      JSON.stringify({
        token,
        serverUrl: livekitUrl,
        room: roomName,
        participantIdentity: user.id,
        participantName,
        role: participantRole,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Internal server error generating LiveKit token.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
