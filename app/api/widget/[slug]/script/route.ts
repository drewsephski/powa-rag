import { NextResponse } from "next/server"
import { query } from "@/lib/db/client"

/**
 * GET — serves the widget embed JavaScript.
 *
 * This is what the client's website loads via the <script> tag.
 * It injects a floating chat button + iframe into the host page.
 *
 * The script URL matches the embed code format:
 *   /api/widget/{slug}/script?token={embed_token}
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params

  // Look up the bot to verify it exists and is active
  const bots = await query<{
    id: string
    name: string
    widget_config: Record<string, unknown>
  }>(
    `SELECT id, name, widget_config
     FROM client_bots
     WHERE slug = $1 AND status = 'active'`,
    [slug]
  )

  if (bots.length === 0) {
    return new Response("/* Bot not found */", {
      status: 200,
      headers: { "Content-Type": "application/javascript" },
    })
  }

  const bot = bots[0]

  // Derive the site URL from the request so the iframe points to our app,
  // not to the Powabase API server (POWABASE_URL).
  const host = request.headers.get("host") || "localhost:3000"
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https"
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : `${protocol}://${host}`)
  const primaryColor = (bot.widget_config as Record<string, string>)?.primary_color || "#2563eb"
  const position = (bot.widget_config as Record<string, string>)?.position || "right"

  const script = generateWidgetScript({
    slug,
    baseUrl,
    primaryColor,
    position,
    botName: (bot.widget_config as Record<string, string>)?.bot_name || bot.name,
  })

  return new Response(script, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

interface ScriptConfig {
  slug: string
  baseUrl: string
  primaryColor: string
  position: string
  botName: string
}

function generateWidgetScript(config: ScriptConfig): string {
  const { slug, baseUrl, primaryColor, position, botName } = config
  const side = position === "left" ? "left" : "right"

  return `
(function() {
  'use strict';

  // ── Extract token from the script tag ──
  var scripts = document.getElementsByTagName('script');
  var thisScript = scripts[scripts.length - 1];
  var token = thisScript.src.match(/token=([a-f0-9]+)/)?.[1] || '';

  if (!token) return;

  var BASE = '${baseUrl}';
  var SLUG = '${slug}';
  var TOKEN = token;
  var PRIMARY = '${primaryColor}';
  var SIDE = '${side}';
  var BOT_NAME = '${botName.replace(/'/g, "\\'")}';

  // ── Create container ──
  var container = document.createElement('div');
  container.id = 'sqx-widget-container';
  container.innerHTML = '\\x3C!-- Squidex Chat Widget --\\x3E';

  var styles = document.createElement('style');
  styles.textContent = [
    '#sqx-widget-container { all: initial; }',
    '#sqx-widget-container * { box-sizing: border-box; }',
    '#sqx-widget-button {',
    '  position: fixed;',
    '  ' + SIDE + ': 20px;',
    '  bottom: 20px;',
    '  z-index: 2147483646;',
    '  width: 56px;',
    '  height: 56px;',
    '  border-radius: 50%;',
    '  background: ' + PRIMARY + ';',
    '  border: none;',
    '  cursor: pointer;',
    '  box-shadow: 0 4px 12px rgba(0,0,0,0.25);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  transition: transform 0.2s ease, box-shadow 0.2s ease;',
    '}',
    '#sqx-widget-button:hover {',
    '  transform: scale(1.08);',
    '  box-shadow: 0 6px 20px rgba(0,0,0,0.3);',
    '}',
    '#sqx-widget-button svg { width: 26px; height: 26px; }',
    '#sqx-widget-iframe {',
    '  position: fixed;',
    '  ' + SIDE + ': 20px;',
    '  bottom: 88px;',
    '  z-index: 2147483647;',
    '  width: 380px;',
    '  height: 600px;',
    '  max-width: calc(100vw - 40px);',
    '  max-height: calc(100vh - 108px);',
    '  border: none;',
    '  border-radius: 16px;',
    '  box-shadow: 0 8px 32px rgba(0,0,0,0.2);',
    '  background: #fff;',
    '  display: none;',
    '  transition: opacity 0.2s ease;',
    '}',
    '#sqx-widget-iframe.open { display: block; }',
    '@media (max-width: 480px) {',
    '  #sqx-widget-iframe {',
    '    ' + SIDE + ': 0;',
    '    bottom: 0;',
    '    width: 100vw;',
    '    height: 100vh;',
    '    max-width: 100vw;',
    '    max-height: 100vh;',
    '    border-radius: 0;',
    '  }',
    '}',
  ].join('');

  // Chat button SVG (chat bubble icon)
  var button = document.createElement('button');
  button.id = 'sqx-widget-button';
  button.setAttribute('aria-label', 'Open chat with ' + BOT_NAME);
  button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>';

  // IFrame
  var iframe = document.createElement('iframe');
  iframe.id = 'sqx-widget-iframe';
  iframe.setAttribute('src', BASE + '/embed/' + SLUG + '?token=' + TOKEN);
  iframe.setAttribute('allow', 'clipboard-write');
  iframe.setAttribute('title', BOT_NAME + ' Chat');
  iframe.setAttribute('loading', 'lazy');

  // ── Toggle widget ──
  var open = false;
  button.addEventListener('click', function() {
    open = !open;
    iframe.classList.toggle('open', open);
    button.innerHTML = open
      ? '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/></svg>';
  });

  // ── Handle postMessage from iframe ──
  window.addEventListener('message', function(e) {
    if (e.source !== iframe.contentWindow) return;
    var msg = e.data;
    if (msg.type === 'sqx-resize') {
      iframe.style.height = msg.height + 'px';
    }
    if (msg.type === 'sqx-close') {
      if (open) button.click();
    }
  });

  // ── Inject into page ──
  container.appendChild(styles);
  container.appendChild(button);
  container.appendChild(iframe);
  document.body.appendChild(container);
})();
`
}
